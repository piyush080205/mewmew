import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
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

const CATEGORY_ICONS: Record<string, string> = {
  streak: 'flame',
  trip: 'navigate',
  social: 'people',
  safety: 'shield-checkmark',
  exploration: 'compass',
};

export default function BadgesScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

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
  const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  const filteredCategories = activeFilter === 'all'
    ? categories
    : categories.filter((c) => c === activeFilter);

  const filterTabs = [
    { key: 'all', label: 'All' },
    ...categories.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Achievements</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Decorative Header */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconsRow}>
            <View style={[styles.heroBadge, { backgroundColor: colors.amberTint }]}>
              <Ionicons name="trophy" size={28} color={colors.amber} />
            </View>
            <View style={[styles.heroBadge, { backgroundColor: colors.primaryTint, marginTop: -10 }]}>
              <Ionicons name="ribbon" size={32} color={colors.primary} />
            </View>
            <View style={[styles.heroBadge, { backgroundColor: colors.purpleTint }]}>
              <Ionicons name="star" size={28} color={colors.purple} />
            </View>
          </View>
          <Text style={styles.heroTitle}>
            {earnedCount}/{totalCount} Badges Unlocked
          </Text>
          <Text style={styles.heroPct}>{pct}%</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>

        {/* Category Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          {filterTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, activeFilter === tab.key && styles.filterTabActive]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text style={[styles.filterTabText, activeFilter === tab.key && styles.filterTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category Sections with Horizontal Scroll */}
        {filteredCategories.map((cat) => {
          const catBadges = allBadges.filter((b) => b.category === cat);
          const catEarned = catBadges.filter((b) => earned.has(b.id)).length;
          return (
            <View key={cat} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Ionicons name={(CATEGORY_ICONS[cat] as any) || 'ribbon'} size={18} color={colors.primary} />
                <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                <View style={styles.categoryCount}>
                  <Text style={styles.categoryCountText}>{catEarned}/{catBadges.length} unlocked</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgeScrollContent}
              >
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
                      {isEarned && (
                        <View style={styles.earnedBadge}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        {/* Motivational Card */}
        <View style={styles.motivationCard}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
          <View style={styles.motivationContent}>
            <Text style={styles.motivationTitle}>Keep Going!</Text>
            <Text style={styles.motivationText}>
              Every badge earned is a step towards building safer habits. You're doing great!
            </Text>
          </View>
        </View>

        {/* Quote Footer */}
        <View style={styles.quoteFooter}>
          <Text style={styles.quoteText}>
            "Strength doesn't come from what you can do. It comes from overcoming the things you once thought you couldn't."
          </Text>
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
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    heroIconsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    heroBadge: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontSize: 18,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    heroPct: {
      fontSize: 14,
      fontFamily: fonts.semiBold,
      color: colors.primary,
      marginBottom: 12,
    },
    progressBar: {
      width: '100%',
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
    filterScroll: {
      marginBottom: 20,
    },
    filterContent: {
      gap: 8,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterTabText: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: colors.white,
    },
    categorySection: {
      marginBottom: 24,
    },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    categoryTitle: {
      fontSize: 16,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
      flex: 1,
    },
    categoryCount: {
      backgroundColor: colors.primaryTint,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    categoryCountText: {
      fontSize: 11,
      fontFamily: fonts.medium,
      color: colors.primary,
    },
    badgeScrollContent: {
      gap: 12,
      paddingRight: 4,
    },
    badgeCard: {
      width: 140,
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
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    badgeName: {
      fontSize: 13,
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
      lineHeight: 15,
    },
    lockOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    earnedBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
    },
    motivationCard: {
      flexDirection: 'row',
      backgroundColor: colors.primaryTint,
      borderRadius: 16,
      padding: 18,
      gap: 14,
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
    },
    motivationContent: {
      flex: 1,
    },
    motivationTitle: {
      fontSize: 15,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    motivationText: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    quoteFooter: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    quoteText: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textMuted,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 20,
    },
  });
