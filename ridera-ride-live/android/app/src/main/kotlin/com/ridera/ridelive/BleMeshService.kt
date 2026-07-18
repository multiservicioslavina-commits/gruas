package com.ridera.ridelive

import android.Manifest
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.ActivityCompat
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.random.Random

/**
 * Mesh BLE puro (sin Nearby Connections, sin Google Play Services).
 *
 * Funciona en cualquier Android 5+ con Bluetooth Low Energy.
 * Sobrevive al modo avión mientras Bluetooth quede activo.
 *
 * Arquitectura:
 *  - Advertiser: anuncia un Service UUID compartido para que otros nos descubran
 *  - Scanner: busca peers anunciando el mismo Service UUID
 *  - GATT Server: expone una Characteristic donde los peers escriben mensajes
 *  - GATT Client: cuando encontramos un peer, nos conectamos y escribimos allá
 *
 * Mesh flood con TTL 3: cada mensaje se reenvía a otros peers hasta 3 saltos.
 */
class BleMeshService(private val ctx: Context) {

    companion object {
        const val TAG = "RIDERA_BLE"

        // UUIDs de RIDERA — cualquier app con estos UUIDs es un peer válido.
        val SERVICE_UUID: UUID = UUID.fromString("f2b3a8c9-1234-5678-9abc-def012345678")
        val CHAR_MESSAGE_UUID: UUID = UUID.fromString("f2b3a8c9-1234-5678-9abc-def012345679")

        const val TTL_INITIAL: Byte = 3
        const val MSG_TYPE_POSITION: Byte = 0x01
        const val PAYLOAD_SIZE = 33

        // Duty cycling adaptativo: sin peers → escaneo agresivo para descubrir
        // rápido; con peers → ciclo más relajado para ahorrar batería.
        const val SCAN_ACTIVE_NO_PEERS_MS = 20_000L
        const val SCAN_REST_NO_PEERS_MS = 3_000L
        const val SCAN_ACTIVE_WITH_PEERS_MS = 12_000L
        const val SCAN_REST_WITH_PEERS_MS = 8_000L

        // Reconexión: reintentar peers perdidos hasta 5 veces con backoff.
        const val RECONNECT_BASE_DELAY_MS = 3_000L
        const val RECONNECT_MAX_ATTEMPTS = 5

        // Heartbeat: si un peer no envía datos en 45s, considerarlo muerto.
        const val PEER_TIMEOUT_MS = 45_000L
        const val PEER_CLEANUP_INTERVAL_MS = 15_000L

        /** Instancia global accesible desde otros servicios (ej: GpsService). */
        @Volatile
        var instance: BleMeshService? = null
            private set
    }

    interface Listener {
        fun onPeerMessage(uid: String, lat: Double, lon: Double,
                          speedKmh: Int, statusCode: Int, hops: Int)
        fun onPeerConnected(endpointId: String)
        fun onPeerDisconnected(endpointId: String)
        fun onStatus(kind: String, message: String)
    }

    private var listener: Listener? = null
    private var myUid: String = ""
    private var myName: String = ""
    private var running = false

    private val mainHandler = Handler(Looper.getMainLooper())

    // Peers conectados por BLE GATT client (nosotros → ellos)
    private val outgoingPeers = ConcurrentHashMap<String, BluetoothGatt>() // addr -> gatt
    private val outgoingCharCache = ConcurrentHashMap<String, BluetoothGattCharacteristic>()

    // Peers que se conectaron a nosotros como server (ellos → nosotros)
    private val incomingPeers = ConcurrentHashMap<String, BluetoothDevice>() // addr -> device

    // Set consolidado de peers únicos (por MAC address)
    private val uniquePeers = java.util.Collections.synchronizedSet(HashSet<String>())

    // Último mensaje recibido de cada peer (para detectar peers muertos)
    private val peerLastSeen = ConcurrentHashMap<String, Long>() // addr -> timestamp

    // Cache de msgIds para dedup mesh flood
    private val seenMessages = object : LinkedHashMap<Int, Long>(200, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Long>?): Boolean = size > 500
    }

    // Reconexión: peers que se desconectaron y estamos reintentando
    private val reconnectAttempts = ConcurrentHashMap<String, Int>() // addr -> intento actual
    private val reconnectDevices = ConcurrentHashMap<String, BluetoothDevice>()

    private var adapter: BluetoothAdapter? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var gattServer: BluetoothGattServer? = null
    private var scanCycleRunnable: Runnable? = null
    private var peerCleanupRunnable: Runnable? = null
    private var scanning = false

    // ─── Cola de escrituras GATT ──────────────────────────────────
    // Android BLE solo permite UNA operación GATT a la vez por conexión.
    // Sin cola, las escrituras simultáneas a múltiples peers se pierden.
    private data class GattWrite(val gatt: BluetoothGatt, val char: BluetoothGattCharacteristic, val data: ByteArray)
    private val writeQueue = ConcurrentLinkedQueue<GattWrite>()
    @Volatile private var writeInFlight = false

    // ─── API pública ──────────────────────────────────────────────

    fun start(uid: String, name: String, listener: Listener) {
        if (running) return
        this.myUid = uid
        this.myName = name
        this.listener = listener
        running = true
        instance = this

        val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        adapter = manager?.adapter
        if (adapter == null) {
            emitStatus("ble_not_supported", "Bluetooth no disponible")
            return
        }
        if (adapter?.isEnabled != true) {
            emitStatus("ble_off", "Bluetooth está apagado")
            return
        }
        if (!hasPermissions()) {
            emitStatus("perm_denied", "Faltan permisos de Bluetooth")
            return
        }

        try {
            startGattServer(manager!!)
            startAdvertising()
            startScanCycle()
            startPeerCleanup()
        } catch (e: Exception) {
            emitStatus("start_error", e.message ?: "error desconocido")
        }
    }

    fun stop() {
        running = false
        instance = null
        scanCycleRunnable?.let { mainHandler.removeCallbacks(it) }
        scanCycleRunnable = null
        peerCleanupRunnable?.let { mainHandler.removeCallbacks(it) }
        peerCleanupRunnable = null
        try { advertiser?.stopAdvertising(advertiseCallback) } catch (_: Exception) {}
        try { if (scanning) scanner?.stopScan(scanCallback); scanning = false } catch (_: Exception) {}
        try { gattServer?.close() } catch (_: Exception) {}
        for (gatt in outgoingPeers.values) {
            try { gatt.disconnect(); gatt.close() } catch (_: Exception) {}
        }
        outgoingPeers.clear()
        outgoingCharCache.clear()
        incomingPeers.clear()
        uniquePeers.clear()
        peerLastSeen.clear()
        reconnectAttempts.clear()
        reconnectDevices.clear()
        writeQueue.clear()
        writeInFlight = false
        gattServer = null
        listener = null
    }

    fun broadcastPosition(lat: Double, lon: Double, speedKmh: Int, statusCode: Int) {
        if (!running || myUid.isEmpty()) return
        val msgId = Random.nextInt()
        markSeen(msgId)
        val payload = packPosition(myUid, lat, lon, speedKmh, statusCode, TTL_INITIAL, msgId)
        sendToAllPeers(payload)
    }

    fun directPeers(): Int = uniquePeers.size

    // ─── GATT Server (recibir mensajes) ───────────────────────────

    private fun startGattServer(manager: BluetoothManager) {
        gattServer = manager.openGattServer(ctx, gattServerCallback)
        val service = BluetoothGattService(SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val characteristic = BluetoothGattCharacteristic(
            CHAR_MESSAGE_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE
                or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )
        service.addCharacteristic(characteristic)
        gattServer?.addService(service)
        emitStatus("gatt_server_ok", "Servidor GATT activo")
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    incomingPeers[device.address] = device
                    peerLastSeen[device.address] = System.currentTimeMillis()
                    notifyPeerAdded(device.address)
                    Log.d(TAG, "incoming connected: ${device.address}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    incomingPeers.remove(device.address)
                    notifyPeerRemoved(device.address)
                }
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice, requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray?,
        ) {
            if (value != null && characteristic.uuid == CHAR_MESSAGE_UUID) {
                peerLastSeen[device.address] = System.currentTimeMillis()
                handleIncomingBytes(value, fromAddress = device.address)
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId,
                    BluetoothGatt.GATT_SUCCESS, offset, null)
            }
        }
    }

    private fun handleIncomingBytes(bytes: ByteArray, fromAddress: String) {
        if (bytes.size < PAYLOAD_SIZE) return
        if (bytes[0] != MSG_TYPE_POSITION) return
        val (uid, lat, lon, speed, status, ttl, msgId) = unpackPosition(bytes)
        if (uid == myUid) return
        if (isSeen(msgId)) return
        markSeen(msgId)

        val hops = TTL_INITIAL - ttl
        listener?.onPeerMessage(uid, lat, lon, speed, status, hops.toInt())

        // Relay
        if (ttl > 1) {
            val relay = repackWithTtl(bytes, (ttl - 1).toByte())
            sendToAllPeers(relay, exclude = fromAddress)
        }
    }

    // ─── Advertising ──────────────────────────────────────────────

    private fun startAdvertising() {
        advertiser = adapter?.bluetoothLeAdvertiser
        if (advertiser == null) {
            emitStatus("adv_unsupported", "Advertising BLE no soportado en este celular")
            return
        }
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        try {
            advertiser?.startAdvertising(settings, data, advertiseCallback)
        } catch (se: SecurityException) {
            emitStatus("adv_perm", "Sin permiso BLUETOOTH_ADVERTISE")
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            emitStatus("advertising_ok", "Anunciando RIDERA")
        }
        override fun onStartFailure(errorCode: Int) {
            val reason = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "datos muy grandes"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "demasiados advertisers activos"
                ADVERTISE_FAILED_ALREADY_STARTED -> "ya estaba anunciando"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "error interno de BLE (reinicia Bluetooth)"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "advertising no soportado en este celular"
                else -> "error $errorCode"
            }
            emitStatus("advertising_fail", reason)
        }
    }

    // ─── Scanning con duty cycling adaptativo ────────────────────

    private fun startScanCycle() {
        scanner = adapter?.bluetoothLeScanner
        if (scanner == null) {
            emitStatus("scan_unsupported", "Scanner BLE no disponible")
            return
        }
        runScanCycle()
    }

    private fun runScanCycle() {
        if (!running) return
        try {
            val filter = ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(SERVICE_UUID))
                .build()
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            scanner?.startScan(listOf(filter), settings, scanCallback)
            scanning = true
        } catch (se: SecurityException) {
            emitStatus("scan_perm", "Sin permiso BLUETOOTH_SCAN")
            return
        }

        val hasPeers = uniquePeers.isNotEmpty()
        val activeMs = if (hasPeers) SCAN_ACTIVE_WITH_PEERS_MS else SCAN_ACTIVE_NO_PEERS_MS
        val restMs = if (hasPeers) SCAN_REST_WITH_PEERS_MS else SCAN_REST_NO_PEERS_MS

        scanCycleRunnable = Runnable {
            try {
                if (scanning) scanner?.stopScan(scanCallback)
                scanning = false
            } catch (_: Exception) {}
            scanCycleRunnable = Runnable { runScanCycle() }
            mainHandler.postDelayed(scanCycleRunnable!!, restMs)
        }
        mainHandler.postDelayed(scanCycleRunnable!!, activeMs)
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            if (outgoingPeers.containsKey(device.address)) return
            // Si estábamos intentando reconectar a este peer, cancelar
            reconnectAttempts.remove(device.address)
            reconnectDevices.remove(device.address)
            connectAsClient(device)
        }
        override fun onScanFailed(errorCode: Int) {
            val reason = when (errorCode) {
                SCAN_FAILED_ALREADY_STARTED -> "ya estaba escaneando"
                SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "app no registrada"
                SCAN_FAILED_INTERNAL_ERROR -> "error interno BLE"
                SCAN_FAILED_FEATURE_UNSUPPORTED -> "scanner no soportado"
                else -> "error $errorCode"
            }
            emitStatus("scan_fail", reason)
        }
    }

    // ─── GATT Client (enviar mensajes) ────────────────────────────

    private fun connectAsClient(device: BluetoothDevice) {
        try {
            val gatt = device.connectGatt(ctx, false, gattClientCallback,
                BluetoothDevice.TRANSPORT_LE)
            outgoingPeers[device.address] = gatt
            notifyPeerAdded(device.address)
        } catch (se: SecurityException) {
            emitStatus("connect_perm", "Sin permiso BLUETOOTH_CONNECT")
        }
    }

    private fun notifyPeerAdded(address: String) {
        val isNew = uniquePeers.add(address)
        if (isNew) {
            peerLastSeen[address] = System.currentTimeMillis()
            listener?.onPeerConnected(address)
        }
    }

    private fun notifyPeerRemoved(address: String) {
        val stillConnected = outgoingPeers.containsKey(address) ||
                             incomingPeers.containsKey(address)
        if (!stillConnected) {
            uniquePeers.remove(address)
            peerLastSeen.remove(address)
            listener?.onPeerDisconnected(address)
        }
    }

    private val gattClientCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    peerLastSeen[gatt.device.address] = System.currentTimeMillis()
                    try { gatt.discoverServices() } catch (_: SecurityException) {}
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val addr = gatt.device.address
                    outgoingPeers.remove(addr)
                    outgoingCharCache.remove(addr)
                    try { gatt.close() } catch (_: Exception) {}
                    notifyPeerRemoved(addr)
                    scheduleReconnect(gatt.device)
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return
            val service = gatt.getService(SERVICE_UUID) ?: return
            val char = service.getCharacteristic(CHAR_MESSAGE_UUID) ?: return
            outgoingCharCache[gatt.device.address] = char
            emitStatus("peer_ready", "Peer listo: ${gatt.device.address}")
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            writeInFlight = false
            drainWriteQueue()
        }
    }

    // ─── Reconexión automática ────────────────────────────────────

    private fun scheduleReconnect(device: BluetoothDevice) {
        if (!running) return
        val addr = device.address
        val attempt = (reconnectAttempts[addr] ?: 0) + 1
        if (attempt > RECONNECT_MAX_ATTEMPTS) {
            reconnectAttempts.remove(addr)
            reconnectDevices.remove(addr)
            emitStatus("reconnect_give_up", "Peer $addr: ${RECONNECT_MAX_ATTEMPTS} intentos agotados")
            return
        }
        reconnectAttempts[addr] = attempt
        reconnectDevices[addr] = device
        val delay = RECONNECT_BASE_DELAY_MS * attempt
        emitStatus("reconnect_scheduled", "Peer $addr: intento $attempt en ${delay/1000}s")
        mainHandler.postDelayed({
            if (!running) return@postDelayed
            if (outgoingPeers.containsKey(addr)) return@postDelayed
            if (!reconnectDevices.containsKey(addr)) return@postDelayed
            emitStatus("reconnect_trying", "Reconectando a $addr (intento $attempt)")
            connectAsClient(device)
        }, delay)
    }

    // ─── Cola de escrituras GATT ──────────────────────────────────

    private fun enqueueWrite(gatt: BluetoothGatt, char: BluetoothGattCharacteristic, data: ByteArray) {
        writeQueue.add(GattWrite(gatt, char, data))
        drainWriteQueue()
    }

    private fun drainWriteQueue() {
        if (writeInFlight) return
        val item = writeQueue.poll() ?: return
        if (!outgoingPeers.containsKey(item.gatt.device.address)) {
            drainWriteQueue()
            return
        }
        writeInFlight = true
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val result = item.gatt.writeCharacteristic(item.char, item.data,
                    BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)
                if (result != BluetoothStatusCodes.SUCCESS) {
                    writeInFlight = false
                    drainWriteQueue()
                }
            } else {
                @Suppress("DEPRECATION")
                item.char.value = item.data
                @Suppress("DEPRECATION")
                item.char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                @Suppress("DEPRECATION")
                val ok = item.gatt.writeCharacteristic(item.char)
                if (!ok) {
                    writeInFlight = false
                    drainWriteQueue()
                }
            }
        } catch (_: Exception) {
            writeInFlight = false
            drainWriteQueue()
        }
        // Timeout: si onCharacteristicWrite no llega en 2s, liberar la cola
        mainHandler.postDelayed({
            if (writeInFlight) {
                writeInFlight = false
                drainWriteQueue()
            }
        }, 2000)
    }

    // ─── Envío mesh flood ─────────────────────────────────────────

    private fun sendToAllPeers(bytes: ByteArray, exclude: String? = null) {
        for ((addr, gatt) in outgoingPeers) {
            if (addr == exclude) continue
            val char = outgoingCharCache[addr] ?: continue
            enqueueWrite(gatt, char, bytes.copyOf())
        }
    }

    // ─── Limpieza de peers muertos (heartbeat) ───────────────────

    private fun startPeerCleanup() {
        peerCleanupRunnable = object : Runnable {
            override fun run() {
                if (!running) return
                cleanupStalePeers()
                mainHandler.postDelayed(this, PEER_CLEANUP_INTERVAL_MS)
            }
        }
        mainHandler.postDelayed(peerCleanupRunnable!!, PEER_CLEANUP_INTERVAL_MS)
    }

    private fun cleanupStalePeers() {
        val now = System.currentTimeMillis()
        val staleAddrs = mutableListOf<String>()
        for ((addr, lastSeen) in peerLastSeen) {
            if (now - lastSeen > PEER_TIMEOUT_MS && uniquePeers.contains(addr)) {
                staleAddrs.add(addr)
            }
        }
        for (addr in staleAddrs) {
            emitStatus("peer_timeout", "Peer $addr sin datos en ${PEER_TIMEOUT_MS/1000}s")
            // Desconectar outgoing
            outgoingPeers.remove(addr)?.let { gatt ->
                outgoingCharCache.remove(addr)
                try { gatt.disconnect(); gatt.close() } catch (_: Exception) {}
            }
            // Desconectar incoming
            incomingPeers.remove(addr)?.let { device ->
                try { gattServer?.cancelConnection(device) } catch (_: Exception) {}
            }
            uniquePeers.remove(addr)
            peerLastSeen.remove(addr)
            listener?.onPeerDisconnected(addr)
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────

    private fun hasPermissions(): Boolean {
        val perms = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms += Manifest.permission.BLUETOOTH_SCAN
            perms += Manifest.permission.BLUETOOTH_CONNECT
            perms += Manifest.permission.BLUETOOTH_ADVERTISE
        } else {
            perms += Manifest.permission.ACCESS_FINE_LOCATION
        }
        return perms.all {
            ActivityCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun emitStatus(kind: String, msg: String) {
        Log.d(TAG, "$kind: $msg")
        mainHandler.post { listener?.onStatus(kind, msg) }
    }

    private fun isSeen(msgId: Int): Boolean = synchronized(seenMessages) {
        seenMessages.containsKey(msgId)
    }
    private fun markSeen(msgId: Int) = synchronized(seenMessages) {
        seenMessages[msgId] = System.currentTimeMillis()
    }

    // ─── Serialización binaria (33 bytes) ─────────────────────────

    private fun packPosition(uid: String, lat: Double, lon: Double,
                             speedKmh: Int, statusCode: Int, ttl: Byte, msgId: Int): ByteArray {
        val buf = ByteBuffer.allocate(PAYLOAD_SIZE)
        buf.put(MSG_TYPE_POSITION)
        buf.put(uidToBytes(uid))
        buf.putFloat(lat.toFloat())
        buf.putFloat(lon.toFloat())
        buf.putShort(speedKmh.coerceIn(0, 65535).toShort())
        buf.put(statusCode.coerceIn(0, 255).toByte())
        buf.put(ttl)
        buf.putInt(msgId)
        return buf.array()
    }

    private data class Unpacked(val uid: String, val lat: Double, val lon: Double,
                                val speed: Int, val status: Int, val ttl: Byte, val msgId: Int)

    private fun unpackPosition(b: ByteArray): Unpacked {
        val buf = ByteBuffer.wrap(b)
        buf.get() // msgType
        val uidBytes = ByteArray(16)
        buf.get(uidBytes)
        val uid = bytesToUid(uidBytes)
        val lat = buf.float.toDouble()
        val lon = buf.float.toDouble()
        val speed = buf.short.toInt() and 0xFFFF
        val status = buf.get().toInt() and 0xFF
        val ttl = buf.get()
        val msgId = buf.int
        return Unpacked(uid, lat, lon, speed, status, ttl, msgId)
    }

    private fun repackWithTtl(original: ByteArray, newTtl: Byte): ByteArray {
        val copy = original.copyOf()
        copy[28] = newTtl
        return copy
    }

    private fun uidToBytes(uid: String): ByteArray {
        val hex = uid.replace("-", "").padEnd(32, '0').take(32)
        val out = ByteArray(16)
        for (i in 0 until 16) {
            out[i] = hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    private fun bytesToUid(b: ByteArray): String {
        val hex = b.joinToString("") { "%02x".format(it.toInt() and 0xFF) }
        return "${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20,32)}"
    }
}
