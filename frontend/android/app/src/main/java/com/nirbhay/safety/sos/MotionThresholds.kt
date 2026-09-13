package com.nirbhay.safety.sos

/**
 * Every tunable constant for motion detection + the confidence engine lives
 * here, centralized, per next.md's "keep thresholds centralized so they can
 * be tuned later" requirement. Nothing below is a magic number inlined
 * elsewhere — change values here to retune sensitivity.
 */
object MotionThresholds {

    // --- Sampling ---
    const val SAMPLING_PERIOD_ACTIVE_US = 20_000        // ~SENSOR_DELAY_GAME
    const val SAMPLING_PERIOD_QUIET_US = 200_000        // ~SENSOR_DELAY_NORMAL
    const val QUIET_PERIOD_MS = 60_000L                 // switch to low-power sampling after this long with no activity
    const val FEATURE_TICK_MS = 200L                    // how often features/engine are evaluated

    // --- Feature windows ---
    const val INTENSITY_WINDOW_MS = 1_000L              // rolling window for movement-intensity (variance/RMS)
    const val RING_BUFFER_DURATION_MS = 5_000L          // max raw-sample retention (never unbounded)

    // --- Signal thresholds ---
    const val IMPACT_JERK_THRESHOLD = 25.0              // m/s^3, sudden spike in acceleration magnitude
    const val IMPACT_ACCEL_MAGNITUDE_THRESHOLD = 18.0   // m/s^2, absolute magnitude spike (post-gravity-removal)
    const val ROTATION_ANGULAR_VELOCITY_THRESHOLD = 6.0 // rad/s, rapid orientation change
    const val HIGH_INTENSITY_VARIANCE_THRESHOLD = 8.0   // sustained high-energy motion (vs. calm/walking)
    const val INACTIVITY_VARIANCE_THRESHOLD = 0.3       // near-zero motion after an impact
    const val INACTIVITY_MIN_DURATION_MS = 2_500L       // how long "still" must persist to count as post-impact inactivity
    const val ABNORMAL_STREAK_MIN_COUNT = 3             // consecutive abnormal ticks to count as "repeated abnormal movement"

    // --- Vehicle / walking exclusion bands (kept motion from scoring as an impact) ---
    const val VEHICLE_MIN_SUSTAINED_INTENSITY = 2.0
    const val VEHICLE_MAX_SUSTAINED_INTENSITY = HIGH_INTENSITY_VARIANCE_THRESHOLD
    const val WALKING_RHYTHMIC_JERK_CEILING = IMPACT_JERK_THRESHOLD * 0.5

    // --- Confidence engine ---
    const val IMPACT_WINDOW_MS = 5_000L                 // time window after an impact to see the rest of the sequence
    const val WEIGHT_IMPACT = 0.35
    const val WEIGHT_ROTATION = 0.20
    const val WEIGHT_REPEATED_ABNORMAL = 0.20
    const val WEIGHT_HIGH_INTENSITY = 0.10
    const val WEIGHT_POST_IMPACT_INACTIVITY = 0.25
    const val CONFIDENCE_DECAY_PER_TICK = 0.05           // score decay when the sequence doesn't cohere
    const val CONFIDENCE_TRIGGER_THRESHOLD = 0.75

    // --- Confirmation countdown ---
    const val DEFAULT_COUNTDOWN_SECONDS = 15
    const val MIN_COUNTDOWN_SECONDS = 10
    const val MAX_COUNTDOWN_SECONDS = 20

    // --- Sync / retry ---
    const val MAX_SYNC_RETRIES = 20
    const val SYNC_WORKER_PERIODIC_MINUTES = 15L
}
