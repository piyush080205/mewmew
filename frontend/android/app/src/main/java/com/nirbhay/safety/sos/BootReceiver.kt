package com.nirbhay.safety.sos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts monitoring after a reboot if it was active before (next.md §1
 * "restart appropriately after service/device restart where permitted").
 * Note: some OEMs (MIUI/ColorOS/FuntouchOS) block boot-triggered
 * foreground-service starts unless the user has granted "autostart" —
 * this is a platform/OEM limitation no app code can override.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        if (SosPrefs.wasMonitoringActive(context)) {
            MotionForegroundService.start(context, SosPrefs.getTripId(context))
        }
    }
}
