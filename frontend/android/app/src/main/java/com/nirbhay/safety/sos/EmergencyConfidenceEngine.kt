package com.nirbhay.safety.sos

/**
 * Multi-signal emergency scoring, replacing the old single dual-threshold
 * check (`accelVariance > 2 && gyroVariance > 0.5`). Mirrors next.md's
 * conceptual flow:
 *
 *   IMPACT -> ROTATION/ABNORMAL MOVEMENT -> CONTINUED IRREGULAR MOTION
 *          -> SUDDEN INACTIVITY -> HIGH SOS CONFIDENCE
 *
 * Pure Kotlin, no Android framework dependency, so it's unit-testable with
 * synthetic MotionFeatureSample sequences (see EmergencyConfidenceEngineTest).
 */
class EmergencyConfidenceEngine {

    private enum class State { IDLE, IMPACT_DETECTED, ABNORMAL_SEQUENCE, AWAITING_INACTIVITY_CHECK }

    private var state = State.IDLE
    private var windowStartMs: Long = 0
    private var confidence: Double = 0.0
    private var abnormalStreak: Int = 0
    private val signals = linkedSetOf<String>()

    data class Result(val confidence: Double, val triggerReason: String, val contributingSignals: List<String>)

    /** Feed one feature sample; returns a Result only when confidence crosses the trigger threshold. */
    fun onSample(sample: MotionFeatureSample): Result? {
        val t = MotionThresholds
        val isImpact = sample.jerk >= t.IMPACT_JERK_THRESHOLD ||
            sample.accelMagnitude >= t.IMPACT_ACCEL_MAGNITUDE_THRESHOLD
        val isRotation = sample.angularVelocityMagnitude >= t.ROTATION_ANGULAR_VELOCITY_THRESHOLD
        val isHighIntensity = sample.movementIntensity >= t.HIGH_INTENSITY_VARIANCE_THRESHOLD
        val isAbnormal = isImpact || isRotation || isHighIntensity

        val isLikelyVehicleMotion = !isImpact &&
            sample.movementIntensity in t.VEHICLE_MIN_SUSTAINED_INTENSITY..t.VEHICLE_MAX_SUSTAINED_INTENSITY &&
            sample.jerk < t.IMPACT_JERK_THRESHOLD
        val isLikelyWalkingRunning = !isImpact && sample.jerk < t.WALKING_RHYTHMIC_JERK_CEILING && !isRotation

        if (state != State.IDLE && sample.timestampMs - windowStartMs > t.IMPACT_WINDOW_MS && !sample.isInactive) {
            // Sequence window expired without resolving into inactivity — decay and reset.
            decay()
        }

        when (state) {
            State.IDLE -> {
                if (isImpact) {
                    state = State.IMPACT_DETECTED
                    windowStartMs = sample.timestampMs
                    confidence = t.WEIGHT_IMPACT
                    abnormalStreak = 1
                    signals.clear()
                    signals.add("IMPACT")
                }
            }

            State.IMPACT_DETECTED, State.ABNORMAL_SEQUENCE -> {
                if (isLikelyVehicleMotion || isLikelyWalkingRunning) {
                    decay()
                    return null
                }
                if (isRotation && signals.add("ROTATION")) {
                    confidence += t.WEIGHT_ROTATION
                }
                if (isAbnormal) {
                    abnormalStreak++
                    if (abnormalStreak >= t.ABNORMAL_STREAK_MIN_COUNT && signals.add("REPEATED_ABNORMAL_MOVEMENT")) {
                        confidence += t.WEIGHT_REPEATED_ABNORMAL
                    }
                }
                if (isHighIntensity && signals.add("HIGH_INTENSITY")) {
                    confidence += t.WEIGHT_HIGH_INTENSITY
                }
                state = State.ABNORMAL_SEQUENCE
                if (sample.isInactive) {
                    state = State.AWAITING_INACTIVITY_CHECK
                }
            }

            State.AWAITING_INACTIVITY_CHECK -> {
                if (sample.isInactive && signals.add("POST_IMPACT_INACTIVITY")) {
                    confidence += t.WEIGHT_POST_IMPACT_INACTIVITY
                } else if (!sample.isInactive && isAbnormal) {
                    state = State.ABNORMAL_SEQUENCE
                }
            }
        }

        confidence = confidence.coerceIn(0.0, 1.0)

        if (confidence >= t.CONFIDENCE_TRIGGER_THRESHOLD) {
            val result = Result(confidence, "AUTO_MOTION_DETECTED", signals.toList())
            reset()
            return result
        }
        return null
    }

    private fun decay() {
        confidence = (confidence - MotionThresholds.CONFIDENCE_DECAY_PER_TICK).coerceAtLeast(0.0)
        if (confidence <= 0.0) reset()
    }

    private fun reset() {
        state = State.IDLE
        confidence = 0.0
        abnormalStreak = 0
        signals.clear()
    }
}
