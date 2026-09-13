package com.nirbhay.safety.sos

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

private fun sample(
    tMs: Long,
    accelMagnitude: Double = 9.8,
    jerk: Double = 0.0,
    angularVelocity: Double = 0.0,
    intensity: Double = 0.1,
    inactive: Boolean = false
) = MotionFeatureSample(tMs, accelMagnitude, jerk, angularVelocity, intensity, inactive)

class EmergencyConfidenceEngineTest {

    @Test
    fun `normal walking never crosses the trigger threshold`() {
        val engine = EmergencyConfidenceEngine()
        var triggered = false
        for (i in 0..100) {
            val t = i * 200L
            // Rhythmic, low-jerk, no rotation, no sustained inactivity — walking.
            val result = engine.onSample(
                sample(t, accelMagnitude = 11.0, jerk = 5.0, angularVelocity = 0.5, intensity = 1.5)
            )
            if (result != null) triggered = true
        }
        assert(!triggered) { "Walking pattern should never trigger an emergency candidate" }
    }

    @Test
    fun `sustained vehicle vibration never crosses the trigger threshold`() {
        val engine = EmergencyConfidenceEngine()
        var triggered = false
        for (i in 0..100) {
            val t = i * 200L
            val result = engine.onSample(
                sample(t, accelMagnitude = 10.5, jerk = 3.0, angularVelocity = 0.2, intensity = 5.0)
            )
            if (result != null) triggered = true
        }
        assert(!triggered) { "Vehicle vibration pattern should never trigger an emergency candidate" }
    }

    @Test
    fun `impact, rotation, then inactivity crosses the trigger threshold`() {
        val engine = EmergencyConfidenceEngine()
        var result: EmergencyConfidenceEngine.Result? = null

        // 1. Impact.
        result = engine.onSample(sample(0L, accelMagnitude = 25.0, jerk = 40.0, intensity = 12.0))
        assertNull("A single impact alone should not yet be a full emergency candidate", result)

        // 2. Rapid rotation + repeated abnormal movement, then sudden inactivity —
        // the conceptual flow from next.md: IMPACT -> ROTATION/ABNORMAL ->
        // CONTINUED IRREGULAR MOTION -> INACTIVITY -> HIGH CONFIDENCE.
        var t = 200L
        repeat(4) {
            result = engine.onSample(
                sample(t, accelMagnitude = 20.0, jerk = 30.0, angularVelocity = 8.0, intensity = 10.0)
            )
            t += 200L
        }
        while (result == null && t < 10_000L) {
            result = engine.onSample(sample(t, accelMagnitude = 9.8, jerk = 0.0, angularVelocity = 0.0, intensity = 0.05, inactive = true))
            t += 200L
        }

        assertNotNull("Impact -> rotation -> abnormal -> inactivity sequence should trigger", result)
    }
}
