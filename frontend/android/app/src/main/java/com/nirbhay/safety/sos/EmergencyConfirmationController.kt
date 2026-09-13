package com.nirbhay.safety.sos

import android.content.Context
import android.os.CountDownTimer
import java.util.UUID

data class PendingSosContext(
    val pendingId: String,
    val tripId: String?,
    val confidence: Double,
    val triggerReason: String,
    val contributingSignals: List<String>
)

/**
 * Owns the "Are you safe?" countdown natively so it fires even if JS/the
 * activity is dead (next.md §3) — the JS modal, when present, is only a
 * view onto this controller, never a second source of truth. Exactly one
 * countdown can be active at a time; both a notification action button and
 * the JS modal call confirmSafe()/let it expire into the same trigger path.
 */
class EmergencyConfirmationController(private val context: Context) {

    interface Listener {
        fun onCountdownStarted(pending: PendingSosContext, countdownSeconds: Int)
        fun onCountdownTick(pendingId: String, secondsRemaining: Int)
        fun onCountdownCancelled(pendingId: String)
        fun onSosTriggered(pendingId: String)
    }

    var listener: Listener? = null
        set(value) {
            field = value
        }

    private var timer: CountDownTimer? = null
    private var active: PendingSosContext? = null

    val activePendingId: String? get() = active?.pendingId

    fun startCountdown(
        tripId: String?,
        confidence: Double,
        triggerReason: String,
        contributingSignals: List<String>,
        countdownSeconds: Int = MotionThresholds.DEFAULT_COUNTDOWN_SECONDS,
        onExpire: (PendingSosContext) -> Unit
    ): PendingSosContext {
        // Only one active countdown at a time — a second candidate while one
        // is already pending doesn't restart the clock.
        active?.let { return it }

        val pending = PendingSosContext(
            pendingId = UUID.randomUUID().toString(),
            tripId = tripId,
            confidence = confidence,
            triggerReason = triggerReason,
            contributingSignals = contributingSignals
        )
        active = pending
        listener?.onCountdownStarted(pending, countdownSeconds)

        timer = object : CountDownTimer(countdownSeconds * 1000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                listener?.onCountdownTick(pending.pendingId, (millisUntilFinished / 1000L).toInt())
            }

            override fun onFinish() {
                active = null
                listener?.onSosTriggered(pending.pendingId)
                onExpire(pending)
            }
        }.start()

        return pending
    }

    /** Called from the JS bridge (confirmSafe) or a notification "I'm Safe" action. */
    fun confirmSafe(pendingId: String): Boolean {
        val current = active ?: return false
        if (current.pendingId != pendingId) return false
        timer?.cancel()
        timer = null
        active = null
        listener?.onCountdownCancelled(pendingId)
        return true
    }

    /** Escalates immediately without waiting for the countdown (e.g. user tapped "I'm not okay"). */
    fun triggerNow(onExpire: (PendingSosContext) -> Unit) {
        val current = active ?: return
        timer?.cancel()
        timer = null
        active = null
        listener?.onSosTriggered(current.pendingId)
        onExpire(current)
    }
}
