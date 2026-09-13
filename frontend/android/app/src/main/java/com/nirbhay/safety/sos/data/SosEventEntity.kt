package com.nirbhay.safety.sos.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverters

/**
 * One offline-queued SOS event. A row is inserted with status PENDING
 * *before* any SMS/network attempt (next.md's "persist locally first"
 * requirement) and only ever updated afterward, never deleted, so a
 * killed process or lost connection can never silently drop an SOS.
 */
@Entity(tableName = "sos_events")
@TypeConverters(Converters::class)
data class SosEventEntity(
    @PrimaryKey val id: String,
    val createdAt: Long,
    val updatedAt: Long,
    val tripId: String? = null,

    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyMeters: Float? = null,
    val locationIsFresh: Boolean = true,
    val locationTimestamp: Long? = null,

    val batteryPercent: Int? = null,
    val confidence: Double,
    val triggerReason: String,
    val contributingSignals: List<String> = emptyList(),

    val status: String = SosEventStatus.PENDING.name,

    val smsRecipients: List<String> = emptyList(),
    val smsResult: String? = null, // JSON {"sent":[...],"failed":[...]}

    val serverSynced: Boolean = false,
    val serverSyncAttempts: Int = 0,
    val lastSyncError: String? = null,

    val cancelled: Boolean = false
)
