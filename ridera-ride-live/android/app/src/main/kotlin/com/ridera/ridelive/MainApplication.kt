package com.ridera.ridelive
import android.app.Application
import android.util.Log
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            if (isForegroundNotifBlocked(throwable)) {
                Log.w("RIDERA", "Sistema bloqueó notificación de foreground — GPS continúa con WakeLock")
            } else {
                previous?.uncaughtException(thread, throwable)
            }
        }
    }

    private fun isForegroundNotifBlocked(t: Throwable?): Boolean {
        if (t == null) return false
        val name = t.javaClass.name
        val msg = t.message ?: ""
        if (name.contains("CannotPostForeground") ||
            name.contains("RemoteServiceException") ||
            msg.contains("Bad notification for startForeground") ||
            (msg.contains("Unable to start service") && msg.contains("CannotPost"))) {
            return true
        }
        return isForegroundNotifBlocked(t.cause)
    }
}
