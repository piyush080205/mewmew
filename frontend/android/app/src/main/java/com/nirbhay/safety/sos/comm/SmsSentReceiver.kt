package com.nirbhay.safety.sos.comm

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.nirbhay.safety.sos.SosEventRepository
import com.nirbhay.safety.sos.data.SosEventStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Confirms an SMS was actually handed to the radio ("sent to carrier") —
 * this is NOT confirmation of receipt by the recipient. Fire-and-forget
 * `sendMultipartTextMessage(..., null, null)` (the app's previous behavior)
 * never gave this signal at all.
 */
class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val eventId = intent.getStringExtra(SmsSender.EXTRA_EVENT_ID) ?: return
        val success = resultCode == Activity.RESULT_OK

        CoroutineScope(Dispatchers.IO).launch {
            val repo = SosEventRepository(context)
            val event = repo.getById(eventId) ?: return@launch
            if (success && event.status == SosEventStatus.SMS_ATTEMPTED.name) {
                repo.updateStatus(eventId, SosEventStatus.SMS_SENT)
            }
        }
    }
}

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val eventId = intent.getStringExtra(SmsSender.EXTRA_EVENT_ID) ?: return
        // Delivery confirmation to the handset, when the carrier supports it
        // (many carriers never report this). Logged for diagnostics only —
        // SMS_SENT (handed to the radio) is the status transition we rely on.
        Log.i("SmsDeliveredReceiver", "SOS SMS delivery report for $eventId: resultCode=$resultCode")
    }
}
