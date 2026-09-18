package com.nirbhay.safety

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.nirbhay.safety.sos.MotionForegroundService
import com.nirbhay.safety.sos.MotionMonitorBridge
import com.nirbhay.safety.sos.SosEventRepository
import com.nirbhay.safety.sos.SosPrefs
import com.nirbhay.safety.sos.SosTriggerCoordinator
import com.nirbhay.safety.sos.data.EmergencyContactEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.util.UUID

/**
 * JS bridge to the native motion-detection/SOS pipeline. JS never talks to
 * Room directly — everything goes through here so the countdown/trigger
 * logic stays single-sourced in native code (see EmergencyConfirmationController).
 */
class MotionMonitorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        MotionMonitorBridge.attach(reactContext)
    }

    override fun getName(): String = "MotionMonitorModule"

    @ReactMethod
    fun startMonitoring(tripId: String, contactsJson: String, apiUrl: String, promise: Promise) {
        val context = reactApplicationContext
        SosPrefs.setApiUrl(context, apiUrl)
        seedContactsFromJson(contactsJson)
        MotionForegroundService.start(context, tripId)
        promise.resolve(true)
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        MotionForegroundService.stop(reactApplicationContext)
        promise.resolve(true)
    }

    @ReactMethod
    fun confirmSafe(eventId: String, promise: Promise) {
        val intent = android.content.Intent(reactApplicationContext, MotionForegroundService::class.java).apply {
            action = MotionForegroundService.ACTION_CONFIRM_SAFE
            putExtra(MotionForegroundService.EXTRA_PENDING_ID, eventId)
        }
        reactApplicationContext.startService(intent)
        CoroutineScope(Dispatchers.IO).launch {
            SosEventRepository(reactApplicationContext).markCancelled(eventId)
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun triggerManualSos(reason: String, promise: Promise) {
        val running = MotionForegroundService.runningInstance
        if (running != null) {
            // Goes through the foreground service so the event carries a real
            // location/battery reading instead of nulls — see its own
            // triggerManualSos for the fetch logic this delegates to.
            running.triggerManualSos(reason)
        } else {
            val tripId = SosPrefs.getTripId(reactApplicationContext)
            SosTriggerCoordinator.trigger(
                context = reactApplicationContext,
                tripId = tripId,
                latitude = null,
                longitude = null,
                accuracyMeters = null,
                locationIsFresh = false,
                locationTimestamp = null,
                batteryPercent = null,
                confidence = 1.0,
                triggerReason = reason,
                contributingSignals = listOf("MANUAL")
            )
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun getMonitoringStatus(promise: Promise) {
        val result = Arguments.createMap()
        result.putBoolean("active", SosPrefs.wasMonitoringActive(reactApplicationContext))
        val pendingId = MotionForegroundService.runningInstance?.activePendingId()
        if (pendingId != null) {
            result.putString("pendingEventId", pendingId)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun seedEmergencyContacts(contactsJson: String, promise: Promise) {
        try {
            seedContactsFromJson(contactsJson)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INVALID_CONTACTS", e)
        }
    }

    private fun seedContactsFromJson(contactsJson: String) {
        val arr = JSONArray(contactsJson)
        val contacts = (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            EmergencyContactEntity(
                id = obj.optString("id", UUID.randomUUID().toString()),
                name = if (obj.isNull("name")) null else obj.optString("name"),
                phoneNumber = obj.getString("phoneNumber"),
                priority = obj.optInt("priority", i + 1),
                isPrimary = obj.optBoolean("isPrimary", i == 0),
                createdAt = System.currentTimeMillis()
            )
        }
        CoroutineScope(Dispatchers.IO).launch {
            SosEventRepository(reactApplicationContext).replaceContacts(contacts)
        }
    }
}
