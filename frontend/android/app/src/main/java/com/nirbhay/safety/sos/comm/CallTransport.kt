package com.nirbhay.safety.sos.comm

import com.nirbhay.safety.sos.data.SosEventEntity

sealed class CallAttemptResult {
    object NotImplemented : CallAttemptResult()
}

/**
 * Priority 2 per next.md §5 — intentionally NOT implemented this pass.
 * The product has no existing outgoing-call UI/permission to build on
 * (`CALL_PHONE` is not requested anywhere in this app), and next.md
 * explicitly says not to silently place calls unless platform permissions
 * and existing product design support it. This stub exists only so
 * CommunicationManager has a stable slot to call into once a real
 * call-fallback flow is designed — it must never report success.
 */
class CallTransport {
    fun attempt(event: SosEventEntity, recipients: List<String>): CallAttemptResult =
        CallAttemptResult.NotImplemented
}
