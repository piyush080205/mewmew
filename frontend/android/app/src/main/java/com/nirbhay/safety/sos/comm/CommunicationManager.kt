package com.nirbhay.safety.sos.comm

import android.content.Context
import com.nirbhay.safety.sos.SosEventRepository
import com.nirbhay.safety.sos.SosSyncWorker
import com.nirbhay.safety.sos.data.EmergencyContactEntity
import com.nirbhay.safety.sos.data.SosEventEntity
import com.nirbhay.safety.sos.data.SosEventStatus

/**
 * Orchestrates delivery in priority order (next.md §5):
 *   1. SMS (works over cellular with no data)
 *   2. Call fallback (stub — not implemented this pass)
 *   3. Internet sync to the backend
 *   4. Bluetooth relay (stub — not implemented this pass)
 * On failure of 1 & 3, the event is left queued (never dropped) and
 * SosSyncWorker is scheduled as the connectivity-triggered retry backstop.
 *
 * The event is ALWAYS persisted by the caller (SosTriggerCoordinator)
 * before this runs — this class only ever updates an existing row.
 */
class CommunicationManager(private val context: Context) {

    private val repo = SosEventRepository(context)
    private val smsTransport = SmsTransport(context)
    private val callTransport = CallTransport()
    private val internetTransport = InternetTransport(context)
    private val bluetoothRelayTransport = BluetoothRelayTransport()

    suspend fun handleSosEvent(event: SosEventEntity) {
        if (event.cancelled) return

        val contacts: List<EmergencyContactEntity> = repo.getContacts()
        val phoneNumbers = contacts.map { it.phoneNumber }.ifEmpty { event.smsRecipients }

        var current = event
        if (phoneNumbers.isNotEmpty()) {
            val smsResult = smsTransport.send(current, phoneNumbers)
            applySmsResult(repo, current, smsResult)
            current = repo.getById(current.id) ?: current
        }

        // Call fallback: stub only, never claims success.
        callTransport.attempt(current, phoneNumbers)

        var synced = false
        if (internetTransport.hasValidatedNetwork()) {
            synced = internetTransport.sync(current)
            if (synced) {
                repo.updateStatus(current.id, SosEventStatus.SERVER_SYNCED)
                current = repo.getById(current.id) ?: current
            }
        }

        // Bluetooth relay: stub only, never claims success.
        bluetoothRelayTransport.relay(current)

        val smsDone = current.status == SosEventStatus.SMS_ATTEMPTED.name || current.status == SosEventStatus.SMS_SENT.name
        if (synced && (smsDone || phoneNumbers.isEmpty())) {
            repo.updateStatus(current.id, SosEventStatus.COMPLETED)
        } else {
            // Not fully delivered yet — never silently drop it. WorkManager
            // will retry as soon as connectivity returns (next.md §5 Priority 4).
            SosSyncWorker.scheduleImmediateRetry(context)
        }
    }
}
