import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import 'react-native-reanimated';
import { 
  useFonts, 
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold 
} from '@expo-google-fonts/playfair-display';
import { 
  Inter_400Regular, 
  Inter_700Bold 
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@/lib/cache';
import { QuestProvider } from '@/lib/questContext';
import { requestGeofencingPermissions } from '@/lib/geofencing';
import { LanguageProvider } from '@/lib/languageContext';
import { useColorScheme } from 'nativewind';
import { setupNotifications } from '@/lib/notifications';
import { CrashReporter, recordModuleError } from '@/components/CrashReporter';
import { ToastProvider } from '@/components/Toast';
import { DemoProvider, useDemoMode } from '@/lib/demoMode';
import { breadcrumb, readLastBreadcrumbs, clearBreadcrumbs, installGlobalErrorHandlers, guardedAsync, enableBreadcrumbStorage, readLastCrashFile, deleteLastCrashFile } from '@/lib/crashDebug';

import "../global.css";

// NO module-scope breadcrumb calls — causes native crash on launch

// ── Module-scope env-var check (safe — no throw) ────────────────────
let publishableKey = '';
try {
  publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (!publishableKey) {
    recordModuleError('CLERK_KEY', new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty/undefined'));
  }
} catch (e) {
  recordModuleError('CLERK_KEY', e);
}

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

// ── Error display shown when env vars are missing ────────────────────
function EnvVarErrorScreen() {
  const envSnapshot = {
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ? '(set)' : '(missing)',
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ? '(set)' : '(missing)',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? '(set)' : '(missing)',
    EXPO_PUBLIC_OPENROUTER_API_KEY: process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ? '(set)' : '(missing)',
  };
  const moduleErrors = global.__CRASH_REPORTER_ERRORS__ ?? [];

  return (
    <View style={localStyles.container}>
      <ScrollView contentContainerStyle={localStyles.scroll}>
        <Text style={localStyles.title}>⚠ ENV VARS MISSING</Text>
        <Text style={localStyles.subtitle}>
          EXPO_PUBLIC_* variables were not injected into the JS bundle during the CI build.
        </Text>

        <Text style={localStyles.section}>BUILD-TIME ENV VARS:</Text>
        {Object.entries(envSnapshot).map(([k, v]) => (
          <Text key={k} style={localStyles.envLine} selectable>
            {k}: {v}
          </Text>
        ))}

        <Text style={localStyles.section}>MODULE-SCOPE ERRORS:</Text>
        {moduleErrors.length > 0 ? (
          moduleErrors.map((e: { phase: string; message: string }, i: number) => (
            <Text key={i} style={localStyles.errorLine} selectable>
              [{e.phase}] {e.message}
            </Text>
          ))
        ) : (
          <Text style={localStyles.errorLine}>(none)</Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Navigation components ───────────────────────────────────────────
function AuthRedirectHandler() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const { isDemoMode, isLoading: demoLoading } = useDemoMode();

  useEffect(() => {
    breadcrumb('30', `AuthRedirect: loaded=${isLoaded} signedIn=${isSignedIn} demo=${isDemoMode} demoLoading=${demoLoading} segments=${segments?.[0]}`);
    if (!isLoaded || !segments?.[0] || demoLoading) return;

    try {
      const inAuthGroup = segments[0] === '(auth)';
      const inTabsGroup = segments[0] === '(tabs)';
      const inOnboarding = segments[0] === 'onboarding';

      // Demo mode — skip all auth, go straight to tabs
      if (isDemoMode) {
        breadcrumb('31', `demo mode — inAuth=${inAuthGroup} inOnboarding=${inOnboarding}`);
        if (inAuthGroup || inOnboarding) {
          router.replace('/(tabs)');
        }
        return;
      }

      if (isSignedIn && user) {
        const onboardingCompleted = user.unsafeMetadata?.onboardingCompleted;
        const shouldShowOnboarding = onboardingCompleted === false || onboardingCompleted === undefined;
        
        breadcrumb('32', `signed in — onboardingCompleted=${onboardingCompleted} shouldShow=${shouldShowOnboarding}`);
        if (shouldShowOnboarding) {
          if (!inOnboarding) {
            router.replace('/onboarding');
          }
        } else if (onboardingCompleted === true && inOnboarding) {
          router.replace('/(tabs)');
        } else if (inAuthGroup) {
          router.replace('/(tabs)');
        }
        
        requestGeofencingPermissions().catch((e) => {
          breadcrumb('33', `geofencing error: ${e}`);
          console.warn(e);
        });
      } else if (!isSignedIn && (inTabsGroup || inOnboarding)) {
        breadcrumb('34', 'not signed in, redirecting to login');
        router.replace('/(auth)/login');
      }
    } catch (e) {
      breadcrumb('35', `navigation redirect FAILED: ${e}`);
      console.warn("Navigation redirect failed:", e);
    }
  }, [isSignedIn, isLoaded, segments, user, isDemoMode, demoLoading]);

  return null;
}

function ThemeInitializer() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && user) {
      const savedTheme = user.unsafeMetadata?.theme as 'light' | 'dark' | 'system';
      if (savedTheme && savedTheme !== colorScheme) {
        setColorScheme(savedTheme);
      }
    }
  }, [isLoaded, user]);

  return null;
}

function RootLayoutNav() {
  const { colorScheme } = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View className={`flex-1 ${colorScheme === 'dark' ? 'dark' : ''}`}>
        <AuthRedirectHandler />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="result" options={{ 
            title: 'Result', 
            presentation: 'modal',
            headerShown: false 
          }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session Details', headerShown: false }} />
          <Stack.Screen name="settings" options={{ 
            title: 'Settings', 
            presentation: 'modal',
            headerShown: false 
          }} />
          <Stack.Screen name="collection" options={{ 
            headerShown: false,
            animation: 'slide_from_right'
          }} />
          <Stack.Screen name="worldmap" options={{ 
            headerShown: false,
            animation: 'slide_from_bottom'
          }} />
          <Stack.Screen name="quiz" options={{ 
            headerShown: false,
            animation: 'fade'
          }} />
          <Stack.Screen name="leaderboard" options={{ 
            headerShown: false,
            animation: 'slide_from_right'
          }} />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? "light" : "dark"} />
      </View>
    </ThemeProvider>
  );
}

// ── Root ────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    Inter_400Regular,
    Inter_700Bold,
  });

  // Show crash file + breadcrumbs FULL SCREEN for debugging — can't miss this
  const [lastBreadcrumbs, setLastBreadcrumbs] = useState<string>('');
  const [lastCrashFile, setLastCrashFile] = useState<string>('');
  const [showDebugScreen, setShowDebugScreen] = useState(false);

  // On mount: read previous session crash file + breadcrumbs + enable storage
  useEffect(() => {
    enableBreadcrumbStorage();
    installGlobalErrorHandlers(); // no-op now but kept for safety

    // Read crash file (primary — written by global error handler)
    readLastCrashFile().then(payload => {
      if (payload) {
        const lines = [
          `=== CRASH FILE (${payload.timestamp}) ===`,
          `FATAL: ${payload.isFatal}`,
          ``,
          `MESSAGE:`,
          payload.message,
          ``,
          `STACK:`,
          payload.stack,
          ``,
          `=== BREADCRUMBS AT CRASH TIME ===`,
          ...payload.breadcrumbs,
        ];
        setLastCrashFile(lines.join('\n'));
        setShowDebugScreen(true);
      }
    });

    // Also read SecureStore breadcrumbs as a secondary source
    readLastBreadcrumbs().then(text => {
      if (text && text !== '(no breadcrumbs)' && text !== '(no breadcrumb file)') {
        setLastBreadcrumbs(text);
        setShowDebugScreen(true); // BLOCK the app with full-screen debug info
      }
    });
  }, []);

  useEffect(() => {
    breadcrumb('10', `fonts: loaded=${fontsLoaded} error=${fontError}`);
    if (fontsLoaded || fontError) {
      guardedAsync('SPLASH-HIDE', () => SplashScreen.hideAsync()).then(() => {
        breadcrumb('11', 'splash hidden — calling setupNotifications');
        guardedAsync('NOTIFICATIONS', () => setupNotifications()).then((granted) => {
          breadcrumb('12', `notifications done — granted=${granted}`);
        });
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    breadcrumb('09', 'fonts not loaded yet, returning null');
    return null;
  }

  breadcrumb('20', 'rendering component tree');

  // FULL-SCREEN crash debug — user must tap "Continue" to dismiss
  if (showDebugScreen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 16, paddingTop: 60 }}>
        <Text style={{ color: '#ff4444', fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>
          ‼️ CRASH DEBUG — Previous Session
        </Text>
        <Text style={{ color: '#ff8800', fontSize: 12, marginBottom: 4 }}>
          📸 SCREENSHOT THIS SCREEN then tap Continue
        </Text>
        <Text style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>
          Crash file: {lastCrashFile ? '✅ captured' : '❌ not found'} | Breadcrumbs: {lastBreadcrumbs && lastBreadcrumbs !== '(no breadcrumbs)' ? '✅' : '❌'}
        </Text>
        <ScrollView style={{ flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 8 }}>
          {lastCrashFile ? (
            <Text style={{ color: '#ff6060', fontSize: 11, fontFamily: 'Courier' }} selectable>
              {lastCrashFile}
            </Text>
          ) : null}
          {lastCrashFile && lastBreadcrumbs && lastBreadcrumbs !== '(no breadcrumbs)' ? (
            <Text style={{ color: '#ffcc00', fontSize: 11, fontFamily: 'Courier', marginTop: 16 }}>
              {'\n=== SECURESTORE BREADCRUMBS (backup) ==='}
            </Text>
          ) : null}
          {lastBreadcrumbs && lastBreadcrumbs !== '(no breadcrumbs)' && lastBreadcrumbs !== '(no breadcrumb file)' ? (
            <Text style={{ color: '#0f0', fontSize: 11, fontFamily: 'Courier' }} selectable>
              {lastCrashFile ? '' : '=== BREADCRUMBS (no crash file) ===\n'}{lastBreadcrumbs}
            </Text>
          ) : null}
          {!lastCrashFile && (!lastBreadcrumbs || lastBreadcrumbs === '(no breadcrumbs)') ? (
            <Text style={{ color: '#888', fontSize: 11, fontFamily: 'Courier' }}>
              (No crash data captured — the file write likely raced the abort.\nCheck breadcrumbs for last known state.)
            </Text>
          ) : null}
        </ScrollView>
        <TouchableOpacity
          onPress={() => {
            setShowDebugScreen(false);
            deleteLastCrashFile();
            clearBreadcrumbs();
          }}
          style={{ backgroundColor: '#c9a84c', paddingVertical: 16, borderRadius: 12, marginTop: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>Continue →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <CrashReporter>
      {publishableKey ? (
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <ClerkLoaded>
            <DemoProvider>
              <ToastProvider>
                <ThemeInitializer />
                <LanguageProvider>
                  <QuestProvider>
                    <RootLayoutNav />
                  </QuestProvider>
                </LanguageProvider>
              </ToastProvider>
            </DemoProvider>
          </ClerkLoaded>
        </ClerkProvider>
      ) : (
        <EnvVarErrorScreen />
      )}
    </CrashReporter>
  );
}

const localStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 20, paddingTop: 60 },
  title: { color: '#ff4444', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#ff8888', fontSize: 13, marginBottom: 20, lineHeight: 18 },
  section: { color: '#ffcc00', fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 4 },
  envLine: { color: '#ffffff', fontSize: 12, fontFamily: 'Courier', marginLeft: 8, marginBottom: 2 },
  errorLine: { color: '#ff8888', fontSize: 11, fontFamily: 'Courier', marginLeft: 8, marginBottom: 4 },
});
