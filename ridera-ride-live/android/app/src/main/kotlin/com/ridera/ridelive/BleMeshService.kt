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

        // Duty cycling para batería: cuánto escaneamos y cuánto descansamos.
        const val SCAN_ACTIVE_MS = 6_000L
        const val SCAN_REST_MS = 24_000L
    }

    interface Listener {
        fun onPeerMessage(uid: String, lat: Double, lon: Double,
                          speedKmh: Int, statusCode: Int, hops: Int)
        fun onPeerConnected(endpointId: String)
        fun onPeerDisconnected(endpointId: String)
        fun onStatus(kind: String, message: String)  // "advertising_ok" / "scan_err" / etc
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

    // Cache de msgIds para dedup mesh flood
    private val seenMessages = object : LinkedHashMap<Int, Long>(200, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Long>?): Boolean = size > 500
    }

    private var adapter: BluetoothAdapter? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var gattServer: BluetoothGattServer? = null
    private var scanCycleRunnable: Runnable? = null
    private var scanning = false

    // ─── API pública ──────────────────────────────────────────────────

    fun start(uid: String, name: String, listener: Listener) {
        if (running) return
        this.myUid = uid
        this.myName = name
        this.listener = listener
        running = true

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
        } catch (e: Exception) {
            emitStatus("start_error", e.message ?: "error desconocido")
        }
    }

    fun stop() {
        running = false
        scanCycleRunnable?.let { mainHandler.removeCallbacks(it) }
        scanCycleRunnable = null
        try { advertiser?.stopAdvertising(advertiseCallback) } catch (_: Exception) {}
        try { if (scanning) scanner?.stopScan(scanCallback); scanning = false } catch (_: Exception) {}
        try { gattServer?.close() } catch (_: Exception) {}
        for (gatt in outgoingPeers.values) {
            try { gatt.disconnect(); gatt.close() } catch (_: Exception) {}
        }
        outgoingPeers.clear()
        outgoingCharCache.clear()
        incomingPeers.clear()
        gattServer = null
        listener = null
    }

    fun broadcastPosition(lat: Double, lon: Double, speedKmh: Int, statusCode: Int) {
        if (!running || myUid.isEmpty()) return
        val msgId = (System.nanoTime() and 0xFFFFFFFFL).toInt()
        markSeen(msgId)
        val payload = packPosition(myUid, lat, lon, speedKmh, statusCode, TTL_INITIAL, msgId)
        sendToAllPeers(payload)
    }

    fun directPeers(): Int = outgoingPeers.size + incomingPeers.size

    // ─── GATT Server (recibir mensajes) ───────────────────────────────

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
                    listener?.onPeerConnected(device.address)
                    Log.d(TAG, "incoming connected: ${device.address}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    incomingPeers.remove(device.address)
                    listener?.onPeerDisconnected(device.address)
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

    // ─── Advertising ──────────────────────────────────────────────────

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

    // ─── Scanning con duty cycling ────────────────────────────────────

    private fun startScanCycle() {
        scanner = adapter?.bluetoothLeScanner
        if (scanner == null) {
            emitStatus("scan_unsupported", "Scanner BLE no disponible")
            return
        }
        // Primer ciclo ya
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
            emitStatus("scanning", "Buscando peers (${SCAN_ACTIVE_MS/1000}s)")
        } catch (se: SecurityException) {
            emitStatus("scan_perm", "Sin permiso BLUETOOTH_SCAN")
            return
        }
        // Después de SCAN_ACTIVE_MS, paramos y descansamos
        scanCycleRunnable = Runnable {
            try {
                if (scanning) scanner?.stopScan(scanCallback)
                scanning = false
            } catch (_: Exception) {}
            // Esperamos SCAN_REST_MS y volvemos a escanear
            scanCycleRunnable = Runnable { runScanCycle() }
            mainHandler.postDelayed(scanCycleRunnable!!, SCAN_REST_MS)
        }
        mainHandler.postDelayed(scanCycleRunnable!!, SCAN_ACTIVE_MS)
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            // Ya estamos conectados a este peer?
            if (outgoingPeers.containsKey(device.address)) return
            // Conectar como GATT client para poder escribirle
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

    // ─── GATT Client (enviar mensajes) ────────────────────────────────

    private fun connectAsClient(device: BluetoothDevice) {
        try {
            val gatt = device.connectGatt(ctx, false, gattClientCallback,
                BluetoothDevice.TRANSPORT_LE)
            outgoingPeers[device.address] = gatt
            listener?.onPeerConnected(device.address)
        } catch (se: SecurityException) {
            emitStatus("connect_perm", "Sin permiso BLUETOOTH_CONNECT")
        }
    }

    private val gattClientCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    try { gatt.discoverServices() } catch (_: SecurityException) {}
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val addr = gatt.device.address
                    outgoingPeers.remove(addr)
                    outgoingCharCache.remove(addr)
                    try { gatt.close() } catch (_: Exception) {}
                    listener?.onPeerDisconnected(addr)
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
    }

    // ─── Envío mesh flood ─────────────────────────────────────────────

    private fun sendToAllPeers(bytes: ByteArray, exclude: String? = null) {
        for ((addr, gatt) in outgoingPeers) {
            if (addr == exclude) continue
            val char = outgoingCharCache[addr] ?: continue
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    gatt.writeCharacteristic(char, bytes,
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)
                } else {
                    @Suppress("DEPRECATION")
                    char.value = bytes
                    @Suppress("DEPRECATION")
                    char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    @Suppress("DEPRECATION")
                    gatt.writeCharacteristic(char)
                }
            } catch (_: Exception) {}
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────

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

    // ─── Serialización binaria (33 bytes) ─────────────────────────────

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
