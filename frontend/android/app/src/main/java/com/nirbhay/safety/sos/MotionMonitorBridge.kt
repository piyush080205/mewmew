package com.nirbhay.safety.sos

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

/**
 * Lets MotionForegroundService (no ReactContext of its own) emit
 * DeviceEventEmitter events to JS when the app happens to be alive,
 * without the service depending on RN's Activity/host lifecycle.
 * Events emitted while JS isn't running are simply missed — the
 * countdown/trigger path never depends on this succeeding.
 */
object MotionMonitorBridge {
    @Volatile private var contextRef: WeakReference<ReactContext>? = null

    fun attach(reactContext: ReactContext) {
        contextRef = WeakReference(reactContext)
    }

    fun detach() {
        contextRef = null
    }

    fun emit(eventName: String, params: com.facebook.react.bridge.WritableMap?) {
        val ctx = contextRef?.get() ?: return
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {
            // JS bridge not ready — non-fatal, native state is unaffected.
        }
    }

    fun emitCandidate(pendingId: String, confidence: Double, reason: String, countdownSeconds: Int) {
        emit("onEmergencyCandidate", Arguments.createMap().apply {
            putString("eventId", pendingId)
            putDouble("confidence", confidence)
            putString("reason", reason)
            putInt("countdownSeconds", countdownSeconds)
        })
    }

    fun emitStatus(pendingId: String, status: String) {
        emit("onSosStatusChanged", Arguments.createMap().apply {
            putString("eventId", pendingId)
            putString("status", status)
        })
    }
}
