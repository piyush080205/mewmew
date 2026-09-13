package com.nirbhay.safety.sos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest

/**
 * Registered by MotionForegroundService while it's running; fires
 * SosSyncWorker the moment connectivity returns, instead of waiting for the
 * periodic 15-minute backstop (next.md §5 Priority 4).
 */
class ConnectivityReceiver {

    private var callback: ConnectivityManager.NetworkCallback? = null

    fun register(context: Context) {
        if (callback != null) return
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                SosSyncWorker.scheduleImmediateRetry(context.applicationContext)
            }
        }
        callback = cb
        cm.registerNetworkCallback(request, cb)
    }

    fun unregister(context: Context) {
        val cb = callback ?: return
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        try {
            cm.unregisterNetworkCallback(cb)
        } catch (_: Exception) {
            // Already unregistered — fine.
        }
        callback = null
    }
}
