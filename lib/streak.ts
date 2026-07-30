/**
 * Streak System — tracks daily exploration streaks.
 * Uses an in-memory Map as storage — AsyncStorage native module is
 * unavailable on sideloaded / dev-client builds without native linking.
 */

// ── In-memory store (replaces AsyncStorage) ─────────────────────────
const memStore = new Map<string, string>();

const STREAK_KEY = '@monument_streak';

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastScanDate: string | null; // ISO date string (YYYY-MM-DD)
  totalDays: number;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export async function getStreak(): Promise<StreakData> {
  try {
    const raw = memStore.get(STREAK_KEY);
    if (!raw) return { currentStreak: 0, longestStreak: 0, lastScanDate: null, totalDays: 0 };
    return JSON.parse(raw) as StreakData;
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastScanDate: null, totalDays: 0 };
  }
}

/**
 * Call this every time a user successfully scans a monument.
 * Returns the new streak data and whether it was a new day (streak incremented).
 */
export async function recordScan(): Promise<{ streak: StreakData; isNewDay: boolean; xpMultiplier: number }> {
  const streak = await getStreak();
  const today = todayISO();
  const yesterday = yesterdayISO();

  let isNewDay = false;

  if (streak.lastScanDate === today) {
    // Already scanned today — no streak change
    return { streak, isNewDay: false, xpMultiplier: getXPMultiplier(streak.currentStreak) };
  }

  isNewDay = true;

  if (streak.lastScanDate === yesterday) {
    // Consecutive day — extend streak
    streak.currentStreak += 1;
  } else {
    // Streak broken — reset
    streak.currentStreak = 1;
  }

  streak.lastScanDate = today;
  streak.totalDays += 1;
  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);

  memStore.set(STREAK_KEY, JSON.stringify(streak));
  return { streak, isNewDay, xpMultiplier: getXPMultiplier(streak.currentStreak) };
}

/**
 * XP multiplier scales with streak length.
 * 1 day = 1×, 3 days = 1.25×, 7 days = 1.5×, 14 days = 2×, 30+ days = 3×
 */
export function getXPMultiplier(streakDays: number): number {
  if (streakDays >= 30) return 3.0;
  if (streakDays >= 14) return 2.0;
  if (streakDays >= 7)  return 1.5;
  if (streakDays >= 3)  return 1.25;
  return 1.0;
}

export function getStreakEmoji(streakDays: number): string {
  if (streakDays >= 30) return '🔥🔥🔥';
  if (streakDays >= 14) return '🔥🔥';
  if (streakDays >= 7)  return '🔥';
  if (streakDays >= 3)  return '⚡';
  if (streakDays >= 1)  return '✨';
  return '💤';
}

export function getStreakTitle(streakDays: number): string {
  if (streakDays >= 30) return 'Eternal Scholar';
  if (streakDays >= 14) return 'Monument Obsessed';
  if (streakDays >= 7)  return 'Weekly Explorer';
  if (streakDays >= 3)  return 'On A Roll';
  if (streakDays >= 1)  return 'Just Started';
  return 'Dormant';
}

export async function resetStreak(): Promise<void> {
  memStore.delete(STREAK_KEY);
}
