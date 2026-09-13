package com.nirbhay.safety.sos

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionFeatureExtractorTest {

    @Test
    fun `returns null before any accel sample`() {
        val extractor = MotionFeatureExtractor()
        assertTrue(extractor.extract(0L) == null)
    }

    @Test
    fun `jerk is zero on the first sample and reflects change afterwards`() {
        val extractor = MotionFeatureExtractor()
        extractor.onAccel(SensorSample(timestampNs = 0L, x = 0f, y = 0f, z = 9.8f))
        val first = extractor.extract(0L)!!
        assertTrue(first.jerk == 0.0)

        extractor.onAccel(SensorSample(timestampNs = 1_000_000_000L, x = 0f, y = 0f, z = 40f))
        val second = extractor.extract(1_000L)!!
        assertTrue(second.jerk > 0.0)
    }

    @Test
    fun `sustained low variance eventually reports inactive`() {
        val extractor = MotionFeatureExtractor()
        var lastInactive = false
        for (i in 0..40) {
            val tNs = i * 100_000_000L
            extractor.onAccel(SensorSample(tNs, 0f, 0f, 9.81f))
            val sample = extractor.extract(i * 100L)
            lastInactive = sample?.isInactive ?: false
        }
        assertTrue(lastInactive)
    }

    @Test
    fun `abrupt spike does not immediately report inactive`() {
        val extractor = MotionFeatureExtractor()
        extractor.onAccel(SensorSample(0L, 0f, 0f, 9.81f))
        extractor.extract(0L)
        extractor.onAccel(SensorSample(50_000_000L, 30f, 30f, 30f))
        val sample = extractor.extract(50L)!!
        assertFalse(sample.isInactive)
    }
}
