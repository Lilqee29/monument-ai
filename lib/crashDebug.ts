/**
 * Crash Debug — Persistent crash-to-file logger.
 *
 * Strategy:
 *  1. Global JS error handler is installed at MODULE SCOPE (not in useEffect)
 *     so it catches errors that happen before any React component mounts.
 *  2. On a fatal error, we write the full error + stack to a JSON file via
 *     expo-file-system, then delay calling the original fatal handler by ~600ms
 *     to give the async write a chance to flush before the process aborts.
 *  3. Breadcrumbs are written to SecureStore as a timeline of "last known state".
 *  4. On the NEXT launch, _layout.tsx reads both the crash file and breadcrumbs
 *     and displays them full-screen before letting the app proceed.
 *
 * NOTE: FileSystem is imported lazily (inside functions) to avoid circular-import
 * crashes at module evaluation time. Same for SecureStore.
 */

// ─── Types ──────────────────────────────────────────────────────────────────
interface CrashPayload {
  timestamp: string;
  isFatal: boolean;
  message: string;
  stack: string;
  breadcrumbs: string[];
}

// ─── In-memory breadcrumb ring-buffer ───────────────────────────────────────
// Kept in memory so we can include them in the crash file payload
// (SecureStore is async and may not have all entries yet).
const MAX_MEMORY_CRUMBS = 100;
const _memCrumbs: string[] = [];
let _breadcrumbCount = 0;

// ─── SecureStore write queue ─────────────────────────────────────────────────
// We still write to SecureStore as a backup (survives app reinstalls differently).
let _secureStoreEnabled = false; // set true after app mounts
const BREADCRUMB_KEY = '@crash_breadcrumbs_v2';
const CRASH_FILE_KEY = 'last_crash.json'; // written to FileSystem.documentDirectory

// ─── Lazy FileSystem / SecureStore imports ───────────────────────────────────
// Do NOT import these at top level — if expo-file-system fails to initialise
// (native module not linked, etc.) it would crash before our handler is installed.
function getFS(): typeof import('expo-file-system') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system');
  } catch {
    return null;
  }
}

function getSS(): typeof import('expo-secure-store') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-secure-store');
  } catch {
    return null;
  }
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────
export function breadcrumb(phase: string, detail?: string) {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `[${timestamp}] #${_breadcrumbCount++} ${phase}${detail ? ' — ' + detail : ''}`;
  console.log(`[CRASH-DEBUG] ${line}`);

  // Keep in memory ring-buffer
  _memCrumbs.push(line);
  if (_memCrumbs.length > MAX_MEMORY_CRUMBS) _memCrumbs.shift();

  // Non-blocking write to SecureStore (fire-and-forget)
  if (!_secureStoreEnabled) return;
  (async () => {
    try {
      const SS = getSS();
      if (!SS) return;
      const existing = await SS.getItemAsync(BREADCRUMB_KEY).catch(() => '');
      const lines = (existing || '').split('\n').filter(Boolean);
      lines.push(line);
      const trimmed = lines.slice(-80);
      await SS.setItemAsync(BREADCRUMB_KEY, trimmed.join('\n'));
    } catch {
      // ignore — never let debug logging crash the app
    }
  })();
}

// ─── Enable SecureStore writes (call once on app mount) ──────────────────────
export function enableBreadcrumbStorage() {
  _secureStoreEnabled = true;
}

// ─── Read last crash file (FileSystem) ───────────────────────────────────────
export async function readLastCrashFile(): Promise<CrashPayload | null> {
  try {
    const FS = getFS();
    if (!FS || !FS.documentDirectory) return null;
    const path = FS.documentDirectory + CRASH_FILE_KEY;
    const info = await FS.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FS.readAsStringAsync(path);
    return JSON.parse(raw) as CrashPayload;
  } catch {
    return null;
  }
}

// ─── Delete crash file (call after displaying it) ────────────────────────────
export async function deleteLastCrashFile(): Promise<void> {
  try {
    const FS = getFS();
    if (!FS || !FS.documentDirectory) return;
    const path = FS.documentDirectory + CRASH_FILE_KEY;
    await FS.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
}

// ─── Read last breadcrumbs (SecureStore backup) ───────────────────────────────
export async function readLastBreadcrumbs(): Promise<string> {
  try {
    const SS = getSS();
    if (!SS) return '(SecureStore unavailable)';
    const content = await SS.getItemAsync(BREADCRUMB_KEY);
    return content || '(no breadcrumbs)';
  } catch {
    return '(no breadcrumb file)';
  }
}

// ─── Clear breadcrumbs ────────────────────────────────────────────────────────
export async function clearBreadcrumbs(): Promise<void> {
  try {
    const SS = getSS();
    if (SS) await SS.deleteItemAsync(BREADCRUMB_KEY);
  } catch {
    // ignore
  }
}

// ─── Write crash file synchronously-ish ──────────────────────────────────────
// Returns a Promise that resolves when the write is done (or fails silently).
async function writeCrashFile(payload: CrashPayload): Promise<void> {
  try {
    const FS = getFS();
    if (!FS || !FS.documentDirectory) return;
    const path = FS.documentDirectory + CRASH_FILE_KEY;
    await FS.writeAsStringAsync(path, JSON.stringify(payload, null, 2), {
      encoding: FS.EncodingType.UTF8,
    });
    console.log(`[CRASH-DEBUG] ✅ Crash file written to: ${path}`);
  } catch (e) {
    console.log(`[CRASH-DEBUG] ❌ Failed to write crash file: ${e}`);
  }
}

// ─── Global error handler — installed at MODULE SCOPE ────────────────────────
// IMPORTANT: This runs at import time, before any React component mounts.
// This is the critical change vs. the old approach (which installed in useEffect).
(function installGlobalHandlerNow() {
  try {
    const originalHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error: Error | null, isFatal?: boolean) => {
      const msg = error?.message ?? String(error);
      const stack = error?.stack ?? '(no stack)';

      console.error(`[CRASH-DEBUG] ‼️ GLOBAL ERROR (fatal=${isFatal}): ${msg}`);
      console.error(`[CRASH-DEBUG] STACK: ${stack}`);

      // Log as breadcrumb (in-memory only at this point — storage may not be ready)
      breadcrumb(`GLOBAL-ERROR fatal=${isFatal}`, msg.slice(0, 300));
      breadcrumb(`GLOBAL-STACK`, stack.slice(0, 500));

      const payload: CrashPayload = {
        timestamp: new Date().toISOString(),
        isFatal: !!isFatal,
        message: msg,
        stack: stack,
        breadcrumbs: [..._memCrumbs], // snapshot of in-memory ring-buffer
      };

      if (isFatal) {
        // STRATEGY: Start the file write immediately, then delay the original
        // fatal handler to give the async write a chance to complete before
        // the process is aborted by RCTExceptionsManager.
        //
        // 600ms is chosen empirically — long enough for a FileSystem write
        // (typically <50ms on device), short enough that it doesn't feel like a hang.
        //
        // Risk acknowledged: if the native crash path ignores JS timers and
        // aborts immediately, this delay won't help. In that case the breadcrumbs
        // written proactively at each risky operation become the primary signal.
        writeCrashFile(payload).catch(() => {});

        setTimeout(() => {
          if (originalHandler) {
            originalHandler(error, isFatal);
          }
        }, 600);
      } else {
        // Non-fatal: write the file (best-effort) but don't delay anything
        writeCrashFile(payload).catch(() => {});
        if (originalHandler) {
          originalHandler(error, isFatal);
        }
      }
    });

    console.log('[CRASH-DEBUG] ✅ Global error handler installed at module scope');
  } catch (e) {
    console.error('[CRASH-DEBUG] ❌ Failed to install global error handler:', e);
  }
})();

// ─── Guarded async wrapper ────────────────────────────────────────────────────
export async function guardedAsync<T>(
  phase: string,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  breadcrumb(`${phase}`, 'START');

  // Write a checkpoint BEFORE running the risky operation.
  // If the op crashes the process before our error handler fires,
  // at least we'll see "START" in the breadcrumbs on next launch.
  try {
    const result = await fn();
    breadcrumb(`${phase}`, 'OK');
    return result;
  } catch (e: unknown) {
    const err = e as Error | null;
    const msg = err?.message ?? String(e);
    const stack = err?.stack?.slice(0, 500) ?? '(no stack)';
    breadcrumb(`${phase}`, `ERROR: ${msg}`);
    breadcrumb(`${phase} STACK`, stack);
    console.error(`[CRASH-DEBUG] ${phase} FAILED:`, e);
    return fallback;
  }
}

// ─── Legacy export kept for backward compat ──────────────────────────────────
// _layout.tsx calls installGlobalErrorHandlers() in useEffect — keep it as a no-op
// so we don't have to change that call site right now.
export function installGlobalErrorHandlers() {
  // No-op: handler is now installed at module scope above.
  // Kept for backward compatibility with existing call sites.
  breadcrumb('00b', 'installGlobalErrorHandlers() called (no-op — already installed at module scope)');
}
