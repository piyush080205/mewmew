package com.nirbhay.safety.sos

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.nirbhay.safety.sos.comm.CommunicationManager
import com.nirbhay.safety.sos.data.SosEventStatus
import java.util.concurrent.TimeUnit

/**
 * Connectivity-triggered retry backstop for the offline SOS queue
 * (next.md §5 Priority 4). Deliberately decoupled from the synchronous
 * first-attempt path in CommunicationManager, which always fires
 * immediately at trigger time regardless of this worker's schedule.
 */
class SosSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val repo = SosEventRepository(applicationContext)
        val comm = CommunicationManager(applicationContext)
        val pending = repo.getPending()
        if (pending.isEmpty()) return Result.success()

        var allDone = true
        for (event in pending) {
            if (event.serverSyncAttempts >= MotionThresholds.MAX_SYNC_RETRIES) continue
            repo.update(event.copy(serverSyncAttempts = event.serverSyncAttempts + 1))
            comm.handleSosEvent(repo.getById(event.id) ?: event)
            val refreshed = repo.getById(event.id)
            if (refreshed != null && refreshed.status != SosEventStatus.COMPLETED.name) {
                allDone = false
            }
        }

        return if (allDone) Result.success() else Result.retry()
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "jagriti_sos_sync_periodic"
        private const val IMMEDIATE_WORK_NAME = "jagriti_sos_sync_immediate"

        fun schedulePeriodic(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = PeriodicWorkRequestBuilder<SosSyncWorker>(
                MotionThresholds.SYNC_WORKER_PERIODIC_MINUTES, TimeUnit.MINUTES
            ).setConstraints(constraints).build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(PERIODIC_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        /** Fired immediately after a failed inline sync attempt, or when connectivity returns. */
        fun scheduleImmediateRetry(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<SosSyncWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
