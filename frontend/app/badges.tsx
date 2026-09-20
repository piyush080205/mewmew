import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getAllBadges, getUserBadges, Badge, UserBadge } from '../services/retentionApi';

const CATEGORY_LABELS: Record<string, string> = {
  streak: 'Streaks',
  trip: 'Trips',
  social: 'Community',
  safety: 'Safety',
  exploration: 'Exploration',
};

export default function BadgesScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [all, user] = await Promise.all([getAllBadges(), getUserBadges()]);
      setAllBadges(all);
      setEarned(new Set(user.map((b) => b.badge_id)));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const categories = [...new Set(allBadges.map((b) => b.category))];
  const earnedCount = earned.size;
  const totalCount = allBadges.length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Achievements</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.progressCard}>
          <Text style={styles.progressText}>
            {earnedCount} of {totalCount} badges earned
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        {categories.map((cat) => {
          const catBadges = allBadges.filter((b) => b.category === cat);
          return (
            <View key={cat} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat] ?? cat}</Text>
              <View style={styles.badgeGrid}>
                {catBadges.map((badge) => {
                  const isEarned = earned.has(badge.id);
                  return (
                    <View
                      key={badge.id}
                      style={[styles.badgeCard, !isEarned && styles.badgeLocked]}
                    >
                      <View
                        style={[
                          styles.badgeIcon,
                          isEarned
                            ? { backgroundColor: colors.primaryTint }
                            : { backgroundColor: colors.backgroundAlt },
                        ]}
                      >
                        <Ionicons
                          name={(badge.icon as any) || 'ribbon'}
                          size={28}
                          color={isEarned ? colors.primary : colors.textMuted}
                        />
                      </View>
                      <Text
                        style={[styles.badgeName, !isEarned && { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {badge.name}
                      </Text>
                      <Text style={styles.badgeDesc} numberOfLines={2}>
                        {badge.description}
                      </Text>
                      {!isEarned && (
                        <View style={styles.lockOverlay}>
                          <Ionicons name="lock-closed" size={12} color={colors.textPlaceholder} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
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
    progressCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 24,
      borderColor: colors.border,
      borderWidth: 1,
    },
    progressText: {
      fontSize: 14,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.backgroundAlt,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    categorySection: { marginBottom: 24 },
    categoryTitle: {
      fontSize: 16,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    badgeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    badgeCard: {
      width: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      borderColor: colors.border,
      borderWidth: 1,
    },
    badgeLocked: {
      opacity: 0.55,
    },
    badgeIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    badgeName: {
      fontSize: 14,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
      marginBottom: 4,
      textAlign: 'center',
    },
    badgeDesc: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
    lockOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
  });
