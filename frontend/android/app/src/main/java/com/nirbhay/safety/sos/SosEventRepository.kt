package com.nirbhay.safety.sos

import android.content.Context
import com.nirbhay.safety.sos.data.EmergencyContactEntity
import com.nirbhay.safety.sos.data.SosDatabase
import com.nirbhay.safety.sos.data.SosEventEntity
import com.nirbhay.safety.sos.data.SosEventStatus
import java.util.UUID

/**
 * Sole writer of sos_events rows and their status transitions. Every other
 * class (CommunicationManager, SosSyncWorker, MotionMonitorModule) reads
 * through this instead of touching the DAO directly.
 */
class SosEventRepository(context: Context) {

    private val db = SosDatabase.get(context)
    private val eventDao = db.sosEventDao()
    private val contactDao = db.emergencyContactDao()

    suspend fun createPending(
        id: String = UUID.randomUUID().toString(),
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
        smsRecipients: List<String>
    ): SosEventEntity {
        val now = System.currentTimeMillis()
        val event = SosEventEntity(
            id = id,
            createdAt = now,
            updatedAt = now,
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
            status = SosEventStatus.PENDING.name,
            smsRecipients = smsRecipients
        )
        eventDao.insert(event)
        return event
    }

    suspend fun updateStatus(id: String, status: SosEventStatus) {
        eventDao.updateStatus(id, status.name, System.currentTimeMillis())
    }

    suspend fun update(event: SosEventEntity) {
        eventDao.update(event.copy(updatedAt = System.currentTimeMillis()))
    }

    suspend fun markCancelled(id: String) {
        eventDao.markCancelled(id, System.currentTimeMillis())
    }

    suspend fun getById(id: String): SosEventEntity? = eventDao.getById(id)

    suspend fun getPending(): List<SosEventEntity> = eventDao.getPending()

    suspend fun getContacts(): List<EmergencyContactEntity> = contactDao.getAllOrderedByPriority()

    suspend fun replaceContacts(contacts: List<EmergencyContactEntity>) {
        contactDao.clearAll()
        contacts.forEach { contactDao.insert(it) }
    }
}
