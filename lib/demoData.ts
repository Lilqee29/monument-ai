/**
 * Demo Data — pre-seeded sessions, user profile, and quest data
 * used when the app is in demo mode (no Clerk/Supabase backend).
 */
import { WORLD_LANDMARKS } from '@/constants/landmarks';
import { Session } from '@/types';

// ── Demo user profile ────────────────────────────────────────────────────────
export const DEMO_USER = {
  id: 'demo-user-001',
  firstName: 'Explorer',
  lastName: 'Demo',
  displayName: 'Demo Explorer',
  imageUrl: '',
  email: 'demo@relica.app',
  xp: 4350,
  level: 6,
  nations: 7,
  sites: 10,
  streak: 5,
  longestStreak: 12,
};

// ── Demo sessions — one per WORLD_LANDMARK ───────────────────────────────────
export const DEMO_SESSIONS: Session[] = WORLD_LANDMARKS.map((lm, i) => ({
  id: `demo-session-${String(i).padStart(3, '0')}`,
  user_id: 'demo-user-001',
  monument_name: lm.name,
  location_city: lm.city,
  location_country: lm.country,
  coordinates: { lat: lm.coordinates.lat, lng: lm.coordinates.lng },
  photo_url: lm.image,
  history_text: `${lm.name} is a world-renowned landmark located in ${lm.city}, ${lm.country}. It attracts millions of visitors each year and stands as a testament to human creativity and cultural heritage.`,
  details: {
    built: 'Historic',
    style: 'Iconic',
    unesco: true,
    fun_fact: `${lm.name} is one of the most photographed landmarks in the world.`,
    xp_reward: 150,
  },
  qa_thread: [],
  created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(), // spaced 3 days apart
}));

// ── Demo daily quest ─────────────────────────────────────────────────────────
export const DEMO_QUEST = {
  id: 'demo-quest-001',
  title: 'Heritage Explorer',
  description: 'Discover 3 historic landmarks in your area',
  xp_reward: 500,
  tasks: [
    {
      id: 'task-1',
      title: 'Find a historic monument',
      description: 'Scan any landmark recognized by the AI',
      completed: false,
      xp_reward: 150,
    },
    {
      id: 'task-2',
      title: 'Learn its history',
      description: 'Open the history tab on a discovery',
      completed: true,
      xp_reward: 100,
    },
    {
      id: 'task-3',
      title: 'Ask the AI about it',
      description: 'Use the AI companion to ask a question',
      completed: false,
      xp_reward: 250,
    },
  ],
  timeLeft: 7200, // 2 hours
};

// ── Demo map markers ─────────────────────────────────────────────────────────
export const DEMO_MAP_MARKERS = WORLD_LANDMARKS.map((lm) => ({
  id: lm.id,
  coordinate: { latitude: lm.coordinates.lat, longitude: lm.coordinates.lng },
  title: lm.name,
  subtitle: `${lm.city}, ${lm.country}`,
  image: lm.image,
  visited: true,
}));

// ── Helper: check if running in demo mode ────────────────────────────────────
const DEMO_KEY = '@relica_demo_mode';

export async function getDemoMode(): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const val = await AsyncStorage.getItem(DEMO_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setDemoMode(enabled: boolean): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(DEMO_KEY, enabled ? 'true' : 'false');
  } catch {
    // silent fail
  }
}
