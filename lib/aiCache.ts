import * as FileSystem from 'expo-file-system/legacy';

// ─── Persistent AI Response Cache ─────────────────────────────────────────────
// Uses file system for persistence (survives app restarts).
// LRU eviction at 100 entries. Each entry: { key, value, timestamp }.

const CACHE_DIR = `${FileSystem.cacheDirectory}ai_cache/`;
const CACHE_INDEX = `${CACHE_DIR}index.json`;
const MAX_ENTRIES = 100;

interface CacheEntry {
  key: string;
  value: string;
  timestamp: number;
}

let indexLoaded = false;
let cacheIndex: CacheEntry[] = [];

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function loadIndex(): Promise<void> {
  if (indexLoaded) return;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_INDEX);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(CACHE_INDEX);
      cacheIndex = JSON.parse(raw);
    }
  } catch {
    cacheIndex = [];
  }
  indexLoaded = true;
}

async function saveIndex(): Promise<void> {
  try {
    await ensureCacheDir();
    await FileSystem.writeAsStringAsync(CACHE_INDEX, JSON.stringify(cacheIndex));
  } catch (e) {
    console.warn('[RELICA] Failed to save cache index:', e);
  }
}

function evictIfNeeded(): void {
  while (cacheIndex.length > MAX_ENTRIES) {
    // LRU: remove oldest (lowest timestamp)
    const oldest = cacheIndex.reduce((min, entry, i) =>
      entry.timestamp < cacheIndex[min].timestamp ? i : min, 0);
    const removed = cacheIndex.splice(oldest, 1)[0];
    // Delete the file (fire and forget)
    FileSystem.deleteAsync(`${CACHE_DIR}${removed.key}.json`, { idempotent: true });
  }
}

function hashKey(key: string): string {
  // Simple hash for filenames — avoid special chars
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `cache_${Math.abs(hash).toString(36)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCacheEntry(key: string): Promise<string | null> {
  await loadIndex();
  const entry = cacheIndex.find(e => e.key === key);
  if (!entry) return null;

  // Read the cached value from file
  try {
    const filePath = `${CACHE_DIR}${hashKey(key)}.json`;
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(filePath);
    return raw;
  } catch {
    return null;
  }
}

export async function setCacheEntry(key: string, value: string): Promise<void> {
  await loadIndex();
  await ensureCacheDir();

  // Update or insert
  const existing = cacheIndex.findIndex(e => e.key === key);
  if (existing >= 0) {
    cacheIndex[existing].timestamp = Date.now();
  } else {
    cacheIndex.push({ key, value: '', timestamp: Date.now() });
  }

  // Write value to individual file
  const filePath = `${CACHE_DIR}${hashKey(key)}.json`;
  await FileSystem.writeAsStringAsync(filePath, value);

  // Evict if over cap
  evictIfNeeded();
  await saveIndex();
}

export async function getCacheSize(): Promise<{ entries: number; maxEntries: number }> {
  await loadIndex();
  return { entries: cacheIndex.length, maxEntries: MAX_ENTRIES };
}

export async function getCacheSizeBytes(): Promise<number> {
  await loadIndex();
  let total = 0;
  try {
    for (const entry of cacheIndex) {
      const filePath = `${CACHE_DIR}${hashKey(entry.key)}.json`;
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists && !info.isDirectory) {
        total += (info as any).size || 0;
      }
    }
  } catch { /* silent */ }
  return total;
}

export async function clearCache(): Promise<void> {
  await loadIndex();
  try {
    for (const entry of cacheIndex) {
      await FileSystem.deleteAsync(`${CACHE_DIR}${hashKey(entry.key)}.json`, { idempotent: true });
    }
    await FileSystem.deleteAsync(CACHE_INDEX, { idempotent: true });
  } catch { /* silent */ }
  cacheIndex = [];
  indexLoaded = false;
  console.log('[RELICA] Persistent AI cache cleared.');
}
