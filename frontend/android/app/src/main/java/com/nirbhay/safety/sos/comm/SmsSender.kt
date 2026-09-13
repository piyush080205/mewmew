package com.nirbhay.safety.sos.comm

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat

/**
 * Shared SmsManager send logic, factored out of SosSmsModule.kt so both the
 * JS-bridge module (manual/in-app sends) and SmsTransport (native offline
 * SOS path, which must work without JS/the bridge alive) use one
 * implementation instead of duplicating the API-31 branching.
 */
object SmsSender {

    const val ACTION_SMS_SENT = "com.nirbhay.safety.sos.SMS_SENT"
    const val ACTION_SMS_DELIVERED = "com.nirbhay.safety.sos.SMS_DELIVERED"
    const val EXTRA_EVENT_ID = "event_id"
    const val EXTRA_PHONE_NUMBER = "phone_number"

    data class SendResult(val sent: List<String>, val failed: List<String>)

    fun hasSendSmsPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun smsManager(context: Context): SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    /**
     * Sends [message] to each of [recipients]. When [eventId] is provided,
     * registers sent/delivered PendingIntents (picked up by SmsSentReceiver
     * /SmsDeliveredReceiver) so the caller can confirm actual dispatch
     * instead of assuming success at API-call time.
     */
    fun send(
        context: Context,
        recipients: List<String>,
        message: String,
        eventId: String? = null
    ): SendResult {
        if (!hasSendSmsPermission(context)) {
            return SendResult(sent = emptyList(), failed = recipients)
        }

        val manager = smsManager(context)
        val sent = mutableListOf<String>()
        val failed = mutableListOf<String>()

        for (phoneNumber in recipients) {
            if (phoneNumber.isBlank()) continue
            try {
                val parts = manager.divideMessage(message)
                val sentIntents = if (eventId != null) {
                    parts.indices.map { i -> sentPendingIntent(context, eventId, phoneNumber, i) }.toArrayList()
                } else null
                val deliveredIntents = if (eventId != null) {
                    parts.indices.map { i -> deliveredPendingIntent(context, eventId, phoneNumber, i) }.toArrayList()
                } else null

                manager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, deliveredIntents)
                sent.add(phoneNumber)
            } catch (e: Exception) {
                failed.add(phoneNumber)
            }
        }

        return SendResult(sent, failed)
    }

    private fun <T> List<T>.toArrayList() = ArrayList(this)

    private fun sentPendingIntent(context: Context, eventId: String, phone: String, part: Int): PendingIntent {
        val intent = Intent(ACTION_SMS_SENT).apply {
            setPackage(context.packageName)
            putExtra(EXTRA_EVENT_ID, eventId)
            putExtra(EXTRA_PHONE_NUMBER, phone)
        }
        return PendingIntent.getBroadcast(
            context, (eventId + phone + "sent" + part).hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun deliveredPendingIntent(context: Context, eventId: String, phone: String, part: Int): PendingIntent {
        val intent = Intent(ACTION_SMS_DELIVERED).apply {
            setPackage(context.packageName)
            putExtra(EXTRA_EVENT_ID, eventId)
            putExtra(EXTRA_PHONE_NUMBER, phone)
        }
        return PendingIntent.getBroadcast(
            context, (eventId + phone + "delivered" + part).hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
