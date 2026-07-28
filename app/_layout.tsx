import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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

import "../global.css";

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
          moduleErrors.map((e, i) => (
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
    if (!isLoaded || !segments?.[0] || demoLoading) return;

    try {
      const inAuthGroup = segments[0] === '(auth)';
      const inTabsGroup = segments[0] === '(tabs)';
      const inOnboarding = segments[0] === 'onboarding';

      // Demo mode — skip all auth, go straight to tabs
      if (isDemoMode) {
        if (inAuthGroup || inOnboarding) {
          router.replace('/(tabs)');
        }
        return;
      }

      if (isSignedIn && user) {
        const onboardingCompleted = user.unsafeMetadata?.onboardingCompleted;
        const shouldShowOnboarding = onboardingCompleted === false || onboardingCompleted === undefined;
        
        if (shouldShowOnboarding) {
          if (!inOnboarding) {
            router.replace('/onboarding');
          }
        } else if (onboardingCompleted === true && inOnboarding) {
          router.replace('/(tabs)');
        } else if (inAuthGroup) {
          router.replace('/(tabs)');
        }
        
        requestGeofencingPermissions().catch(console.warn);
      } else if (!isSignedIn && (inTabsGroup || inOnboarding)) {
        router.replace('/(auth)/login');
      }
    } catch (e) {
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      setupNotifications().catch(console.warn);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
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
