import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getDashboardStats, getUserBadges, DashboardStats, UserBadge } from '../services/retentionApi';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const [s, b] = await Promise.all([getDashboardStats(), getUserBadges()]);
    if (s) setStats(s);
    setBadges(b);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const scoreColor =
    (stats?.safety_score ?? 0) >= 70
      ? colors.success
      : (stats?.safety_score ?? 0) >= 40
      ? colors.amber
      : colors.danger;

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Safety Dashboard</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Safety Score */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{stats?.safety_score ?? 0}</Text>
            <Text style={styles.scoreLabel}>Safety Score</Text>
          </View>
          <Text style={styles.scoreHint}>
            Check in daily, complete trips, and earn badges to boost your score
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="navigate" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{stats?.completed_trips ?? 0}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="speedometer" size={24} color={colors.success} />
            <Text style={styles.statValue}>{stats?.total_distance_km ?? 0}</Text>
            <Text style={styles.statLabel}>km traveled</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={24} color={colors.purple} />
            <Text style={styles.statValue}>{formatDuration(stats?.total_duration_minutes ?? 0)}</Text>
            <Text style={styles.statLabel}>Protected</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={24} color={colors.amber} />
            <Text style={styles.statValue}>{stats?.current_streak ?? 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="ribbon" size={24} color={colors.danger} />
            <Text style={styles.statValue}>{stats?.badges_earned ?? 0}</Text>
            <Text style={styles.statLabel}>Badges</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="megaphone" size={24} color={colors.orange} />
            <Text style={styles.statValue}>{stats?.reports_submitted ?? 0}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
        </View>

        {/* Recent Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Badges Earned</Text>
            <TouchableOpacity onPress={() => router.push('/badges')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {badges.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="ribbon-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No badges yet — check in daily to start earning!</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
              {badges.map((b) => (
                <View key={b.badge_id} style={styles.badgeItem}>
                  <View style={styles.badgeIcon}>
                    <Ionicons name={(b.icon as any) || 'ribbon'} size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.badgeName} numberOfLines={1}>{b.name}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Improve Your Score</Text>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/community')}>
            <Ionicons name="megaphone" size={22} color={colors.orange} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Report an unsafe area</Text>
              <Text style={styles.actionDesc}>Help your community stay safe</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/tips')}>
            <Ionicons name="bulb" size={22} color={colors.amber} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Read safety tips</Text>
              <Text style={styles.actionDesc}>Daily tips to keep you aware</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 20, paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    backButton: { padding: 8 },
    title: {
      fontSize: 20,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
    },
    scoreCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    scoreCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.backgroundAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    scoreValue: {
      fontSize: 40,
      fontFamily: fonts.extraBold,
    },
    scoreLabel: {
      fontSize: 12,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    scoreHint: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      width: '30%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      gap: 6,
      borderColor: colors.border,
      borderWidth: 1,
    },
    statValue: {
      fontSize: 20,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
    },
    section: { marginBottom: 24 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
    },
    seeAll: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.primary,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      gap: 8,
      borderColor: colors.border,
      borderWidth: 1,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
    badgeScroll: { paddingVertical: 4 },
    badgeItem: {
      alignItems: 'center',
      marginRight: 16,
      width: 72,
    },
    badgeIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    badgeName: {
      fontSize: 11,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 8,
      gap: 12,
      borderColor: colors.border,
      borderWidth: 1,
    },
    actionText: { flex: 1 },
    actionTitle: {
      fontSize: 14,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
    },
    actionDesc: {
      fontSize: 12,
      fontFamily: fonts.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
