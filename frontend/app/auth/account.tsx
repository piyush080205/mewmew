import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts, ThemeColors } from '../../constants/theme';

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

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={colors.primary} />
        </View>
        <Text style={styles.email}>{user?.email}</Text>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
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
  });
