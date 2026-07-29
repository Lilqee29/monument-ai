import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ImageBackground, Dimensions, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { useRouter, Link } from 'expo-router';
import { ChevronLeft, Compass } from 'lucide-react-native';
import { useAssets } from 'expo-asset';
import * as WebBrowser from 'expo-web-browser';
import { useDemoMode } from '@/lib/demoMode';
import { breadcrumb } from '@/lib/crashDebug';

breadcrumb('LOG00', 'login.tsx loaded');

WebBrowser.maybeCompleteAuthSession();
breadcrumb('LOG01', 'maybeCompleteAuthSession done');

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { enterDemoMode } = useDemoMode();

  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: "oauth_google" });
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: "oauth_apple" });

  const onSelectAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    const selectedAuth = strategy === 'oauth_google' ? startGoogleFlow : startAppleFlow;

    try {
      const { createdSessionId, setActive: setOAuthActive } = await selectedAuth();

      if (createdSessionId) {
        setOAuthActive!({ session: createdSessionId });
        router.replace('/(tabs)');
      }
    } catch (err) {
      console.error("OAuth error", err);
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!isLoaded) return;

    setLoading(true);
    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
        Alert.alert('Incomplete Session', 'Some steps are missing.');
      }
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Login Error', err.errors?.[0]?.message || 'An error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Background Image Header */}
          <View className="h-[35%] w-full">
            <ImageBackground
              source={{ uri: 'https://images.unsplash.com/photo-1548013146-72479768bbaa?q=80&w=2070&auto=format&fit=crop' }}
              className="flex-1"
            >
              <View className="flex-1 bg-black/50 p-8 justify-between">
                <TouchableOpacity 
                  onPress={() => router.back()}
                  className="w-12 h-12 bg-black/40 rounded-full items-center justify-center mt-6"
                >
                  <ChevronLeft color="#c9a84c" size={28} />
                </TouchableOpacity>
                <View>
                  <Text className="text-gold text-4xl font-serif">Welcome Back</Text>
                  <Text className="text-textPrimary text-lg font-sans opacity-80 mt-1">Sign in to continue your journey</Text>
                </View>
              </View>
            </ImageBackground>
          </View>

          {/* Login Form */}
          <View className="flex-1 bg-background px-8 pt-10 rounded-t-[40px] -mt-10">
            <View className="space-y-6">
              <View>
                <Text className="text-textSecondary text-sm font-sans mb-2 ml-1">EMAIL ADDRESS</Text>
                <TextInput
                  placeholder="name@example.com"
                  placeholderTextColor="#4b4b4b"
                  value={email}
                  onChangeText={(email) => setEmail(email)}
                  autoCapitalize="none"
                  className="bg-surface h-16 rounded-2xl px-6 text-textPrimary font-sans border border-border/50 text-lg"
                />
              </View>

              <View>
                <Text className="text-textSecondary text-sm font-sans mb-2 ml-1">PASSWORD</Text>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="#4b4b4b"
                  value={password}
                  onChangeText={(password) => setPassword(password)}
                  secureTextEntry
                  className="bg-surface h-16 rounded-2xl px-6 text-textPrimary font-sans border border-border/50 text-lg"
                />
              </View>

              <TouchableOpacity 
                onPress={handleSignIn}
                disabled={loading}
                className="bg-gold h-16 rounded-2xl items-center justify-center mt-6 active:opacity-90 transition-all shadow-lg shadow-gold/20"
              >
                {loading ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <Text className="text-background font-bold text-lg">Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Social Logins */}
              <View className="mt-8">
                <View className="flex-row items-center mb-8">
                  <View className="flex-1 h-[1px] bg-border/20" />
                  <Text className="text-textSecondary px-4 text-xs font-black uppercase tracking-widest">or explore with</Text>
                  <View className="flex-1 h-[1px] bg-border/20" />
                </View>

                <View className="flex-row gap-4">
                  <TouchableOpacity 
                    onPress={() => onSelectAuth('oauth_google')}
                    className="flex-1 bg-surface border border-border/50 h-16 rounded-2xl flex-row items-center justify-center gap-3 shadow-sm"
                  >
                    <View className="w-6 h-6 rounded-full bg-white items-center justify-center">
                       <Text className="text-black font-black text-xs">G</Text>
                    </View>
                    <Text className="text-textPrimary font-bold">Google</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={() => onSelectAuth('oauth_apple')}
                    className="flex-1 bg-surface border border-border/50 h-16 rounded-2xl flex-row items-center justify-center gap-3 shadow-sm"
                  >
                    <View className="w-6 h-6 rounded-full bg-black items-center justify-center">
                       <Text className="text-white font-black text-xs">A</Text>
                    </View>
                    <Text className="text-textPrimary font-bold">Apple</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex-row justify-center mt-10">
                <Text className="text-textSecondary text-lg font-sans">New explorer? </Text>
                <Link href="/(auth)/signup" asChild>
                  <TouchableOpacity>
                    <Text className="text-gold font-bold text-lg">Join us</Text>
                  </TouchableOpacity>
                </Link>
              </View>

              {/* Demo Mode */}
              <TouchableOpacity
                onPress={async () => {
                  await enterDemoMode();
                  router.replace('/(tabs)');
                }}
                className="flex-row items-center justify-center gap-3 mt-6 mb-4 py-4 rounded-2xl border border-dashed border-gold/30 bg-gold/5"
                activeOpacity={0.7}
              >
                <Compass size={20} color="#c9a84c" />
                <Text className="text-gold font-bold text-base">Try Demo Mode</Text>
              </TouchableOpacity>
              <Text className="text-textSecondary text-xs text-center mb-6 opacity-50">
                Explore the app with sample data — no account needed
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}
