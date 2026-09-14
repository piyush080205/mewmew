import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts, ThemeColors } from '../../constants/theme';

const FOUNDERS = [
  { name: 'Mehak Sharma', role: 'Co-Founder', photo: require('../../assets/founders/mehak-sharma.jpg') },
  { name: 'Piyush Kumar Singh', role: 'Co-Founder', photo: require('../../assets/founders/piyush-kumar-singh.jpg') },
];

export default function AccountScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { user, signOut } = useAuth();

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
    foundersSection: { marginTop: 32, width: '100%', alignItems: 'center' },
    foundersTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.textMuted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
    foundersRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
    founderCard: { alignItems: 'center', width: 120 },
    founderPhoto: { width: 76, height: 76, borderRadius: 38, marginBottom: 8, backgroundColor: colors.surface },
    founderName: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary, textAlign: 'center' },
    founderRole: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  });
