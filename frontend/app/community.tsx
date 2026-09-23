import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fonts, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  submitReport,
  getNearbyReports,
  upvoteReport,
  CommunityReport,
} from '../services/retentionApi';

const REPORT_TYPES = [
  { value: 'unsafe_area', label: 'Unsafe Area', icon: 'warning', color: '#D96570', bg: '#FBEAEC' },
  { value: 'poor_lighting', label: 'Poor Lighting', icon: 'flashlight', color: '#D9A544', bg: '#FBF2E2' },
  { value: 'harassment', label: 'Harassment', icon: 'alert-circle', color: '#D96570', bg: '#FBEAEC' },
  { value: 'suspicious_activity', label: 'Suspicious', icon: 'eye', color: '#D97757', bg: '#FBEAE2' },
  { value: 'road_issue', label: 'Road Issue', icon: 'construct', color: '#7C6FD9', bg: '#EEEBFB' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#8A8DA3', bg: '#EAEAF4' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#D9A544' },
  { value: 'medium', label: 'Medium', color: '#D97757' },
  { value: 'high', label: 'High', color: '#D96570' },
  { value: 'critical', label: 'Critical', color: '#B82E3B' },
];

const MAX_DESC = 500;

export default function CommunityScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'report' | 'nearby'>('report');

  const [reportType, setReportType] = useState('unsafe_area');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');

  const loadReports = async () => {
    let lat = 28.6139;
    let lng = 77.209;
    if (Platform.OS !== 'web') {
      try {
        const ExpoLocation = await import('expo-location');
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}
    }
    const data = await getNearbyReports(lat, lng, 10);
    setReports(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    let lat = 28.6139;
    let lng = 77.209;
    if (Platform.OS !== 'web') {
      try {
        const ExpoLocation = await import('expo-location');
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {}
    }
    const result = await submitReport({
      latitude: lat,
      longitude: lng,
      report_type: reportType,
      description: description || undefined,
      severity,
    });
    setSubmitting(false);
    if (result) {
      Alert.alert('Report Submitted', 'Thank you for helping keep the community safe!');
      setDescription('');
      setActiveTab('nearby');
      loadReports();
    } else {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  const handleUpvote = async (reportId: string) => {
    const ok = await upvoteReport(reportId);
    if (ok) {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, upvotes: r.upvotes + 1 } : r)),
      );
    }
  };

  const getTypeInfo = (type: string) =>
    REPORT_TYPES.find((t) => t.value === type) || REPORT_TYPES[5];

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReports(); }} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Community Reports</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.subtitle}>
          Help keep your community safe by reporting unsafe areas and incidents
        </Text>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'report' && styles.tabActive]}
            onPress={() => setActiveTab('report')}
          >
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>New Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'nearby' && styles.tabActive]}
            onPress={() => setActiveTab('nearby')}
          >
            <Text style={[styles.tabText, activeTab === 'nearby' && styles.tabTextActive]}>Nearby</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'report' ? (
          <View style={styles.formCard}>
            {/* Step 1: Type */}
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNumber}>1</Text></View>
              <Text style={styles.stepLabel}>Type of Report</Text>
            </View>
            <View style={styles.typeGrid}>
              {REPORT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    styles.typeCard,
                    reportType === t.value && { borderColor: t.color, borderWidth: 2 },
                  ]}
                  onPress={() => setReportType(t.value)}
                >
                  <View style={[styles.typeIconWrap, { backgroundColor: t.bg }]}>
                    <Ionicons name={t.icon as any} size={22} color={t.color} />
                  </View>
                  <Text style={[styles.typeLabel, reportType === t.value && { color: t.color, fontFamily: fonts.semiBold }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 2: Severity */}
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNumber}>2</Text></View>
              <Text style={styles.stepLabel}>Severity Level</Text>
            </View>
            <View style={styles.severityRow}>
              {SEVERITY_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.severityPill,
                    severity === s.value && { backgroundColor: s.color, borderColor: s.color },
                  ]}
                  onPress={() => setSeverity(s.value)}
                >
                  <Text
                    style={[
                      styles.severityText,
                      severity === s.value && { color: '#FFFFFF' },
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 3: Description */}
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNumber}>3</Text></View>
              <Text style={styles.stepLabel}>Description</Text>
            </View>
            <View style={styles.descWrap}>
              <TextInput
                style={styles.descInput}
                placeholder="What happened or what should people watch out for?"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={4}
                maxLength={MAX_DESC}
                value={description}
                onChangeText={setDescription}
              />
              <Text style={styles.charCount}>{description.length}/{MAX_DESC}</Text>
            </View>

            {/* Photo Upload */}
            <View style={styles.photoSection}>
              <Text style={styles.photoLabel}>Add Photo (optional)</Text>
              <View style={styles.photoButtons}>
                <TouchableOpacity style={styles.photoButton} onPress={() => Alert.alert('Coming Soon', 'Camera feature will be available soon.')}>
                  <Ionicons name="camera" size={20} color={colors.primary} />
                  <Text style={styles.photoButtonText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoButton} onPress={() => Alert.alert('Coming Soon', 'Gallery feature will be available soon.')}>
                  <Ionicons name="images" size={20} color={colors.primary} />
                  <Text style={styles.photoButtonText}>Choose from Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.submitText}>Submit Report</Text>
              )}
            </TouchableOpacity>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Ionicons name="shield-checkmark" size={14} color={colors.textMuted} />
              <Text style={styles.privacyText}>
                Your report is anonymous. Your identity will not be shared.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="megaphone-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No reports nearby</Text>
                <Text style={styles.emptyText}>Be the first to report — switch to New Report tab</Text>
              </View>
            ) : (
              reports.map((report) => {
                const typeInfo = getTypeInfo(report.report_type);
                return (
                  <View key={report.id} style={styles.reportCard}>
                    <View style={styles.reportHeader}>
                      <View style={[styles.reportIcon, { backgroundColor: typeInfo.bg }]}>
                        <Ionicons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
                      </View>
                      <View style={styles.reportInfo}>
                        <Text style={styles.reportType}>{typeInfo.label}</Text>
                        <Text style={styles.reportTime}>{timeAgo(report.created_at)}</Text>
                      </View>
                      <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(report.severity) + '20' }]}>
                        <Text style={[styles.severityBadgeText, { color: getSeverityColor(report.severity) }]}>
                          {report.severity}
                        </Text>
                      </View>
                    </View>
                    {report.description && (
                      <Text style={styles.reportDesc}>{report.description}</Text>
                    )}
                    <View style={styles.reportFooter}>
                      <TouchableOpacity
                        style={styles.upvoteButton}
                        onPress={() => handleUpvote(report.id)}
                      >
                        <Ionicons name="arrow-up" size={16} color={colors.primary} />
                        <Text style={styles.upvoteCount}>{report.upvotes}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'low': return '#D9A544';
    case 'medium': return '#D97757';
    case 'high': return '#D96570';
    case 'critical': return '#B82E3B';
    default: return '#8A8DA3';
  }
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 20, paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    backButton: { padding: 8 },
    title: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
    subtitle: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.surface,
    },
    tabText: {
      fontSize: 14,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textPrimary,
      fontFamily: fonts.semiBold,
    },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      borderColor: colors.border,
      borderWidth: 1,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    stepBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumber: {
      color: colors.white,
      fontSize: 13,
      fontFamily: fonts.bold,
    },
    stepLabel: {
      fontSize: 15,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    typeCard: {
      width: '30%' as any,
      flexGrow: 1,
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    typeLabel: {
      fontSize: 12,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    severityRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 24,
    },
    severityPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    severityText: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    descWrap: {
      marginBottom: 20,
    },
    descInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 14,
      borderColor: colors.border,
      borderWidth: 1,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    charCount: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: 6,
    },
    photoSection: {
      marginBottom: 20,
    },
    photoLabel: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    photoButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    photoButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      backgroundColor: colors.primaryTint,
    },
    photoButtonText: {
      fontSize: 12,
      fontFamily: fonts.medium,
      color: colors.primary,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    submitText: {
      color: colors.white,
      fontSize: 16,
      fontFamily: fonts.semiBold,
    },
    privacyNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    privacyText: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textMuted,
    },
    emptyState: {
      alignItems: 'center',
      paddingTop: 60,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: fonts.semiBold,
      color: colors.textSecondary,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textMuted,
    },
    reportCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      borderColor: colors.border,
      borderWidth: 1,
    },
    reportHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    reportIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportInfo: { flex: 1 },
    reportType: {
      fontSize: 14,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
    },
    reportTime: {
      fontSize: 11,
      fontFamily: fonts.regular,
      color: colors.textMuted,
    },
    severityBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    severityBadgeText: {
      fontSize: 11,
      fontFamily: fonts.semiBold,
      textTransform: 'capitalize',
    },
    reportDesc: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      marginTop: 10,
    },
    reportFooter: {
      flexDirection: 'row',
      marginTop: 10,
    },
    upvoteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.primaryTint,
    },
    upvoteCount: {
      fontSize: 13,
      fontFamily: fonts.semiBold,
      color: colors.primary,
    },
  });
