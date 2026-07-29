/**
 * Custom app entry point.
 *
 * WHY THIS EXISTS:
 * The crash occurs on every single launch before any useEffect runs, so the
 * standard debug screen in _layout.tsx never gets a chance to display.
 *
 * By making THIS the app entry (package.json "main"), we can:
 *  1. Install the global error handler BEFORE expo-router evaluates ANY route file.
 *  2. Check for a saved crash file BEFORE mounting the normal app tree.
 *  3. If a crash file exists, render a minimal standalone screen that has NO
 *     dependencies on any of the modules that are crashing — just raw React Native.
 *
 * The normal app (expo-router) is lazy-imported only AFTER the crash check completes.
 */

// ─── Step 1: Install global error handler immediately ────────────────────────
// This import runs our IIFE before anything else.
import './lib/crashDebug';

// ─── Step 2: Minimal React Native for the crash display screen ───────────────
import React, { useState, useEffect } from 'react';
import {
  AppRegistry,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { ExpoRoot } from 'expo-router';

// ─── Step 3: Minimal crash file reader ───────────────────────────────────────
// Defined inline here so this file has ZERO dependency on crashDebug exports
// (we already imported it above for the side-effect, but we read the file
// independently here using a direct require so it can't accidentally re-throw).
function readCrashFileSync(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FS = require('expo-file-system');
      const path = FS.documentDirectory + 'last_crash.json';
      FS.getInfoAsync(path)
        .then((info: { exists: boolean }) => {
          if (!info.exists) { resolve(null); return; }
          return FS.readAsStringAsync(path);
        })
        .then((raw: string | undefined | null) => {
          if (!raw) { resolve(null); return; }
          resolve(raw);
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function deleteCrashFile(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require('expo-file-system');
    FS.deleteAsync(FS.documentDirectory + 'last_crash.json', { idempotent: true }).catch(() => {});
  } catch {
    // ignore
  }
}

// ─── Step 4: Root component ───────────────────────────────────────────────────
function App() {
  const [checking, setChecking] = useState(true);
  const [crashData, setCrashData] = useState<string | null>(null);

  useEffect(() => {
    readCrashFileSync().then((raw) => {
      if (raw) {
        setCrashData(raw);
      }
      setChecking(false);
    });
  }, []);

  // Still reading
  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#c9a84c" />
      </View>
    );
  }

  // Crash file found — show it BEFORE loading any app code
  if (crashData) {
    let parsed: any = null;
    try { parsed = JSON.parse(crashData); } catch { /* show raw */ }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, padding: 16, paddingTop: 8 }}>
          <Text style={{ color: '#ff4444', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
            ‼️ CRASH CAPTURED — Previous Launch
          </Text>
          <Text style={{ color: '#ff8800', fontSize: 12, marginBottom: 4 }}>
            📸 SCREENSHOT THIS ENTIRE SCREEN then tap Continue
          </Text>
          {parsed ? (
            <Text style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>
              {parsed.timestamp} | fatal={String(parsed.isFatal)}
            </Text>
          ) : null}
          <ScrollView
            style={{ flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 8 }}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {parsed ? (
              <>
                <Text style={{ color: '#ffcc00', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>
                  ── ERROR MESSAGE ──
                </Text>
                <Text style={{ color: '#ff6060', fontSize: 12, fontFamily: 'monospace' }} selectable>
                  {parsed.message}
                </Text>

                <Text style={{ color: '#ffcc00', fontSize: 12, fontWeight: 'bold', marginTop: 12, marginBottom: 4 }}>
                  ── STACK TRACE ──
                </Text>
                <Text style={{ color: '#ff9999', fontSize: 10, fontFamily: 'monospace' }} selectable>
                  {parsed.stack}
                </Text>

                {parsed.breadcrumbs && parsed.breadcrumbs.length > 0 ? (
                  <>
                    <Text style={{ color: '#ffcc00', fontSize: 12, fontWeight: 'bold', marginTop: 12, marginBottom: 4 }}>
                      ── BREADCRUMBS AT CRASH TIME ({parsed.breadcrumbs.length}) ──
                    </Text>
                    <Text style={{ color: '#00ff88', fontSize: 10, fontFamily: 'monospace' }} selectable>
                      {parsed.breadcrumbs.join('\n')}
                    </Text>
                  </>
                ) : null}
              </>
            ) : (
              <Text style={{ color: '#ff6060', fontSize: 10, fontFamily: 'monospace' }} selectable>
                {crashData}
              </Text>
            )}
          </ScrollView>
          <TouchableOpacity
            onPress={() => {
              deleteCrashFile();
              setCrashData(null);
            }}
            style={{
              backgroundColor: '#c9a84c',
              paddingVertical: 16,
              borderRadius: 12,
              marginTop: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>
              Continue → (clears crash log)
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // No crash — start the normal Expo Router app
  // ExpoRoot is the component expo-router/entry registers.
  // We pass the context that expo-router's entry script would normally pass.
  // @ts-ignore require.context is provided by Metro
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

// ─── Step 5: Register the root component ─────────────────────────────────────
AppRegistry.registerComponent('main', () => App);
