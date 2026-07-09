package com.ridera.ridelive

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

class GpsService : Service() {

    companion object {
        const val SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co"
        const val ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI"

        const val NOTIF_CHANNEL_ID = "ridera_gps"
        const val NOTIF_ID = 1001

        // Persiste los datos entre reinicios del servicio (START_STICKY con intent null)
        var savedRideId: String = ""
        var savedUid: String = ""
        var savedAccessToken: String = ""
    }

    private var locationManager: LocationManager? = null
    private var lastLocation: Location? = null
    private var rideId: String = ""
    private var uid: String = ""
    private var accessToken: String = ""
    // HandlerThread propio: aislado del MainLooper para que MIUI/Doze no lo congele
    private val gpsThread = HandlerThread("ridera-gps").also { it.start() }
    private val handler = Handler(gpsThread.looper)
    private var wakeLock: PowerManager.WakeLock? = null

    // Filtro anti-zigzag: descarta puntos con mala precisión, saltos imposibles, o velocidad negativa
    private val locationListener = LocationListener { loc ->
        // 1. Descartar si precisión > 100m (adentro/mala señal). Antes era 30m
        //    pero eso rechazaba TODO punto en interior. 100m es más tolerante.
        if (loc.hasAccuracy() && loc.accuracy > 100f) return@LocationListener

        // 2. Descartar si viene de NETWORK cuando ya tenemos GPS reciente (< 15s)
        val prev = lastLocation
        if (loc.provider == LocationManager.NETWORK_PROVIDER &&
            prev?.provider == LocationManager.GPS_PROVIDER &&
            (System.currentTimeMillis() - prev.time) < 15000L) {
            return@LocationListener
        }

        // 3. Descartar saltos imposibles (más de 300 km/h entre puntos)
        if (prev != null) {
            val dtSec = (loc.time - prev.time) / 1000.0
            if (dtSec > 0) {
                val distM = loc.distanceTo(prev)
                val speedKmh = (distM / dtSec) * 3.6
                if (speedKmh > 300.0) return@LocationListener
            }
        }

        lastLocation = loc

        // 4. Broadcast al mesh BLE (independiente de Supabase — funciona sin internet).
        //    Si el mesh no está corriendo, este llamado es no-op silencioso.
        try {
            val speedKmh = (loc.speed * 3.6).coerceIn(0.0, 300.0).toInt()
            BleMeshService.instance?.broadcastPosition(
                lat = loc.latitude,
                lon = loc.longitude,
                speedKmh = speedKmh,
                statusCode = 0,
            )
        } catch (_: Exception) {}
    }

    private val heartbeat = object : Runnable {
        override fun run() {
            pushToSupabase()
            handler.postDelayed(this, 4000)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            rideId = intent.getStringExtra("rideId") ?: ""
            uid = intent.getStringExtra("uid") ?: ""
            accessToken = intent.getStringExtra("accessToken") ?: ""
            savedRideId = rideId
            savedUid = uid
            savedAccessToken = accessToken
        } else {
            // Reinicio por START_STICKY — restaurar datos guardados
            rideId = savedRideId
            uid = savedUid
            accessToken = savedAccessToken
        }
        startForegroundSafely()
        acquireWakeLock()
        startGps()
        handler.postDelayed(heartbeat, 1000)
        return START_STICKY
    }

    private fun startForegroundSafely() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val mgr = getSystemService(NotificationManager::class.java)
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID, "RIDERA GPS", NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Seguimiento GPS de la rodada en curso" }
                mgr.createNotificationChannel(channel)
            }
            val tapIntent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
                .setContentTitle("RIDERA")
                .setContentText("Compartiendo ubicación en la rodada")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build()
            startForeground(NOTIF_ID, notification)
        } catch (e: Exception) {
            Log.e("RIDERA", "startForeground FALLÓ — MIUI puede matar el servicio: ${e.message}")
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ridera:gps")
            .also { it.acquire(4 * 60 * 60 * 1000L) } // máx 4 horas
        Log.d("RIDERA", "WakeLock adquirido — GPS activo con pantalla bloqueada")
    }

    private fun startGps() {
        try {
            locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
            // GPS puro: 1s / 3m — máxima precisión para moto en carretera
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 1000L, 3f, locationListener, gpsThread.looper
            )
            // NETWORK solo si NO hay GPS, y con menos frecuencia. El filtro del listener
            // igualmente lo descarta cuando llega un GPS reciente.
            if (locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true) {
                locationManager?.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, 10000L, 20f, locationListener, gpsThread.looper
                )
            }
        } catch (_: SecurityException) {}
    }

    private var pointCounter = 0

    private fun pushToSupabase() {
        val loc = lastLocation ?: return
        if (rideId.isEmpty() || uid.isEmpty()) return
        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
        val speedKmh = (loc.speed * 3.6).coerceIn(0.0, 300.0)
        val memberBody = """{"lat":${loc.latitude},"lon":${loc.longitude},"speed_kmh":$speedKmh,"last_seen":"$now"}"""
        thread {
            try {
                // Actualizar posición en members (cada 4s)
                val conn = URL("$SUPABASE_URL/rest/v1/members?ride_id=eq.$rideId&uid=eq.$uid")
                    .openConnection() as HttpURLConnection
                conn.requestMethod = "PATCH"
                conn.setRequestProperty("apikey", ANON_KEY)
                val token = savedAccessToken.ifEmpty { accessToken }.ifEmpty { ANON_KEY }
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Prefer", "return=minimal")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.outputStream.use { it.write(memberBody.toByteArray()) }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }
        // Insertar punto de trazado cada ~20s (cada 5 heartbeats de 4s)
        pointCounter++
        if (pointCounter % 5 == 0) {
            val pointBody = """{"ride_id":"$rideId","uid":"$uid","lat":${loc.latitude},"lon":${loc.longitude},"speed_kmh":$speedKmh,"recorded_at":"$now"}"""
            thread {
                try {
                    val conn = URL("$SUPABASE_URL/rest/v1/route_points")
                        .openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("apikey", ANON_KEY)
                    val token2 = savedAccessToken.ifEmpty { accessToken }.ifEmpty { ANON_KEY }
                    conn.setRequestProperty("Authorization", "Bearer $token2")
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("Prefer", "return=minimal")
                    conn.doOutput = true
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    conn.outputStream.use { it.write(pointBody.toByteArray()) }
                    conn.responseCode
                    conn.disconnect()
                } catch (_: Exception) {}
            }
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(heartbeat)
        locationManager?.removeUpdates(locationListener)
        if (wakeLock?.isHeld == true) wakeLock?.release()
        gpsThread.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null
}
