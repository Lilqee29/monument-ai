import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, Sparkles, User, MapPin } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useLanguage } from '@/lib/languageContext';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      await MediaLibrary.requestPermissionsAsync();
    })();
  }, []);

  if (!permission) {
    return <View className="flex-1 bg-background" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-12">
        <Sparkles size={64} color="#c9a84c" opacity={0.5} />
        <Text className="text-textPrimary text-center text-2xl mt-8 font-serif">
          Enable Your Vision
        </Text>
        <Text className="text-textSecondary text-center text-lg mt-4 font-sans opacity-70 leading-7">
          RELICA requires camera access to recognize and archive landmarks.
        </Text>
        <TouchableOpacity 
          onPress={requestPermission}
          className="bg-gold px-12 py-4 rounded-2xl mt-12 shadow-lg shadow-gold/20"
        >
          <Text className="text-background font-bold text-lg">Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      try {
        setIsProcessing(true);
        let location = null;
        if (locationPermission) {
          try {
            location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          } catch (e) {
            console.log("Could not get location", e);
          }
        }

        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
        });
        
        if (photo) {
          try {
             await MediaLibrary.saveToLibraryAsync(photo.uri);
          } catch (err) {
             console.warn("Could not save to library", err);
          }
          
          router.push({
            pathname: '/result',
            params: { 
              uri: photo.uri,
              userLat: location?.coords.latitude?.toString(),
              userLng: location?.coords.longitude?.toString(),
            }
          });
        }
      } catch (error) {
        console.error('Capture Error:', error);
        Alert.alert("Capture Error", "Failed to take photo.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled) {
      router.push({
        pathname: '/result',
        params: { 
          uri: result.assets[0].uri,
        }
      });
    }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView 
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />
      
      {/* Overlay UI - Moved outside CameraView to fix warning/black screen */}
      <View 
        className="flex-1 bg-transparent justify-between px-8"
        style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110 }}
        pointerEvents="box-none"
      >
        {/* Top HUD */}
        <View className="flex-row justify-between items-center" pointerEvents="box-none">
           <TouchableOpacity 
            onPress={() => router.push('/(tabs)/profile')}
            className="w-12 h-12 bg-black/50 rounded-full items-center justify-center border border-white/20"
          >
            <User color="white" size={24} />
          </TouchableOpacity>
          
          <View className="bg-black/50 px-5 py-2 rounded-full border border-white/20 flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-gold mr-3" />
            <Text className="text-white text-[10px] font-sans tracking-[3px] uppercase font-bold">
              {t('explorerMode')}
            </Text>
          </View>

          <TouchableOpacity 
            className="w-12 h-12 bg-black/50 rounded-full items-center justify-center border border-white/20"
          >
            <MapPin color={locationPermission ? "#c9a84c" : "white"} size={22} />
          </TouchableOpacity>
        </View>

        {/* Hint Overlay */}
        <Animated.View entering={FadeIn.delay(500)} className="items-center" pointerEvents="none">
          <View className="bg-black/40 px-6 py-3 rounded-2xl border border-white/10">
            <Text className="text-white/90 text-sm font-serif italic text-center">
              "{t('focusHint')}"
            </Text>
          </View>
        </Animated.View>

        {/* Bottom Controls */}
        <View className="flex-row items-center justify-between px-2" pointerEvents="box-none">
          <TouchableOpacity 
            onPress={pickImage}
            className="w-16 h-16 bg-black/50 rounded-full items-center justify-center border border-white/20"
          >
            <ImageIcon color="white" size={28} />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={takePicture}
            disabled={isProcessing}
            className="w-24 h-24 rounded-full border-2 border-gold/30 items-center justify-center"
          >
            <View className="w-[78px] h-[78px] bg-gold rounded-full items-center justify-center shadow-2xl">
              {isProcessing ? (
                <ActivityIndicator color="black" />
              ) : (
                <View className="w-8 h-8 border-[3px] border-background rounded-full opacity-60" />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            className="w-16 h-16 bg-black/50 rounded-full items-center justify-center border border-white/20"
          >
            <Sparkles color="#c9a84c" size={28} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
