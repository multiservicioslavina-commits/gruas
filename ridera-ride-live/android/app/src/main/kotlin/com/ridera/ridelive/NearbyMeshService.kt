package com.ridera.ridelive

import android.content.Context
import android.util.Log
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

/**
 * Mesh Bluetooth para RIDERA — usa Nearby Connections API.
 *
 * Estrategia: P2P_CLUSTER — cada dispositivo puede conectarse con múltiples
 * peers simultáneamente. Los mensajes se reenvían (flood con TTL) para
 * cubrir distancia mayor al alcance BLE directo.
 *
 * Formato binario del paquete de posición (33 bytes):
 *   [0]     msgType: 0x01 = posición
 *   [1-16]  uid: 16 bytes UUID sin guiones
 *   [17-20] lat: float32
 *   [21-24] lon: float32
 *   [25-26] speedKmh: uint16
 *   [27]    statusCode: uint8 (0=ok, 3=sos)
 *   [28]    ttl: uint8 (3 al enviar, se decrementa en cada relay)
 *   [29-32] msgId: uint32 aleatorio (para deduplicar)
 */
class NearbyMeshService(private val ctx: Context) {

    companion object {
        const val TAG = "RIDERA_MESH"
        const val SERVICE_ID = "com.ridera.ridelive.mesh"
        const val TTL_INITIAL: Byte = 3
        const val MSG_TYPE_POSITION: Byte = 0x01
    }

    interface Listener {
        fun onPeerMessage(
            uid: String,
            lat: Double,
            lon: Double,
            speedKmh: Int,
            statusCode: Int,
            hops: Int,
        )
        fun onPeerConnected(endpointId: String)
        fun onPeerDisconnected(endpointId: String)
    }

    private var listener: Listener? = null
    private var myUid: String = ""
    private var myName: String = ""
    private var running = false

    // Peers conectados directamente por BLE/WiFi Direct
    private val peers = ConcurrentHashMap<String, String>() // endpointId -> uid

    // Cache de msgIds recientes para deduplicar mesh flood
    private val seenMessages = object : LinkedHashMap<Int, Long>(200, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Long>?): Boolean = size > 500
    }

    // ─── API pública ──────────────────────────────────────────────────

    fun start(uid: String, name: String, listener: Listener) {
        if (running) return
        this.myUid = uid
        this.myName = name
        this.listener = listener
        running = true

        val opts = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()
        Nearby.getConnectionsClient(ctx)
            .startAdvertising(name, SERVICE_ID, connectionLifecycleCallback, opts)
            .addOnSuccessListener { Log.d(TAG, "advertising OK") }
            .addOnFailureListener { Log.e(TAG, "advertising fail: ${it.message}") }

        val discOpts = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()
        Nearby.getConnectionsClient(ctx)
            .startDiscovery(SERVICE_ID, endpointDiscoveryCallback, discOpts)
            .addOnSuccessListener { Log.d(TAG, "discovery OK") }
            .addOnFailureListener { Log.e(TAG, "discovery fail: ${it.message}") }
    }

    fun stop() {
        running = false
        try {
            Nearby.getConnectionsClient(ctx).stopAllEndpoints()
            Nearby.getConnectionsClient(ctx).stopAdvertising()
            Nearby.getConnectionsClient(ctx).stopDiscovery()
        } catch (_: Exception) {}
        peers.clear()
        listener = null
    }

    /** Broadcast propia posición al mesh (llamado periódicamente desde Flutter). */
    fun broadcastPosition(lat: Double, lon: Double, speedKmh: Int, statusCode: Int) {
        if (!running || myUid.isEmpty()) return
        val msgId = (System.nanoTime() and 0xFFFFFFFFL).toInt()
        markSeen(msgId)
        val payload = packPosition(myUid, lat, lon, speedKmh, statusCode, TTL_INITIAL, msgId)
        sendToAllPeers(payload, exclude = null)
    }

    // ─── Callbacks ────────────────────────────────────────────────────

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            // Auto-aceptar todas las conexiones (mesh abierto entre pilotos de la misma app)
            Nearby.getConnectionsClient(ctx)
                .acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                peers[endpointId] = ""
                listener?.onPeerConnected(endpointId)
                Log.d(TAG, "connected: $endpointId")
            }
        }

        override fun onDisconnected(endpointId: String) {
            peers.remove(endpointId)
            listener?.onPeerDisconnected(endpointId)
            Log.d(TAG, "disconnected: $endpointId")
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (info.serviceId != SERVICE_ID) return
            Nearby.getConnectionsClient(ctx)
                .requestConnection(myName, endpointId, connectionLifecycleCallback)
                .addOnFailureListener { Log.e(TAG, "requestConnection fail: ${it.message}") }
        }

        override fun onEndpointLost(endpointId: String) {
            peers.remove(endpointId)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val bytes = payload.asBytes() ?: return
            if (bytes.size < 33) return
            if (bytes[0] != MSG_TYPE_POSITION) return

            val (uid, lat, lon, speed, status, ttl, msgId) = unpackPosition(bytes)
            if (uid == myUid) return // mi propio mensaje eco

            // Dedup por msgId
            if (isSeen(msgId)) return
            markSeen(msgId)

            val hops = TTL_INITIAL - ttl
            listener?.onPeerMessage(uid, lat, lon, speed, status, hops.toInt())

            // Relay a otros vecinos con ttl-1
            if (ttl > 1) {
                val relay = repackWithTtl(bytes, (ttl - 1).toByte())
                sendToAllPeers(relay, exclude = endpointId)
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            // no-op para bytes small
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    private fun sendToAllPeers(bytes: ByteArray, exclude: String?) {
        if (peers.isEmpty()) return
        val targets = peers.keys.filter { it != exclude }
        if (targets.isEmpty()) return
        val payload = Payload.fromBytes(bytes)
        Nearby.getConnectionsClient(ctx).sendPayload(targets, payload)
    }

    private fun isSeen(msgId: Int): Boolean = synchronized(seenMessages) {
        seenMessages.containsKey(msgId)
    }

    private fun markSeen(msgId: Int) = synchronized(seenMessages) {
        seenMessages[msgId] = System.currentTimeMillis()
    }

    // ─── Serialización binaria compacta ───────────────────────────────

    private fun packPosition(
        uid: String, lat: Double, lon: Double,
        speedKmh: Int, statusCode: Int, ttl: Byte, msgId: Int
    ): ByteArray {
        val buf = ByteBuffer.allocate(33)
        buf.put(MSG_TYPE_POSITION)
        val uidBytes = uidToBytes(uid)
        buf.put(uidBytes)
        buf.putFloat(lat.toFloat())
        buf.putFloat(lon.toFloat())
        buf.putShort(speedKmh.coerceIn(0, 65535).toShort())
        buf.put(statusCode.coerceIn(0, 255).toByte())
        buf.put(ttl)
        buf.putInt(msgId)
        return buf.array()
    }

    private data class Unpacked(
        val uid: String, val lat: Double, val lon: Double,
        val speed: Int, val status: Int, val ttl: Byte, val msgId: Int
    )

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
        // UUID sin guiones = 32 hex chars = 16 bytes
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
