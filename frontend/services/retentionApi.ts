import { API_URL } from './api';

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  last_checkin_date: string | null;
}

export interface UserBadge {
  badge_id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  requirement_type: string;
  requirement_value: number;
}

export interface CheckinResponse {
  already_checked_in: boolean;
  streak: StreakInfo;
  new_badges: UserBadge[];
}

export interface DashboardStats {
  total_trips: number;
  completed_trips: number;
  total_distance_km: number;
  total_duration_minutes: number;
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  badges_earned: number;
  reports_submitted: number;
  safety_score: number;
}

export interface CommunityReport {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  report_type: string;
  description: string | null;
  severity: string;
  upvotes: number;
  created_at: string | null;
}

export interface SafetyTip {
  id: string;
  title: string;
  content: string;
  category: string;
  icon: string;
}

// ─── Streaks & Check-in ─────────────────────────────────────────────

export async function dailyCheckin(userId: string = 'default_user'): Promise<CheckinResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/checkin?user_id=${encodeURIComponent(userId)}`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to check in:', err);
    return null;
  }
}

export async function getStreak(userId: string = 'default_user'): Promise<StreakInfo | null> {
  try {
    const res = await fetch(`${API_URL}/api/checkin/streak?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get streak:', err);
    return null;
  }
}

// ─── Badges ─────────────────────────────────────────────────────────

export async function getAllBadges(): Promise<Badge[]> {
  try {
    const res = await fetch(`${API_URL}/api/badges`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get badges:', err);
    return [];
  }
}

export async function getUserBadges(userId: string = 'default_user'): Promise<UserBadge[]> {
  try {
    const res = await fetch(`${API_URL}/api/badges/user?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get user badges:', err);
    return [];
  }
}

// ─── Dashboard ──────────────────────────────────────────────────────

export async function getDashboardStats(userId: string = 'default_user'): Promise<DashboardStats | null> {
  try {
    const res = await fetch(`${API_URL}/api/dashboard/stats?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get dashboard stats:', err);
    return null;
  }
}

// ─── Community Reports ──────────────────────────────────────────────

export async function submitReport(report: {
  latitude: number;
  longitude: number;
  report_type: string;
  description?: string;
  severity?: string;
  user_id?: string;
}): Promise<CommunityReport | null> {
  try {
    const res = await fetch(`${API_URL}/api/community/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'default_user', severity: 'medium', ...report }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to submit report:', err);
    return null;
  }
}

export async function getNearbyReports(
  lat: number,
  lng: number,
  radiusKm: number = 5,
): Promise<CommunityReport[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/community/reports?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`,
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get reports:', err);
    return [];
  }
}

export async function upvoteReport(reportId: string, userId: string = 'default_user'): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_URL}/api/community/reports/${reportId}/upvote?user_id=${encodeURIComponent(userId)}`,
      { method: 'POST' },
    );
    return res.ok;
  } catch (err) {
    console.error('[API] Failed to upvote:', err);
    return false;
  }
}

// ─── Safety Tips ────────────────────────────────────────────────────

export async function getTodaysTip(): Promise<SafetyTip | null> {
  try {
    const res = await fetch(`${API_URL}/api/tips/today`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get tip:', err);
    return null;
  }
}

export async function getTips(category?: string): Promise<SafetyTip[]> {
  try {
    let url = `${API_URL}/api/tips`;
    if (category) url += `?category=${encodeURIComponent(category)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[API] Failed to get tips:', err);
    return [];
  }
}
