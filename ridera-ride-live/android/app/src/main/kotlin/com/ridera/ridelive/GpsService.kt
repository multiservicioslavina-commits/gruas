package com.ridera.ridelive

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

class GpsService : Service() {

    companion object {
        const val CHANNEL_ID = "ridera_gps"
        const val NOTIF_ID = 9001
        const val SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co"
        const val ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI"
    }

    private var locationManager: LocationManager? = null
    private var lastLocation: Location? = null
    private var rideId: String = ""
    private var uid: String = ""
    private var accessToken: String = ""
    private var heartbeatHandler: Handler? = null

    private val locationListener = LocationListener { loc ->
        lastLocation = loc
    }

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            pushToSupabase()
            heartbeatHandler?.postDelayed(this, 4000)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        rideId = intent?.getStringExtra("rideId") ?: ""
        uid = intent?.getStringExtra("uid") ?: ""
        accessToken = intent?.getStringExtra("accessToken") ?: ""

        createChannel()
        tryStartForeground()
        startGps()
        startHeartbeat()

        return START_STICKY
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID, "RIDERA GPS", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "GPS activo para convoy"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
        }
    }

    private fun tryStartForeground() {
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RIDERA · Rodada activa")
            .setContentText("GPS compartido con el convoy")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIF_ID, notif)
            }
        } catch (e: Exception) {
            // MIUI bloquea la notificacion — el GPS sigue funcionando
            // mientras la app este en primer plano
        }
    }

    private fun startGps() {
        try {
            locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                2000L, 5f,
                locationListener,
                Looper.getMainLooper()
            )
            // Red como respaldo
            if (locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true) {
                locationManager?.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    2000L, 5f,
                    locationListener,
                    Looper.getMainLooper()
                )
            }
        } catch (_: SecurityException) {}
    }

    private fun startHeartbeat() {
        heartbeatHandler = Handler(Looper.getMainLooper())
        heartbeatHandler?.postDelayed(heartbeatRunnable, 1000)
    }

    private fun pushToSupabase() {
        val loc = lastLocation ?: return
        if (rideId.isEmpty() || uid.isEmpty()) return

        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())

        val speedKmh = (loc.speed * 3.6).coerceIn(0.0, 300.0)
        val body = """{"lat":${loc.latitude},"lon":${loc.longitude},"speed_kmh":$speedKmh,"last_seen":"$now"}"""

        thread {
            try {
                val url = URL("$SUPABASE_URL/rest/v1/members?ride_id=eq.$rideId&uid=eq.$uid")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PATCH"
                conn.setRequestProperty("apikey", ANON_KEY)
                conn.setRequestProperty("Authorization", "Bearer ${if (accessToken.isNotEmpty()) accessToken else ANON_KEY}")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Prefer", "return=minimal")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.outputStream.use { it.write(body.toByteArray()) }
                conn.responseCode // ejecuta la peticion
                conn.disconnect()
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        heartbeatHandler?.removeCallbacks(heartbeatRunnable)
        locationManager?.removeUpdates(locationListener)
        super.onDestroy()
    }

    override fun onCreate() {
        super.onCreate()
    }

    override fun onBind(intent: Intent?) = null
}
