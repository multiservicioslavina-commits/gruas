package com.ridera.ridelive

import android.content.Intent
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private var rideActive = false

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        // Instalar DESPUES de Flutter para sobreescribir su handler
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
            // Durante rodada activa: minimizar en vez de salir
            moveTaskToBack(true)
        } else {
            super.onBackPressed()
        }
    }

    companion object {
        const val CHANNEL = "com.ridera.ridelive/gps"
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
                    else -> result.notImplemented()
                }
            }
    }
}
