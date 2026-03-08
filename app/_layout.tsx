import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
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

import "../global.css";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error('Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env');
}

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthRedirectHandler() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !segments?.[0]) return;

    try {
      const inAuthGroup = segments[0] === '(auth)';
      const inTabsGroup = segments[0] === '(tabs)';
      const inOnboarding = segments[0] === 'onboarding';

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
  }, [isSignedIn, isLoaded, segments, user]);

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
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <ThemeInitializer />
        <LanguageProvider>
          <QuestProvider>
            <RootLayoutNav />
          </QuestProvider>
        </LanguageProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
