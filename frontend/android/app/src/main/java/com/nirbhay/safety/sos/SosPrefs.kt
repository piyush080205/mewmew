package com.nirbhay.safety.sos

import android.content.Context

/**
 * Small SharedPreferences-backed config, readable by the foreground
 * service, boot receiver, and WorkManager worker without JS/the bridge
 * being alive.
 */
object SosPrefs {
    private const val PREFS_NAME = "jagriti_sos_prefs"
    private const val KEY_MONITORING_ACTIVE = "monitoring_was_active"
    private const val KEY_TRIP_ID = "active_trip_id"
    private const val KEY_API_URL = "api_url"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun setMonitoringActive(context: Context, active: Boolean, tripId: String? = null) {
        prefs(context).edit()
            .putBoolean(KEY_MONITORING_ACTIVE, active)
            .apply { if (tripId != null) putString(KEY_TRIP_ID, tripId) }
            .apply()
    }

    fun wasMonitoringActive(context: Context): Boolean =
        prefs(context).getBoolean(KEY_MONITORING_ACTIVE, false)

    fun getTripId(context: Context): String? = prefs(context).getString(KEY_TRIP_ID, null)

    fun setApiUrl(context: Context, url: String) {
        prefs(context).edit().putString(KEY_API_URL, url).apply()
    }

    fun getApiUrl(context: Context): String? = prefs(context).getString(KEY_API_URL, null)
}
