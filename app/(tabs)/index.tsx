import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, Sparkles, User, MapPin } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useLanguage } from '@/lib/languageContext';
import { useToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';
import { breadcrumb } from '@/lib/crashDebug';

// ─── Permission status type ───────────────────────────────────────────────────
type PermStatus = 'undetermined' | 'granted' | 'denied';

export default function CameraScreen() {
  breadcrumb('C01', 'CameraScreen render');

  // Manual permission state — avoids useCameraPermissions() hook which triggers
  // AVFoundation native thread callbacks that crash on bridgeless new arch iOS builds.
  const [camStatus, setCamStatus] = useState<PermStatus>('undetermined');
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // Check permissions lazily inside useEffect — never during render
  useEffect(() => {
    breadcrumb('C10', 'CameraScreen useEffect — checking permissions');
    let cancelled = false;

    (async () => {
      // Camera permission — check only, do NOT request automatically
      try {
        const { status } = await Camera.getCameraPermissionsAsync();
        if (!cancelled) {
          setCamStatus(status as PermStatus);
          breadcrumb('C11', `camera permission: ${status}`);
        }
      } catch (e: any) {
        breadcrumb('C12', `camera perm check error: ${e?.message}`);
        if (!cancelled) setCamStatus('denied');
      }

      // Location — check only
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled) {
          setLocationPermission(status === 'granted');
          breadcrumb('C13', `location permission: ${status}`);
        }
      } catch (e: any) {
        breadcrumb('C14', `location perm check error: ${e?.message}`);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Request camera permission on button tap only
  const requestCameraPermission = useCallback(async () => {
    try {
      breadcrumb('C20', 'Requesting camera permission');
      const { status } = await Camera.requestCameraPermissionsAsync();
      setCamStatus(status as PermStatus);
      breadcrumb('C21', `camera permission result: ${status}`);
    } catch (e: any) {
      breadcrumb('C22', `camera permission request error: ${e?.message}`);
      setCamStatus('denied');
    }
  }, []);

  const takePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      try {
        setIsProcessing(true);
        let location = null;
        if (locationPermission) {
          try {
            location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          } catch (e) {
            console.log('Could not get location', e);
          }
        }

        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
        });

        if (photo) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await MediaLibrary.saveToLibraryAsync(photo.uri);
          } catch (err) {
            console.warn('Could not save to library', err);
          }

          router.push({
            pathname: '/result',
            params: {
              uri: photo.uri,
              userLat: location?.coords.latitude?.toString(),
              userLng: location?.coords.longitude?.toString(),
            },
          });
        }
      } catch (error) {
        console.error('Capture Error:', error);
        showToast('Failed to take photo.', 'error');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const pickImage = async () => {
    try {
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
          },
        });
      }
    } catch (e: any) {
      console.warn('Image picker error:', e);
      showToast('Failed to open photo library.', 'error');
    }
  };

  // ─── Permission not yet checked (first render) ──────────────────────────────
  if (camStatus === 'undetermined') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  // ─── Camera permission denied or not granted ────────────────────────────────
  if (camStatus !== 'granted') {
    return (
      <View style={styles.center}>
        <Sparkles size={64} color="#c9a84c" style={{ opacity: 0.5 }} />
        <Text style={styles.title}>Enable Your Vision</Text>
        <Text style={styles.subtitle}>
          RELICA requires camera access to recognize and archive landmarks.
        </Text>
        <TouchableOpacity onPress={requestCameraPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Camera granted — show viewfinder ──────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mute={true}
      />

      {/* Overlay UI */}
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110 },
        ]}
        pointerEvents="box-none"
      >
        {/* Top HUD */}
        <View style={styles.row} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.circleBtn}
          >
            <User color="white" size={24} />
          </TouchableOpacity>

          <View style={styles.modeBadge}>
            <View style={styles.dot} />
            <Text style={styles.modeText}>{t('explorerMode')}</Text>
          </View>

          <TouchableOpacity style={styles.circleBtn}>
            <MapPin color={locationPermission ? '#c9a84c' : 'white'} size={22} />
          </TouchableOpacity>
        </View>

        {/* Hint */}
        <View style={styles.hintWrap} pointerEvents="none">
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>"{t('focusHint')}"</Text>
          </View>
        </View>

        {/* Bottom Controls */}
        <View style={styles.controls} pointerEvents="box-none">
          <TouchableOpacity onPress={pickImage} style={styles.circleBtn}>
            <ImageIcon color="white" size={28} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={takePicture}
            disabled={isProcessing}
            style={styles.shutterOuter}
          >
            <View style={styles.shutterInner}>
              {isProcessing ? (
                <ActivityIndicator color="black" />
              ) : (
                <View style={styles.shutterDot} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.circleBtn}>
            <Sparkles color="#c9a84c" size={28} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  title: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 24,
    marginTop: 32,
    fontWeight: '600',
  },
  subtitle: {
    color: '#aaa',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 16,
    lineHeight: 26,
  },
  button: {
    backgroundColor: '#c9a84c',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 48,
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circleBtn: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modeBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c9a84c',
    marginRight: 12,
  },
  modeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  hintWrap: { alignItems: 'center' },
  hintBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hintText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  shutterOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 78,
    height: 78,
    backgroundColor: '#c9a84c',
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#050505',
    opacity: 0.6,
  },
});
