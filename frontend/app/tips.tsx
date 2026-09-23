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
import { getTodaysTip, getTips, SafetyTip } from '../services/retentionApi';

const CATEGORIES = [
  { value: '', label: 'All', icon: 'grid' },
  { value: 'travel', label: 'Travel', icon: 'car' },
  { value: 'digital', label: 'Digital', icon: 'phone-portrait' },
  { value: 'self_defense', label: 'Defense', icon: 'fitness' },
  { value: 'awareness', label: 'Awareness', icon: 'eye' },
  { value: 'emergency', label: 'Emergency', icon: 'medkit' },
  { value: 'home', label: 'Home', icon: 'home' },
];

export default function TipsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [todayTip, setTodayTip] = useState<SafetyTip | null>(null);
  const [tips, setTips] = useState<SafetyTip[]>([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadTips();
  }, [category]);

  const loadData = async () => {
    const [tip, all] = await Promise.all([getTodaysTip(), getTips()]);
    if (tip) setTodayTip(tip);
    setTips(all);
    setLoading(false);
  };

  const loadTips = async () => {
    const data = await getTips(category || undefined);
    setTips(data);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'travel': return colors.primary;
      case 'digital': return colors.purple;
      case 'self_defense': return colors.danger;
      case 'awareness': return colors.amber;
      case 'emergency': return colors.orange;
      case 'home': return colors.success;
      default: return colors.textSecondary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Safety Tips</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tip of the Day */}
        {todayTip && (
          <View style={styles.todayCard}>
            <View style={styles.todayBadge}>
              <Ionicons name="sunny" size={14} color={colors.amber} />
              <Text style={styles.todayBadgeText}>Tip of the Day</Text>
            </View>
            <Text style={styles.todayTitle}>{todayTip.title}</Text>
            <Text style={styles.todayContent}>{todayTip.content}</Text>
          </View>
        )}

        {/* Category Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              style={[
                styles.categoryChip,
                category === cat.value && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(cat.value)}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={category === cat.value ? colors.white : colors.textSecondary}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  category === cat.value && styles.categoryChipTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tips List */}
        {tips.map((tip) => {
          const catColor = getCategoryColor(tip.category);
          return (
            <View key={tip.id} style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: catColor + '18' }]}>
                <Ionicons name={(tip.icon as any) || 'bulb'} size={22} color={catColor} />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipText}>{tip.content}</Text>
                <View style={styles.tipCategory}>
                  <Text style={[styles.tipCategoryText, { color: catColor }]}>
                    {tip.category.replace('_', ' ')}
                  </Text>
                </View>
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
    title: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
    todayCard: {
      backgroundColor: colors.amberTint,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderColor: colors.amberBorder,
      borderWidth: 1,
    },
    todayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    todayBadgeText: {
      fontSize: 12,
      fontFamily: fonts.semiBold,
      color: colors.amber,
    },
    todayTitle: {
      fontSize: 17,
      fontFamily: fonts.bold,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    todayContent: {
      fontSize: 14,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    categoryScroll: { marginBottom: 16 },
    categoryContent: { gap: 8 },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryChipText: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    categoryChipTextActive: {
      color: colors.white,
    },
    tipCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      gap: 14,
      borderColor: colors.border,
      borderWidth: 1,
    },
    tipIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    tipContent: { flex: 1 },
    tipTitle: {
      fontSize: 15,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    tipText: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    tipCategory: {
      marginTop: 8,
    },
    tipCategoryText: {
      fontSize: 11,
      fontFamily: fonts.medium,
      textTransform: 'capitalize',
    },
  });
