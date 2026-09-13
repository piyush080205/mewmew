import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface SafetyCheckModalProps {
  visible: boolean;
  onSafe: () => void;
  /** User explicitly tapped "No" — escalate right now rather than waiting
   * out the countdown (this must cancel native's pending timer first, then
   * raise one explicit SOS — see app/index.tsx handleTriggerAlert). */
  onNotSafe: () => void;
  /** This component's own countdown reached zero. Native
   * (EmergencyConfirmationController) owns the real timer and already
   * fires the actual SOS on its own — this is a display-only mirror, so
   * the handler here must only update UI state, never raise a second SOS. */
  onTimeout: () => void;
  /** Seconds until an SOS auto-fires. Sourced from the native confidence
   * engine's payload (MotionThresholds.DEFAULT_COUNTDOWN_SECONDS). */
  countdownSeconds?: number;
}

const DEFAULT_COUNTDOWN_SECONDS = 15;

export default function SafetyCheckModal({
  visible,
  onSafe,
  onNotSafe,
  onTimeout,
  countdownSeconds = DEFAULT_COUNTDOWN_SECONDS,
}: SafetyCheckModalProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [countdown, setCountdown] = React.useState(countdownSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setCountdown(countdownSeconds);
      resolvedRef.current = false;

      if (Platform.OS !== 'web') {
        Vibration.vibrate([500, 500, 500, 500, 500]);
      }

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            if (!resolvedRef.current) {
              resolvedRef.current = true;
              onTimeout();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, countdownSeconds]);

  const handleImSafe = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    resolvedRef.current = true;
    onSafe();
  };

  const handleNotSafe = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!resolvedRef.current) {
      resolvedRef.current = true;
      onNotSafe();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.timerContainer}>
            <View style={[styles.timerCircle, countdown <= 5 && styles.timerCircleUrgent]}>
              <Text style={[styles.timerText, countdown <= 5 && styles.timerTextUrgent]}>
                {countdown}
              </Text>
            </View>
            <Text style={styles.timerLabel}>
              {countdown <= 5 ? 'Alert in...' : 'Respond within'}
            </Text>
          </View>

          <View style={styles.iconContainer}>
            <Ionicons name="alert-circle" size={60} color={colors.danger} />
          </View>

          <Text style={styles.title}>Safety Check</Text>
          <Text style={styles.subtitle}>Unusual movement detected</Text>
          <Text style={styles.question}>Are you safe?</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.noButton]} onPress={handleNotSafe}>
              <Ionicons name="close" size={24} color={colors.white} />
              <Text style={styles.buttonText}>No</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.yesButton]} onPress={handleImSafe}>
              <Ionicons name="checkmark" size={24} color={colors.white} />
              <Text style={styles.buttonText}>I'm Safe</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            If you don't respond, an SOS alert will be sent automatically
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryTint,
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCircleUrgent: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
  timerText: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  timerTextUrgent: {
    color: colors.danger,
  },
  timerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginBottom: 16,
    textAlign: 'center',
  },
  question: {
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 120,
  },
  yesButton: {
    backgroundColor: colors.success,
  },
  noButton: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
  },
});
