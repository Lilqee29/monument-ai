/**
 * Crash Debug Breadcrumbs — writes to SecureStore so even if the app crashes,
 * on the NEXT launch we can read the last breadcrumbs to see where it died.
 */
import * as SecureStore from 'expo-secure-store';

const BREADCRUMB_KEY = '@crash_breadcrumbs';
const MAX_ENTRIES = 80;

let breadcrumbCount = 0;
let storageReady = false;

/** Call this once the app is mounted — enables storage for breadcrumbs */
export function enableBreadcrumbStorage() {
  storageReady = true;
}

export function breadcrumb(phase: string, detail?: string) {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `[${timestamp}] #${breadcrumbCount++} ${phase}${detail ? ' — ' + detail : ''}`;
  console.log(`[CRASH-DEBUG] ${line}`);

  // Append to SecureStore (non-blocking, fire-and-forget)
  if (!storageReady) return;
  const appendAsync = async () => {
    try {
      const existing = await SecureStore.getItemAsync(BREADCRUMB_KEY).catch(() => '');
      const lines = (existing || '').split('\n').filter(Boolean);
      lines.push(line);
      const trimmed = lines.slice(-MAX_ENTRIES);
      await SecureStore.setItemAsync(BREADCRUMB_KEY, trimmed.join('\n'));
    } catch {
      // ignore — don't crash the app for debug logging
    }
  };
  appendAsync();
}

/** Call this on app launch to read and return the last breadcrumbs from previous session */
export async function readLastBreadcrumbs(): Promise<string> {
  try {
    const content = await SecureStore.getItemAsync(BREADCRUMB_KEY);
    return content || '(no breadcrumbs)';
  } catch {
    return '(no breadcrumb file)';
  }
}

/** Call this to clear breadcrumbs after reading */
export async function clearBreadcrumbs(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BREADCRUMB_KEY);
  } catch {
    // ignore
  }
}

/** Wrap an async function with breadcrumb logging + error capture */
export async function guardedAsync<T>(
  phase: string,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  breadcrumb(`${phase} — START`);
  try {
    const result = await fn();
    breadcrumb(`${phase} — OK`);
    return result;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const stack = e?.stack?.slice(0, 500) ?? '(no stack)';
    breadcrumb(`${phase} — ERROR: ${msg}`);
    breadcrumb(`${phase} — STACK: ${stack}`);
    console.error(`[CRASH-DEBUG] ${phase} FAILED:`, e);
    return fallback;
  }
}

/** Install global unhandled rejection + uncaught exception handlers */
export function installGlobalErrorHandlers() {
  const original = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    const msg = error?.message ?? String(error);
    const stack = error?.stack?.slice(0, 1000) ?? '(no stack)';
    breadcrumb(`GLOBAL-ERROR fatal=${isFatal}: ${msg}`);
    breadcrumb(`GLOBAL-ERROR STACK: ${stack}`);
    console.error(`[CRASH-DEBUG] GLOBAL ERROR (fatal=${isFatal}):`, error);

    // Call original handler (shows RedBox in dev)
    if (original) {
      original(error, isFatal);
    }
  });

  breadcrumb('00b', 'Global error handlers installed');
}
