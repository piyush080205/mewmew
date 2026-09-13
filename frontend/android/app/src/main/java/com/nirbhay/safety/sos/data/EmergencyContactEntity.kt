package com.nirbhay.safety.sos.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Native mirror of the backend `emergency_contacts` table so SMS sending
 * works fully offline without a round-trip through JS or the network.
 * Seeded once from the app's existing 3 guardian-phone fields (see
 * MotionMonitorModule.seedEmergencyContacts) and kept in sync afterward.
 */
@Entity(tableName = "emergency_contacts")
data class EmergencyContactEntity(
    @PrimaryKey val id: String,
    val name: String? = null,
    val phoneNumber: String,
    val priority: Int = 1,
    val isPrimary: Boolean = false,
    val createdAt: Long
)
