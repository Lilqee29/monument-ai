/**
 * Notification Templates — all in-app and scheduled push notifications.
 * Uses expo-notifications with rich content.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { breadcrumb } from '@/lib/crashDebug';

breadcrumb('N00', 'notifications.ts loaded');

// ─── Setup ────────────────────────────────────────────────────────────────────

export async function setupNotifications(): Promise<boolean> {
  breadcrumb('N10', 'setupNotifications — START');
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    breadcrumb('N11', 'setNotificationHandler done');

    const { status: existing } = await Notifications.getPermissionsAsync();
    breadcrumb('N12', `existing permission: ${existing}`);
    if (existing === 'granted') return true;

    breadcrumb('N13', 'requesting notification permissions');
    const { status } = await Notifications.requestPermissionsAsync();
    breadcrumb('N14', `new permission status: ${status}`);
    return status === 'granted';
  } catch (e: any) {
    breadcrumb('N15', `setupNotifications ERROR: ${e?.message ?? e}`);
    console.error('[Notifications] setup failed:', e);
    return false;
  }
}

// ─── Notification Types ───────────────────────────────────────────────────────

export type NotifType =
  | 'streak_reminder'
  | 'streak_milestone'
  | 'streak_broken'
  | 'nearby_landmark'
  | 'quest_reminder'
  | 'new_card_unlocked'
  | 'xp_milestone'
  | 'daily_quiz';

// ─── Templates ────────────────────────────────────────────────────────────────

interface NotifContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function getTemplate(type: NotifType, params: Record<string, string | number> = {}): NotifContent {
  const { streak, xp, monument, city, multiplier, cardName, country } = params as Record<string, string | number>;

  switch (type) {
    // ── Streak ──
    case 'streak_reminder':
      return {
        title: `🔥 Don't break your ${streak}-day streak!`,
        body: `You haven't scanned a monument today yet. Keep the fire alive — your ${multiplier}× XP multiplier is waiting.`,
        data: { type, action: 'open_camera' },
      };

    case 'streak_milestone':
      const sNum = Number(streak);
      const milestoneEmoji = sNum >= 30 ? '🏆' : sNum >= 14 ? '🔥🔥' : '⚡';
      return {
        title: `${milestoneEmoji} ${streak}-Day Streak! Incredible!`,
        body: `You've explored for ${streak} consecutive days. Your XP multiplier is now ${multiplier}×! The world is your museum.`,
        data: { type, action: 'open_profile' },
      };

    case 'streak_broken':
      return {
        title: '💔 Your streak has ended...',
        body: `Your ${streak}-day streak is over, but legends write new ones. Scan a monument today to start fresh! 🏛️`,
        data: { type, action: 'open_camera' },
      };

    // ── Landmarks ──
    case 'nearby_landmark':
      return {
        title: `🏛️ Monument Detected: ${monument}`,
        body: `You're just steps from ${monument} in ${city}. Point your camera to unlock its history & earn XP! 📸`,
        data: { type, action: 'open_camera', monument, city },
      };

    // ── Quests ──
    case 'quest_reminder':
      return {
        title: '🗺️ Your Quest Awaits, Explorer!',
        body: `You have an active quest in ${city}. Head out before it expires and claim your ${xp} XP reward!`,
        data: { type, action: 'open_quest' },
      };

    // ── Collection ──
    case 'new_card_unlocked':
      return {
        title: `✨ New Collection Card Unlocked!`,
        body: `You just added "${cardName}" to your collection. View your rare ${country} discovery card! 🎴`,
        data: { type, action: 'open_collection', cardName, country },
      };

    // ── XP ──
    case 'xp_milestone':
      return {
        title: `🎖️ ${xp} XP Reached — New Title Unlocked!`,
        body: `You've crossed ${xp} total XP. Check your profile to see your new explorer rank!`,
        data: { type, action: 'open_profile', xp },
      };

    // ── Quiz ──
    case 'daily_quiz':
      return {
        title: '🧠 Daily Monument Quiz Ready!',
        body: `3 new questions are waiting. Answer all correctly for a +150 XP bonus. Opens in 2 minutes!`,
        data: { type, action: 'open_quiz' },
      };

    default:
      return { title: 'RELICA', body: 'New notification.', data: { type } };
  }
}

// ─── Fire Immediately ─────────────────────────────────────────────────────────

export async function sendNotification(
  type: NotifType,
  params: Record<string, string | number> = {}
): Promise<string | null> {
  try {
    const { title, body, data } = getTemplate(type, params);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: data ?? {} },
      trigger: null, // Immediate
    });
    return id;
  } catch (e) {
    console.warn('[Notifications] Failed to send:', type, e);
    return null;
  }
}

// ─── Scheduled Notifications ─────────────────────────────────────────────────

/** Schedule a streak reminder for 8 PM if user hasn't scanned today. */
export async function scheduleStreakReminder(currentStreak: number, multiplier: number): Promise<void> {
  // Cancel any existing streak reminders first
  await cancelNotificationsByTag('streak_reminder');

  const now = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0); // 8 PM today

  if (target <= now) {
    // Already past 8 PM — schedule for tomorrow
    target.setDate(target.getDate() + 1);
  }

  const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);

  await Notifications.scheduleNotificationAsync({
    content: {
      ...getTemplate('streak_reminder', { streak: currentStreak, multiplier }),
      data: { tag: 'streak_reminder', ...getTemplate('streak_reminder', {}).data },
    },
    trigger: { seconds: secondsUntil } as any,
  });
}

/** Schedule the daily quiz notification for 9 AM. */
export async function scheduleDailyQuiz(): Promise<void> {
  await cancelNotificationsByTag('daily_quiz');

  const tpl = getTemplate('daily_quiz');
  await Notifications.scheduleNotificationAsync({
    content: {
      ...tpl,
      data: { tag: 'daily_quiz', ...tpl.data },
    },
    trigger: {
      hour: 9,
      minute: 0,
      repeats: true,
    } as any,
  });
}

/** Cancel all pending notifications that have a specific tag in their data. */
export async function cancelNotificationsByTag(tag: string): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if ((n.content.data as any)?.tag === tag) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── XP Milestone Checker ─────────────────────────────────────────────────────

const XP_MILESTONES = [500, 1000, 2500, 5000, 10000, 25000, 50000];

export function checkXPMilestone(prevXP: number, newXP: number): number | null {
  for (const milestone of XP_MILESTONES) {
    if (prevXP < milestone && newXP >= milestone) return milestone;
  }
  return null;
}
