package com.ridera.ridelive

import android.app.Service
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import kotlin.concurrent.thread

class GpsService : Service() {

    companion object {
        const val SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co"
        const val ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI"

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
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null

    private val locationListener = LocationListener { loc -> lastLocation = loc }

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
        acquireWakeLock()
        startGps()
        handler.postDelayed(heartbeat, 1000)
        return START_STICKY
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
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, 2000L, 5f, locationListener, Looper.getMainLooper()
            )
            if (locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true) {
                locationManager?.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, 2000L, 5f, locationListener, Looper.getMainLooper()
                )
            }
        } catch (_: SecurityException) {}
    }

    private fun pushToSupabase() {
        val loc = lastLocation ?: return
        if (rideId.isEmpty() || uid.isEmpty()) return
        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
        val speedKmh = (loc.speed * 3.6).coerceIn(0.0, 300.0)
        val body = """{"lat":${loc.latitude},"lon":${loc.longitude},"speed_kmh":$speedKmh,"last_seen":"$now"}"""
        thread {
            try {
                val conn = URL("$SUPABASE_URL/rest/v1/members?ride_id=eq.$rideId&uid=eq.$uid")
                    .openConnection() as HttpURLConnection
                conn.requestMethod = "PATCH"
                conn.setRequestProperty("apikey", ANON_KEY)
                conn.setRequestProperty("Authorization", "Bearer ${accessToken.ifEmpty { ANON_KEY }}")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Prefer", "return=minimal")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.outputStream.use { it.write(body.toByteArray()) }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(heartbeat)
        locationManager?.removeUpdates(locationListener)
        if (wakeLock?.isHeld == true) wakeLock?.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null
}
