package com.nirbhay.safety.sos.comm

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.nirbhay.safety.sos.SosPrefs
import com.nirbhay.safety.sos.data.SosEventEntity
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Priority 3 per next.md §5. Works without JS/the bridge alive — a plain
 * native HTTP client, not React Native's networking stack, since this must
 * fire from a background service or a WorkManager job.
 */
class InternetTransport(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    data class SyncResult(val success: Boolean, val shareLink: String? = null)

    fun hasValidatedNetwork(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /**
     * Syncs the event to the backend. On success also returns the live-share
     * link the backend minted for this event's trip (POST /api/sos/sync's
     * `share_links[client_event_id]`), if any — the caller uses it to send a
     * follow-up SMS over the same free, on-device channel, since this app
     * doesn't require a paid SMS gateway to deliver the live link.
     */
    fun sync(event: SosEventEntity): SyncResult {
        val apiUrl = SosPrefs.getApiUrl(context)
        if (apiUrl.isNullOrBlank() || !hasValidatedNetwork()) return SyncResult(success = false)

        return try {
            val body = JSONObject().put("events", JSONArray().put(toPayload(event)))
                .toString()
                .toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url("$apiUrl/api/sos/sync")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return SyncResult(success = false)
                val json = JSONObject(response.body?.string().orEmpty())
                val shareLink = json.optJSONObject("share_links")?.optString(event.id)?.takeIf { it.isNotBlank() }
                SyncResult(success = true, shareLink = shareLink)
            }
        } catch (e: Exception) {
            SyncResult(success = false)
        }
    }

    private fun toPayload(event: SosEventEntity): JSONObject {
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        return JSONObject().apply {
            put("client_event_id", event.id)
            put("trip_id", event.tripId)
            put("created_at", iso.format(event.createdAt))
            put("latitude", event.latitude)
            put("longitude", event.longitude)
            put("accuracy_meters", event.accuracyMeters)
            put("location_is_fresh", event.locationIsFresh)
            event.locationTimestamp?.let { put("location_timestamp", iso.format(it)) }
            put("battery_percent", event.batteryPercent)
            put("confidence", event.confidence)
            put("trigger_reason", event.triggerReason)
            put("contributing_signals", JSONArray(event.contributingSignals))
            put("status", event.status)
            put("sms_recipients", JSONArray(event.smsRecipients))
            event.smsResult?.let { put("sms_result", JSONObject(it)) }
            put("cancelled", event.cancelled)
        }
    }
}
