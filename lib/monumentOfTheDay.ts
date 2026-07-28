/**
 * Monument of the Day — deterministic daily selection from verified landmarks.
 * Uses a simple hash of the current date to pick one monument per day.
 * No randomness — every user sees the same monument on the same day.
 */
import { WORLD_LANDMARKS } from '@/constants/landmarks';

interface DailyMonument {
  id: string;
  name: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  image: string;
  dayOfYear: number;
  date: string; // YYYY-MM-DD
}

/** Simple deterministic hash — same input always produces same output. */
function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/** Get today's date as YYYY-MM-DD in local timezone. */
function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get the day-of-year (1-366). */
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

/**
 * Returns today's monument of the day.
 * Deterministic — same monument for all users on the same date.
 */
export function getMonumentOfTheDay(): DailyMonument {
  const date = todayISO();
  const hash = hashDate(date);
  const index = hash % WORLD_LANDMARKS.length;
  const lm = WORLD_LANDMARKS[index];

  return {
    id: lm.id,
    name: lm.name,
    city: lm.city,
    country: lm.country,
    coordinates: lm.coordinates,
    image: lm.image,
    dayOfYear: dayOfYear(new Date()),
    date,
  };
}

/**
 * Get a shareable message for today's monument.
 */
export function getDailyMonumentShareText(): string {
  const m = getMonumentOfTheDay();
  return [
    `🏛️ RELICA — Monument of the Day`,
    ``,
    `${m.name}`,
    `${m.city}, ${m.country}`,
    ``,
    `Can you find and scan it today?`,
    `#RelicaApp #MonumentOfTheDay`,
  ].join('\n');
}

/**
 * Get tomorrow's monument (for preview / streak motivation).
 */
export function getTomorrowMonument(): DailyMonument {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const hash = hashDate(dateStr);
  const index = hash % WORLD_LANDMARKS.length;
  const lm = WORLD_LANDMARKS[index];

  return {
    id: lm.id,
    name: lm.name,
    city: lm.city,
    country: lm.country,
    coordinates: lm.coordinates,
    image: lm.image,
    dayOfYear: dayOfYear(tomorrow),
    date: dateStr,
  };
}
