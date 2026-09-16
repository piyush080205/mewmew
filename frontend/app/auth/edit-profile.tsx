import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fonts, ThemeColors } from '../../constants/theme';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { user, updateProfile, updatePassword, uploadAvatar } = useAuth();

  const [fullName, setFullName] = React.useState((user?.user_metadata?.full_name as string) || '');
  const [phone, setPhone] = React.useState((user?.user_metadata?.phone as string) || '');
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(
    (user?.user_metadata?.avatar_url as string) || null
  );
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [changingPassword, setChangingPassword] = React.useState(false);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    const { url, error } = await uploadAvatar(result.assets[0].uri);
    if (error || !url) {
      Alert.alert('Upload Failed', error || 'Could not upload photo. Please try again.');
      setUploadingAvatar(false);
      return;
    }

    const { error: saveError } = await updateProfile({ avatar_url: url });
    setUploadingAvatar(false);
    if (saveError) {
      Alert.alert('Could not save', saveError);
      return;
    }
    setAvatarUrl(url);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await updateProfile({ full_name: fullName.trim(), phone: phone.trim() });
    setSavingProfile(false);
    if (error) {
      Alert.alert('Could not save', error);
      return;
    }
    Alert.alert('Saved', 'Your profile has been updated.');
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing info', 'Please fill in all three password fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'New password and confirmation must match.');
      return;
    }
    if (!user?.email) {
      Alert.alert('Error', 'No account email found.');
      return;
    }

    setChangingPassword(true);
    // Supabase's updateUser doesn't require re-entering the current password
    // for an already-signed-in session, but we verify it ourselves first so
    // a shared/unlocked device can't have its password silently changed.
    const { supabase } = await import('../../lib/supabase');
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      setChangingPassword(false);
      Alert.alert('Incorrect password', 'Your current password is incorrect.');
      return;
    }

    const { error } = await updatePassword(newPassword);
    setChangingPassword(false);
    if (error) {
      Alert.alert('Could not change password', error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password Changed', 'Your password has been updated.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} disabled={uploadingAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={32} color={colors.primary} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="camera" size={14} color={colors.white} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to change photo</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={colors.textPlaceholder}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={colors.textPlaceholder}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Text style={styles.emailText}>{user?.email} (email can't be changed here)</Text>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Save Profile</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Current password"
            placeholderTextColor={colors.textPlaceholder}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.textPlaceholder}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textPlaceholder}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>
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
    body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 8 },
    avatarWrap: { width: 88, height: 88, marginTop: 8 },
    avatarImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface },
    avatarPlaceholder: {
      width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primaryTint,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarEditBadge: {
      position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: colors.background,
    },
    avatarHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    section: {
      marginTop: 20, width: '100%', backgroundColor: colors.surface,
      borderRadius: 16, padding: 16, gap: 12,
    },
    sectionTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.textPrimary },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontFamily: fonts.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    emailText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryButtonText: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.white },
    secondaryButton: {
      backgroundColor: colors.primaryTint,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    secondaryButtonText: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.primary },
  });
