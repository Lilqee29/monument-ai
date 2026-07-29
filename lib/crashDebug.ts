/**
 * Crash Debug Breadcrumbs — writes to AsyncStorage so even if the app crashes,
 * on the NEXT launch we can read the last breadcrumbs to see where it died.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BREADCRUMB_KEY = '@crash_breadcrumbs';
const MAX_LINES = 200;

let breadcrumbCount = 0;
let storageAvailable = true;

export function breadcrumb(phase: string, detail?: string) {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `[${timestamp}] #${breadcrumbCount++} ${phase}${detail ? ' — ' + detail : ''}`;
  console.log(`[CRASH-DEBUG] ${line}`);

  // Append to AsyncStorage (non-blocking, fire-and-forget)
  if (!storageAvailable) return;
  const appendAsync = async () => {
    try {
      const existing = await AsyncStorage.getItem(BREADCRUMB_KEY).catch(() => '');
      const lines = (existing || '').split('\n').filter(Boolean);
      lines.push(line);
      // Keep only last N lines
      const trimmed = lines.slice(-MAX_LINES);
      await AsyncStorage.setItem(BREADCRUMB_KEY, trimmed.join('\n'));
    } catch {
      // Disable storage logging if it keeps failing
      storageAvailable = false;
    }
  };
  appendAsync();
}

/** Call this on app launch to read and return the last breadcrumbs from previous session */
export async function readLastBreadcrumbs(): Promise<string> {
  try {
    const content = await AsyncStorage.getItem(BREADCRUMB_KEY);
    return content || '(no breadcrumbs)';
  } catch {
    return '(no breadcrumb file)';
  }
}

/** Call this to clear breadcrumbs after reading */
export async function clearBreadcrumbs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BREADCRUMB_KEY);
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

  // Also catch unhandled promise rejections via global tracking
  try {
    const { enable, disable } = require('promise/setimmediate/rejection-tracking');
    enable({
      allRejections: true,
      onUnhandled: (id: number, error: any) => {
        const msg = error?.message ?? String(error);
        breadcrumb(`UNHANDLED-PROMISE id=${id}: ${msg}`);
        console.error(`[CRASH-DEBUG] UNHANDLED PROMISE REJECTION:`, error);
      },
    });
  } catch {
    // Fallback: no promise tracking available, rely on ErrorUtils
    breadcrumb('GlobalErrorHandlers', 'promise/setimmediate not available, using ErrorUtils only');
  }

  breadcrumb('00b', 'Global error handlers installed');
}
