package com.ridera.ridelive

import android.app.Application
import android.util.Log

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val msg = throwable.message ?: throwable.cause?.message ?: ""
            val name = throwable.javaClass.name
            if (msg.contains("Bad notification for startForeground") ||
                name.contains("CannotPostForegroundServiceNotification") ||
                throwable.cause?.javaClass?.name?.contains("CannotPostForegroundServiceNotification") == true) {
                Log.w("RIDERA", "Foreground notification blocked by system, GPS continues in background")
            } else {
                previous?.uncaughtException(thread, throwable)
            }
        }
    }
}
