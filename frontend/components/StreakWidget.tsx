import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { dailyCheckin, getStreak, StreakInfo, UserBadge } from '../services/retentionApi';

interface Props {
  userId?: string;
  onNewBadge?: (badges: UserBadge[]) => void;
}

export default function StreakWidget({ userId = 'default_user', onNewBadge }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStreak();
  }, []);

  const loadStreak = async () => {
    const data = await getStreak(userId);
    if (data) {
      setStreak(data);
      const today = new Date().toISOString().split('T')[0];
      setCheckedIn(data.last_checkin_date === today);
    }
  };

  const handleCheckin = async () => {
    if (checkedIn || loading) return;
    setLoading(true);
    const res = await dailyCheckin(userId);
    if (res) {
      setStreak(res.streak);
      setCheckedIn(true);
      if (res.new_badges.length > 0 && onNewBadge) {
        onNewBadge(res.new_badges);
      }
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.streakRow}>
        <View style={styles.streakInfo}>
          <View style={styles.flameRow}>
            <Ionicons name="flame" size={28} color={checkedIn ? colors.amber : colors.textMuted} />
            <Text style={[styles.streakCount, checkedIn && { color: colors.amber }]}>
              {streak?.current_streak ?? 0}
            </Text>
          </View>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{streak?.longest_streak ?? 0}</Text>
            <Text style={styles.statLabel}>Best</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{streak?.total_checkins ?? 0}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.checkinButton, checkedIn && styles.checkedInButton]}
          onPress={handleCheckin}
          disabled={checkedIn || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons
                name={checkedIn ? 'checkmark-circle' : 'sunny'}
                size={18}
                color={colors.white}
              />
              <Text style={styles.checkinText}>
                {checkedIn ? 'Done' : "I'm Safe"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    streakInfo: {
      alignItems: 'center',
    },
    flameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    streakCount: {
      fontSize: 28,
      fontFamily: fonts.extraBold,
      color: colors.textPrimary,
    },
    streakLabel: {
      fontSize: 12,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
    },
    statDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    checkinButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    checkedInButton: {
      backgroundColor: colors.success,
    },
    checkinText: {
      color: colors.white,
      fontSize: 14,
      fontFamily: fonts.semiBold,
    },
  });
