package com.nirbhay.safety.sos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.nirbhay.safety.MainActivity

/**
 * Continuous native sensor monitoring (next.md §1). Runs the feature
 * extractor + confidence engine on a Handler tick, owns the confirmation
 * countdown, and is the single detection path for both foreground and
 * backgrounded app states — JS no longer runs its own detector.
 */
class MotionForegroundService : Service(), SensorEventListener {

    companion object {
        const val ACTION_STOP = "com.nirbhay.safety.sos.action.STOP"
        const val ACTION_CONFIRM_SAFE = "com.nirbhay.safety.sos.action.CONFIRM_SAFE"
        const val EXTRA_TRIP_ID = "trip_id"
        const val EXTRA_PENDING_ID = "pending_id"

        private const val NOTIFICATION_ID = 4201
        private const val CHANNEL_ID = "jagriti_safety_monitoring"
        private const val CONFIRM_CHANNEL_ID = "jagriti_safety_confirmation"
        private const val CONFIRM_NOTIFICATION_ID = 4202

        fun start(context: Context, tripId: String?) {
            val intent = Intent(context, MotionForegroundService::class.java).apply {
                putExtra(EXTRA_TRIP_ID, tripId)
            }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, MotionForegroundService::class.java).apply {
                action = ACTION_STOP
            })
        }

        /** Set/cleared in onCreate/onDestroy; used only for lightweight status queries from JS. */
        @Volatile var runningInstance: MotionForegroundService? = null
            private set
    }

    private val handler = Handler(Looper.getMainLooper())
    private val extractor = MotionFeatureExtractor()
    private val engine = EmergencyConfidenceEngine()
    private val confirmationController = EmergencyConfirmationController(this)
    private val connectivityReceiver = ConnectivityReceiver()

    private var sensorManager: SensorManager? = null
    private var tripId: String? = null
    private var lastActivityAtMs = SystemClock.elapsedRealtime()
    private var currentSamplingIsActive = true

    private val tickRunnable = object : Runnable {
        override fun run() {
            onFeatureTick()
            handler.postDelayed(this, MotionThresholds.FEATURE_TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        runningInstance = this
        createNotificationChannels()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        confirmationController.listener = confirmationListener
        connectivityReceiver.register(this)
        SosSyncWorker.schedulePeriodic(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelfSafely()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_CONFIRM_SAFE) {
            val pendingId = intent.getStringExtra(EXTRA_PENDING_ID)
            if (pendingId != null) confirmationController.confirmSafe(pendingId)
            return START_STICKY
        }

        tripId = intent?.getStringExtra(EXTRA_TRIP_ID) ?: tripId ?: SosPrefs.getTripId(this)
        SosPrefs.setMonitoringActive(this, active = true, tripId = tripId)

        startForeground(NOTIFICATION_ID, buildMonitoringNotification())
        registerSensors()
        handler.removeCallbacks(tickRunnable)
        handler.post(tickRunnable)

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        runningInstance = null
        handler.removeCallbacks(tickRunnable)
        sensorManager?.unregisterListener(this)
        connectivityReceiver.unregister(this)
    }

    /** Read by MotionMonitorModule.getMonitoringStatus() — the currently pending confirmation, if any. */
    fun activePendingId(): String? = confirmationController.activePendingId

    private fun stopSelfSafely() {
        SosPrefs.setMonitoringActive(this, active = false)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // --- Sensors ---

    private fun registerSensors() {
        val sm = sensorManager ?: return
        sm.unregisterListener(this)
        val linearAccel = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
            ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val gyro = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        val period = if (currentSamplingIsActive) {
            MotionThresholds.SAMPLING_PERIOD_ACTIVE_US
        } else {
            MotionThresholds.SAMPLING_PERIOD_QUIET_US
        }

        linearAccel?.let { sm.registerListener(this, it, period) }
        gyro?.let { sm.registerListener(this, it, period) }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_LINEAR_ACCELERATION, Sensor.TYPE_ACCELEROMETER ->
                extractor.onAccel(SensorSample(event.timestamp, event.values[0], event.values[1], event.values[2]))
            Sensor.TYPE_GYROSCOPE ->
                extractor.onGyro(SensorSample(event.timestamp, event.values[0], event.values[1], event.values[2]))
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // --- Feature evaluation / adaptive sampling ---

    private fun onFeatureTick() {
        val nowMs = System.currentTimeMillis()
        val feature = extractor.extract(nowMs) ?: return

        val isActive = feature.movementIntensity > MotionThresholds.INACTIVITY_VARIANCE_THRESHOLD
        if (isActive) {
            lastActivityAtMs = SystemClock.elapsedRealtime()
            if (!currentSamplingIsActive) {
                currentSamplingIsActive = true
                registerSensors()
            }
        } else if (currentSamplingIsActive &&
            SystemClock.elapsedRealtime() - lastActivityAtMs > MotionThresholds.QUIET_PERIOD_MS
        ) {
            currentSamplingIsActive = false
            registerSensors()
        }

        // Don't evaluate new candidates while a confirmation is already pending.
        if (confirmationController.activePendingId != null) return

        val result = engine.onSample(feature) ?: return
        val pending = confirmationController.startCountdown(
            tripId = tripId,
            confidence = result.confidence,
            triggerReason = result.triggerReason,
            contributingSignals = result.contributingSignals,
            onExpire = { ctx -> fireSos(ctx) }
        )
        showConfirmationNotification(pending, MotionThresholds.DEFAULT_COUNTDOWN_SECONDS)
        MotionMonitorBridge.emitCandidate(
            pending.pendingId, pending.confidence, pending.triggerReason, MotionThresholds.DEFAULT_COUNTDOWN_SECONDS
        )
    }

    // --- Confirmation lifecycle ---

    private val confirmationListener = object : EmergencyConfirmationController.Listener {
        override fun onCountdownStarted(pending: PendingSosContext, countdownSeconds: Int) {}

        override fun onCountdownTick(pendingId: String, secondsRemaining: Int) {}

        override fun onCountdownCancelled(pendingId: String) {
            dismissConfirmationNotification()
            MotionMonitorBridge.emitStatus(pendingId, "CANCELLED")
        }

        override fun onSosTriggered(pendingId: String) {
            dismissConfirmationNotification()
        }
    }

    private fun fireSos(ctx: PendingSosContext) {
        val location = getBestKnownLocation()
        val battery = getBatteryPercent()
        SosTriggerCoordinator.trigger(
            context = applicationContext,
            eventId = ctx.pendingId,
            tripId = ctx.tripId,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracyMeters = location?.accuracy,
            locationIsFresh = location?.let { isLocationFresh(it) } ?: false,
            locationTimestamp = location?.time,
            batteryPercent = battery,
            confidence = ctx.confidence,
            triggerReason = ctx.triggerReason,
            contributingSignals = ctx.contributingSignals,
            onPersisted = { MotionMonitorBridge.emitStatus(ctx.pendingId, "PENDING") }
        )
    }

    /** Public entry for manual SOS (no candidate/countdown involved) — used by MotionMonitorModule.triggerManualSos. */
    fun triggerManualSos(reason: String) {
        val location = getBestKnownLocation()
        val battery = getBatteryPercent()
        SosTriggerCoordinator.trigger(
            context = applicationContext,
            tripId = tripId,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracyMeters = location?.accuracy,
            locationIsFresh = location?.let { isLocationFresh(it) } ?: false,
            locationTimestamp = location?.time,
            batteryPercent = battery,
            confidence = 1.0,
            triggerReason = reason,
            contributingSignals = listOf("MANUAL")
        )
    }

    private fun getBestKnownLocation(): Location? {
        val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        return providers.mapNotNull {
            try {
                lm.getLastKnownLocation(it)
            } catch (_: SecurityException) {
                null
            }
        }.maxByOrNull { it.time }
    }

    private fun isLocationFresh(location: Location): Boolean =
        System.currentTimeMillis() - location.time < 2 * 60 * 1000L // 2 minutes

    private fun getBatteryPercent(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (level in 0..100) level else null
    }

    // --- Notifications ---

    private fun createNotificationChannels() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Safety monitoring", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows when background motion monitoring is active"
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CONFIRM_CHANNEL_ID, "Safety confirmation", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Are-you-safe confirmation prompts"
            }
        )
    }

    private fun buildMonitoringNotification(): Notification {
        val stopIntent = PendingIntent.getService(
            this, 0, Intent(this, MotionForegroundService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jāgriti safety monitoring active")
            .setContentText("Your movement is being watched for signs of an emergency.")
            .setSmallIcon(android.R.drawable.ic_menu_myplaces)
            .setOngoing(true)
            .addAction(0, "Stop monitoring", stopIntent)
            .build()
    }

    private fun showConfirmationNotification(pending: PendingSosContext, countdownSeconds: Int) {
        val fullScreenIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val safeIntent = PendingIntent.getService(
            this, 1, Intent(this, MotionForegroundService::class.java).apply {
                action = ACTION_CONFIRM_SAFE
                putExtra(EXTRA_PENDING_ID, pending.pendingId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CONFIRM_CHANNEL_ID)
            .setContentTitle("Are you safe?")
            .setContentText("Unusual movement detected. Sending an alert in $countdownSeconds seconds unless you respond.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenIntent, true)
            .setAutoCancel(false)
            .addAction(0, "I'm Safe", safeIntent)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(CONFIRM_NOTIFICATION_ID, notification)
    }

    private fun dismissConfirmationNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(CONFIRM_NOTIFICATION_ID)
    }
}
