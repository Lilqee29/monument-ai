import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ImageBackground, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withDelay,
  FadeInDown,
  FadeInUp
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

export default function Index() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/(tabs)');
    }
  }, [isLoaded, isSignedIn]);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="light" />
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1548013146-72479768bbaa?q=80&w=2070&auto=format&fit=crop' }}
        style={{ width, height }}
        className="flex-1"
      >
        <View className="flex-1 bg-black/60 items-center justify-end pb-20 px-8">
          <Animated.View
            className="items-center"
          >
            <Text className="text-gold text-5xl font-serif mb-4 text-center">RELICA</Text>
            <Text className="text-textPrimary text-xl font-sans text-center mb-12 opacity-90 leading-7">
              Capture history.{"\n"}Preserve the soul of every landmark.
            </Text>
          </Animated.View>

          <Animated.View
            className="w-full"
          >
            <View className="flex-row justify-center gap-4 mb-10">
              {['English', 'Français', 'Español'].map((lang, idx) => (
                <TouchableOpacity 
                  key={lang}
                  className="bg-black/40 border border-white/20 px-4 py-2 rounded-full"
                  onPress={() => alert(`Language set to ${lang}`)}
                >
                  <Text className="text-white/80 font-sans text-xs uppercase tracking-widest">{lang}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login')}
              className="bg-gold h-16 rounded-2xl items-center justify-center mb-4 active:opacity-80"
            >
              <Text className="text-background font-bold text-lg">Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/signup')}
              className="h-16 rounded-2xl items-center justify-center border border-gold/30"
            >
              <Text className="text-gold font-bold text-lg">Create Account</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
  );
}
