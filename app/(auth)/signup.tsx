import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ImageBackground, Dimensions, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSignUp, useOAuth } from '@clerk/clerk-expo';
import { useRouter, Link } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

const { width, height } = Dimensions.get('window');

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // ── useOAuth hooks MUST be at top level — no try/catch around hooks ──
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });

  const isAuthenticating = useRef(false);

  const onSelectAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    if (isAuthenticating.current) return;
    const selectedAuth = strategy === 'oauth_google' ? startGoogleFlow : startAppleFlow;
    if (!selectedAuth) {
      Alert.alert('OAuth Unavailable', 'Social login is not available on this sideloaded build. Please use Demo Mode.');
      return;
    }

    isAuthenticating.current = true;
    try {
      const { createdSessionId, setActive: setOAuthActive } = await selectedAuth();

      if (createdSessionId) {
        setOAuthActive!({ session: createdSessionId });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (!msg.includes('already open') && !msg.includes('UserCancel')) {
        console.error('OAuth error', err);
        Alert.alert('OAuth Error', 'Social login failed. Try Demo Mode.');
      }
    } finally {
      isAuthenticating.current = false;
    }
  };

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Sign Up Error', err.errors?.[0]?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.error(JSON.stringify(completeSignUp, null, 2));
        Alert.alert('Verification incomplete', 'Check your code again.');
      }
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Verification Error', err.errors?.[0]?.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Header */}
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
                  <Text className="text-gold text-4xl font-serif">Hello, Traveler</Text>
                  {!pendingVerification ? (
                    <Text className="text-textPrimary text-lg font-sans opacity-80 mt-1">Start your historical collection</Text>
                  ) : (
                    <Text className="text-textPrimary text-lg font-sans opacity-80 mt-1">Check your email for the code</Text>
                  )}
                </View>
              </View>
            </ImageBackground>
          </View>

          {/* Form */}
          <View className="flex-1 bg-background px-8 pt-10 rounded-t-[40px] -mt-10">
            {!pendingVerification ? (
              <View className="space-y-6">
                <View>
                  <Text className="text-textSecondary text-sm font-sans mb-2 ml-1 uppercase">EMAIL</Text>
                  <TextInput
                    placeholder="explorer@earth.com"
                    placeholderTextColor="#4b4b4b"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    className="bg-surface h-16 rounded-2xl px-6 text-textPrimary font-sans border border-border/50 text-lg"
                  />
                </View>

                <View>
                  <Text className="text-textSecondary text-sm font-sans mb-2 ml-1 uppercase">PASSWORD</Text>
                  <TextInput
                    placeholder="Choose your path..."
                    placeholderTextColor="#4b4b4b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    className="bg-surface h-16 rounded-2xl px-6 text-textPrimary font-sans border border-border/50 text-lg"
                  />
                </View>

                <TouchableOpacity 
                  onPress={onSignUpPress}
                  disabled={loading}
                  className="bg-gold h-16 rounded-2xl items-center justify-center mt-6 active:opacity-90 shadow-lg shadow-gold/20"
                >
                  {loading ? (
                    <ActivityIndicator color="black" />
                  ) : (
                    <Text className="text-background font-bold text-lg">Create Account</Text>
                  )}
                </TouchableOpacity>

                {/* Social Signups */}
                <View className="mt-8">
                  <View className="flex-row items-center mb-8">
                    <View className="flex-1 h-[1px] bg-border/20" />
                    <Text className="text-textSecondary px-4 text-xs font-black uppercase tracking-widest">or join with</Text>
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
                  <Text className="text-textSecondary text-lg font-sans">Already signed up? </Text>
                  <Link href="/(auth)/login" asChild>
                    <TouchableOpacity>
                      <Text className="text-gold font-bold text-lg">Log in</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            ) : (
              <View className="space-y-6">
                <View>
                  <Text className="text-textSecondary text-sm font-sans mb-2 ml-1 uppercase">VERIFICATION CODE</Text>
                  <TextInput
                    placeholder="123456"
                    placeholderTextColor="#4b4b4b"
                    value={code}
                    keyboardType="number-pad"
                    onChangeText={setCode}
                    className="bg-surface h-16 rounded-2xl px-6 text-textPrimary font-sans border border-border/50 text-2xl text-center tracking-[10px]"
                  />
                </View>

                <TouchableOpacity 
                  onPress={onPressVerify}
                  disabled={loading}
                  className="bg-gold h-16 rounded-2xl items-center justify-center mt-6 shadow-lg shadow-gold/20"
                >
                  {loading ? (
                    <ActivityIndicator color="black" />
                  ) : (
                    <Text className="text-background font-bold text-lg">Verify Email</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}
