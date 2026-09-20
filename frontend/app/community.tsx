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
  { value: 'unsafe_area', label: 'Unsafe Area', icon: 'warning', color: '#D96570' },
  { value: 'poor_lighting', label: 'Poor Lighting', icon: 'flashlight', color: '#D9A544' },
  { value: 'harassment', label: 'Harassment', icon: 'alert-circle', color: '#D96570' },
  { value: 'suspicious_activity', label: 'Suspicious Activity', icon: 'eye', color: '#D97757' },
  { value: 'road_issue', label: 'Road Issue', icon: 'construct', color: '#7C6FD9' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#8A8DA3' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#D9A544' },
  { value: 'medium', label: 'Medium', color: '#D97757' },
  { value: 'high', label: 'High', color: '#D96570' },
  { value: 'critical', label: 'Critical', color: '#B82E3B' },
];

export default function CommunityScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
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
      setShowForm(false);
      setDescription('');
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Community Reports</Text>
          <TouchableOpacity onPress={() => setShowForm(!showForm)} style={styles.addButton}>
            <Ionicons name={showForm ? 'close' : 'add'} size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Help keep your community safe by reporting unsafe areas and incidents
        </Text>

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Report</Text>

            <Text style={styles.formLabel}>Type</Text>
            <View style={styles.typeGrid}>
              {REPORT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    styles.typeChip,
                    reportType === t.value && { backgroundColor: t.color + '20', borderColor: t.color },
                  ]}
                  onPress={() => setReportType(t.value)}
                >
                  <Ionicons name={t.icon as any} size={16} color={reportType === t.value ? t.color : colors.textSecondary} />
                  <Text
                    style={[styles.typeChipText, reportType === t.value && { color: t.color }]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Severity</Text>
            <View style={styles.severityRow}>
              {SEVERITY_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.severityChip,
                    severity === s.value && { backgroundColor: s.color + '20', borderColor: s.color },
                  ]}
                  onPress={() => setSeverity(s.value)}
                >
                  <Text
                    style={[styles.severityText, severity === s.value && { color: s.color }]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Description (optional)</Text>
            <TextInput
              style={styles.descInput}
              placeholder="What happened or what should people watch out for?"
              placeholderTextColor={colors.textPlaceholder}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />

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
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="megaphone-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No reports nearby</Text>
            <Text style={styles.emptyText}>Be the first to report — tap + above</Text>
          </View>
        ) : (
          reports.map((report) => {
            const typeInfo = getTypeInfo(report.report_type);
            return (
              <View key={report.id} style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <View style={[styles.reportIcon, { backgroundColor: typeInfo.color + '18' }]}>
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
    addButton: { padding: 8 },
    subtitle: {
      fontSize: 13,
      fontFamily: fonts.regular,
      color: colors.textSecondary,
      marginBottom: 20,
    },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderColor: colors.border,
      borderWidth: 1,
    },
    formTitle: {
      fontSize: 16,
      fontFamily: fonts.semiBold,
      color: colors.textPrimary,
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 13,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
    },
    typeChipText: {
      fontSize: 12,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    severityRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    severityChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
    },
    severityText: {
      fontSize: 12,
      fontFamily: fonts.medium,
      color: colors.textSecondary,
    },
    descInput: {
      backgroundColor: colors.backgroundAlt,
      borderRadius: 12,
      padding: 14,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 14,
      marginBottom: 16,
      borderColor: colors.border,
      borderWidth: 1,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
    },
    submitText: {
      color: colors.white,
      fontSize: 15,
      fontFamily: fonts.semiBold,
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
      borderRadius: 20,
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
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    severityBadgeText: {
      fontSize: 11,
      fontFamily: fonts.medium,
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
