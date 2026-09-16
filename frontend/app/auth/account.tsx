import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts, ThemeColors } from '../../constants/theme';
import { API_URL } from '../../services/api';

const FOUNDERS = [
  { name: 'Mehak Sharma', role: 'Co-Founder', photo: require('../../assets/founders/mehak-sharma.jpg') },
  { name: 'Piyush Kumar Singh', role: 'Co-Founder', photo: require('../../assets/founders/piyush-kumar-singh.jpg') },
];

// null = share until manually stopped
const SOS_SHARE_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: 'Until I stop it', minutes: null },
];

export default function AccountScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { user, signOut } = useAuth();

  const [sosShareMinutes, setSosShareMinutes] = React.useState<number | null>(null);
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const [savingMinutes, setSavingMinutes] = React.useState<number | null | undefined>(undefined);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings`);
        if (res.ok) {
          const data = await res.json();
          setSosShareMinutes(data.sos_share_minutes ?? null);
        }
      } catch {
        // Keep default (until manually stopped) if settings can't be reached.
      } finally {
        setSettingsLoading(false);
      }
    })();
  }, []);

  const handleSelectSosShareMinutes = async (minutes: number | null) => {
    const previous = sosShareMinutes;
    setSosShareMinutes(minutes);
    setSavingMinutes(minutes);
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sos_share_minutes: minutes }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      setSosShareMinutes(previous);
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      setSavingMinutes(undefined);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Account</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.primary} />
        </View>
        <Text style={styles.email}>{user?.email}</Text>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>Emergency Live Location</Text>
          <Text style={styles.settingsDescription}>
            When SOS triggers, your emergency contacts get a live-tracking link by SMS.
            Choose how long it stays active.
          </Text>
          {settingsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={styles.durationRow}>
              {SOS_SHARE_OPTIONS.map((opt) => {
                const selected = sosShareMinutes === opt.minutes;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.durationChip, selected && styles.durationChipSelected]}
                    onPress={() => handleSelectSosShareMinutes(opt.minutes)}
                    disabled={savingMinutes !== undefined}
                  >
                    {savingMinutes === opt.minutes ? (
                      <ActivityIndicator size="small" color={selected ? colors.white : colors.primary} />
                    ) : (
                      <Text style={[styles.durationChipText, selected && styles.durationChipTextSelected]}>
                        {opt.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.foundersSection}>
          <Text style={styles.foundersTitle}>Founders</Text>
          <View style={styles.foundersRow}>
            {FOUNDERS.map((f) => (
              <View key={f.name} style={styles.founderCard}>
                <Image source={f.photo} style={styles.founderPhoto} />
                <Text style={styles.founderName}>{f.name}</Text>
                <Text style={styles.founderRole}>{f.role}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
    backButton: { padding: 4 },
    title: { fontFamily: fonts.semiBold, fontSize: 20, color: colors.textPrimary },
    body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, gap: 16 },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    email: { fontFamily: fonts.medium, fontSize: 16, color: colors.textPrimary },
    signOutButton: {
      backgroundColor: colors.dangerTint,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 32,
      marginTop: 8,
    },
    signOutButtonText: { fontFamily: fonts.semiBold, fontSize: 16, color: colors.danger },
    settingsSection: {
      marginTop: 32, width: '100%', backgroundColor: colors.surface,
      borderRadius: 16, padding: 16,
    },
    settingsTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.textPrimary },
    settingsDescription: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
    durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    durationChip: {
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
      backgroundColor: colors.primaryTint, minWidth: 64, alignItems: 'center',
    },
    durationChipSelected: { backgroundColor: colors.primary },
    durationChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
    durationChipTextSelected: { color: colors.white },
    foundersSection: { marginTop: 32, width: '100%', alignItems: 'center' },
    foundersTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.textMuted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    foundersRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
    founderCard: { alignItems: 'center', width: 120 },
    founderPhoto: { width: 76, height: 76, borderRadius: 38, marginBottom: 8, backgroundColor: colors.surface },
    founderName: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary, textAlign: 'center' },
    founderRole: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  });
