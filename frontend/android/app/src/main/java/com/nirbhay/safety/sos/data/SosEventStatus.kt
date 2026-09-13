package com.nirbhay.safety.sos.data

/**
 * Offline SOS event lifecycle. PENDING is written to disk before any
 * network/SMS attempt is made (see SosEventRepository) so an SOS is never
 * lost to a crash or a failed network call. FAILED is reserved for
 * corrupt/invalid records, never for a legitimately-still-offline one.
 */
enum class SosEventStatus {
    PENDING,
    SMS_ATTEMPTED,
    SMS_SENT,
    SENT,
    SERVER_SYNCED,
    COMPLETED,
    FAILED;

    companion object {
        fun fromString(value: String?): SosEventStatus =
            values().firstOrNull { it.name == value } ?: PENDING
    }
}
