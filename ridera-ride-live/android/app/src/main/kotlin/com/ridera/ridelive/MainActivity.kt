package com.ridera.ridelive

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SmsManager
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private var rideActive = false
    private var mesh: NearbyMeshService? = null
    private var meshChannel: MethodChannel? = null

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)

        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val msg = "${throwable.message}${throwable.cause?.message}"
            if (msg.contains("Bad notification for startForeground") ||
                throwable.javaClass.name.contains("CannotPostForeground")) {
                Log.w("RIDERA", "MIUI bloqueó foreground service notification — continuando")
            } else {
                prev?.uncaughtException(thread, throwable)
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (rideActive) {
            moveTaskToBack(true)
        } else {
            super.onBackPressed()
        }
    }

    companion object {
        const val CHANNEL = "com.ridera.ridelive/gps"
        const val MESH_CHANNEL = "com.ridera.ridelive/mesh"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        val rideId = call.argument<String>("rideId") ?: ""
                        val uid = call.argument<String>("uid") ?: ""
                        val accessToken = call.argument<String>("accessToken") ?: ""
                        val intent = Intent(this, GpsService::class.java).apply {
                            putExtra("rideId", rideId)
                            putExtra("uid", uid)
                            putExtra("accessToken", accessToken)
                        }
                        startService(intent)
                        result.success(true)
                    }
                    "stop" -> {
                        rideActive = false
                        stopService(Intent(this, GpsService::class.java))
                        result.success(true)
                    }
                    "setRideActive" -> {
                        rideActive = call.argument<Boolean>("active") ?: false
                        result.success(true)
                    }
                    "isBatteryOptimized" -> {
                        // true = está optimizada (mala), false = ignorada (buena)
                        result.success(isBatteryOptimized())
                    }
                    "requestIgnoreBatteryOptimization" -> {
                        requestIgnoreBatteryOptimization()
                        result.success(true)
                    }
                    "openAutoStartSettings" -> {
                        // true si logró abrir la pantalla específica del fabricante
                        result.success(openAutoStartSettings())
                    }
                    "sendSms" -> {
                        val phone = call.argument<String>("phone") ?: ""
                        val message = call.argument<String>("message") ?: ""
                        result.success(sendSmsDirect(phone, message))
                    }
                    else -> result.notImplemented()
                }
            }

        // ── Canal MESH ────────────────────────────────────────────────
        meshChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, MESH_CHANNEL)
        meshChannel!!.setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    val uid = call.argument<String>("uid") ?: ""
                    val name = call.argument<String>("name") ?: "Piloto"
                    if (mesh == null) mesh = NearbyMeshService(this)
                    mesh!!.start(uid, name, object : NearbyMeshService.Listener {
                        override fun onPeerMessage(
                            uid: String, lat: Double, lon: Double,
                            speedKmh: Int, statusCode: Int, hops: Int,
                        ) {
                            runOnUiThread {
                                meshChannel?.invokeMethod("onPeerMessage", mapOf(
                                    "uid" to uid,
                                    "lat" to lat,
                                    "lon" to lon,
                                    "speed_kmh" to speedKmh,
                                    "status_code" to statusCode,
                                    "hops" to hops,
                                ))
                            }
                        }
                        override fun onPeerConnected(endpointId: String) {
                            runOnUiThread {
                                meshChannel?.invokeMethod("onPeerConnected",
                                    mapOf("endpointId" to endpointId))
                            }
                        }
                        override fun onPeerDisconnected(endpointId: String) {
                            runOnUiThread {
                                meshChannel?.invokeMethod("onPeerDisconnected",
                                    mapOf("endpointId" to endpointId))
                            }
                        }
                    })
                    result.success(true)
                }
                "stop" -> {
                    mesh?.stop()
                    result.success(true)
                }
                "broadcastPosition" -> {
                    val lat = call.argument<Double>("lat") ?: 0.0
                    val lon = call.argument<Double>("lon") ?: 0.0
                    val speed = call.argument<Int>("speed_kmh") ?: 0
                    val status = call.argument<Int>("status_code") ?: 0
                    mesh?.broadcastPosition(lat, lon, speed, status)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun isBatteryOptimized(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return !pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (_: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {}
        }
    }

    /** Envía SMS directo con SmsManager. Requiere permiso SEND_SMS. */
    private fun sendSmsDirect(phone: String, message: String): Boolean {
        if (phone.isBlank() || message.isBlank()) return false
        return try {
            val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            val parts = sms.divideMessage(message)
            if (parts.size > 1) {
                sms.sendMultipartTextMessage(phone, null, parts, null, null)
            } else {
                sms.sendTextMessage(phone, null, message, null, null)
            }
            Log.d("RIDERA", "SMS enviado a $phone (${parts.size} parts)")
            true
        } catch (e: Exception) {
            Log.e("RIDERA", "SMS falló: ${e.message}")
            false
        }
    }

    private fun openAutoStartSettings(): Boolean {
        // Intents específicos por fabricante para pantalla de autoarranque
        val manufacturers = listOf(
            "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
            "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
            "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
            "com.asus.mobilemanager" to "com.asus.mobilemanager.MainActivity"
        )
        for ((pkg, cls) in manufacturers) {
            try {
                val intent = Intent().apply {
                    component = ComponentName(pkg, cls)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                if (packageManager.resolveActivity(intent, 0) != null) {
                    startActivity(intent)
                    return true
                }
            } catch (_: Exception) {}
        }
        return false
    }
}
