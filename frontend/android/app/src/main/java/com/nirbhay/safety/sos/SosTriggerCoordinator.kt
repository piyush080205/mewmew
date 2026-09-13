package com.nirbhay.safety.sos

import android.content.Context
import com.nirbhay.safety.sos.comm.CommunicationManager
import com.nirbhay.safety.sos.data.SosEventEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Single entry point for every way an SOS can be raised: the confidence
 * engine's countdown expiry, the manual SOS button (via MotionMonitorModule),
 * and a notification action. Persists first, then hands off to
 * CommunicationManager — this is what makes the pipeline offline-first
 * (next.md §4): the Room row exists before any network/SMS attempt.
 */
object SosTriggerCoordinator {

    fun trigger(
        context: Context,
        eventId: String? = null,
        tripId: String?,
        latitude: Double?,
        longitude: Double?,
        accuracyMeters: Float?,
        locationIsFresh: Boolean,
        locationTimestamp: Long?,
        batteryPercent: Int?,
        confidence: Double,
        triggerReason: String,
        contributingSignals: List<String>,
        onPersisted: ((SosEventEntity) -> Unit)? = null
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            val repo = SosEventRepository(context)
            val contacts = repo.getContacts().map { it.phoneNumber }
            val event = repo.createPending(
                id = eventId ?: java.util.UUID.randomUUID().toString(),
                tripId = tripId,
                latitude = latitude,
                longitude = longitude,
                accuracyMeters = accuracyMeters,
                locationIsFresh = locationIsFresh,
                locationTimestamp = locationTimestamp,
                batteryPercent = batteryPercent,
                confidence = confidence,
                triggerReason = triggerReason,
                contributingSignals = contributingSignals,
                smsRecipients = contacts
            )
            onPersisted?.invoke(event)
            CommunicationManager(context).handleSosEvent(event)
        }
    }
}
