package com.nirbhay.safety.sos

import kotlin.math.sqrt

/** One raw sensor reading, timestamped in elapsed-realtime nanos (matches SensorEvent.timestamp). */
data class SensorSample(val timestampNs: Long, val x: Float, val y: Float, val z: Float) {
    val magnitude: Double get() = sqrt((x * x + y * y + z * z).toDouble())
}

/** Computed motion features for one evaluation tick, fed into EmergencyConfidenceEngine. */
data class MotionFeatureSample(
    val timestampMs: Long,
    val accelMagnitude: Double,
    val jerk: Double,
    val angularVelocityMagnitude: Double,
    val movementIntensity: Double, // rolling variance/RMS of accelMagnitude over INTENSITY_WINDOW_MS
    val isInactive: Boolean
)

/**
 * Turns raw accelerometer/gyroscope samples into the higher-level features
 * next.md asks for: magnitude, jerk (sudden impact), angular velocity
 * (rotation), movement intensity, and post-impact inactivity. Holds only a
 * small rolling window of state — never accumulates unbounded raw data.
 */
class MotionFeatureExtractor {

    private var lastAccelMagnitude: Double? = null
    private var lastAccelTimestampNs: Long? = null
    private val intensityWindow = ArrayDeque<Pair<Long, Double>>() // (timestampMs, accelMagnitude)
    private var quietSinceMs: Long? = null

    private var latestAccel: SensorSample? = null
    private var latestGyro: SensorSample? = null

    fun onAccel(sample: SensorSample) {
        latestAccel = sample
    }

    fun onGyro(sample: SensorSample) {
        latestGyro = sample
    }

    /** Call roughly every MotionThresholds.FEATURE_TICK_MS. Returns null until we have an accel sample. */
    fun extract(nowMs: Long): MotionFeatureSample? {
        val accel = latestAccel ?: return null
        val gyro = latestGyro

        val accelMagnitude = accel.magnitude
        val jerk = computeJerk(accelMagnitude, accel.timestampNs)
        val angularVelocityMagnitude = gyro?.magnitude ?: 0.0

        intensityWindow.addLast(nowMs to accelMagnitude)
        val cutoff = nowMs - MotionThresholds.INTENSITY_WINDOW_MS
        while (intensityWindow.isNotEmpty() && intensityWindow.first().first < cutoff) {
            intensityWindow.removeFirst()
        }
        val movementIntensity = variance(intensityWindow.map { it.second })

        val isQuietNow = movementIntensity < MotionThresholds.INACTIVITY_VARIANCE_THRESHOLD
        if (isQuietNow) {
            if (quietSinceMs == null) quietSinceMs = nowMs
        } else {
            quietSinceMs = null
        }
        val isInactive = isQuietNow &&
            quietSinceMs != null &&
            (nowMs - quietSinceMs!!) >= MotionThresholds.INACTIVITY_MIN_DURATION_MS

        return MotionFeatureSample(
            timestampMs = nowMs,
            accelMagnitude = accelMagnitude,
            jerk = jerk,
            angularVelocityMagnitude = angularVelocityMagnitude,
            movementIntensity = movementIntensity,
            isInactive = isInactive
        )
    }

    private fun computeJerk(accelMagnitude: Double, timestampNs: Long): Double {
        val prevMag = lastAccelMagnitude
        val prevTs = lastAccelTimestampNs
        lastAccelMagnitude = accelMagnitude
        lastAccelTimestampNs = timestampNs
        if (prevMag == null || prevTs == null) return 0.0
        val dtSeconds = (timestampNs - prevTs) / 1_000_000_000.0
        if (dtSeconds <= 0.0) return 0.0
        return (accelMagnitude - prevMag) / dtSeconds
    }

    private fun variance(values: List<Double>): Double {
        if (values.size < 2) return 0.0
        val mean = values.sum() / values.size
        return values.sumOf { (it - mean) * (it - mean) } / values.size
    }
}
