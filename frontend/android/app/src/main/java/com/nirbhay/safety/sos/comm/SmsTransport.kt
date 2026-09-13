package com.nirbhay.safety.sos.comm

import android.content.Context
import com.nirbhay.safety.sos.SosEventRepository
import com.nirbhay.safety.sos.data.SosEventEntity
import com.nirbhay.safety.sos.data.SosEventStatus
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Priority 1 per next.md §5 — works over cellular even with no data connection. */
class SmsTransport(private val context: Context) {

    fun send(event: SosEventEntity, recipients: List<String>): SmsSender.SendResult {
        if (recipients.isEmpty()) return SmsSender.SendResult(emptyList(), emptyList())
        val message = buildMessage(event)
        return SmsSender.send(context, recipients, message, eventId = event.id)
    }

    private fun buildMessage(event: SosEventEntity): String {
        val time = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date(event.createdAt))
        val location = if (event.latitude != null && event.longitude != null) {
            val freshness = if (event.locationIsFresh) "" else " (last known)"
            "https://maps.google.com/?q=${event.latitude},${event.longitude}$freshness"
        } else {
            "unavailable"
        }
        val battery = event.batteryPercent?.toString() ?: "unknown"
        return "🚨 JĀGRITI SOS\nEmergency detected.\nTime: $time\nLocation: $location\nBattery: $battery%"
    }
}

/** Converts a SendResult into what SosEventEntity.smsResult (JSON) stores. */
fun SmsSender.SendResult.toJson(): String =
    JSONObject().apply {
        put("sent", org.json.JSONArray(sent))
        put("failed", org.json.JSONArray(failed))
    }.toString()

/**
 * Records the call-time outcome. `sent` here only means "handed to
 * SmsManager without an exception" — SMS_ATTEMPTED, not SMS_SENT.
 * SmsSentReceiver is what actually confirms dispatch to the carrier and
 * advances the status to SMS_SENT.
 */
suspend fun applySmsResult(
    repo: SosEventRepository,
    event: SosEventEntity,
    result: SmsSender.SendResult
) {
    val updated = event.copy(
        smsResult = result.toJson(),
        status = if (result.sent.isNotEmpty()) SosEventStatus.SMS_ATTEMPTED.name else event.status
    )
    repo.update(updated)
}
