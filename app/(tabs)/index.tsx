import React, { useState, useRef, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, Sparkles, User, MapPin, Camera as CameraIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useLanguage } from '@/lib/languageContext';
import { useToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';
import { breadcrumb } from '@/lib/crashDebug';

// ─── Camera Native Error Boundary ─────────────────────────────────────────────
interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

class CameraErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(_: Error): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    breadcrumb('C_ERR', `CameraView native render error: ${error?.message}`);
    console.warn('[CameraScreen] Native camera view crashed, using fallback:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function CameraScreen() {
  breadcrumb('C01', 'CameraScreen render');

  // Default live camera to OFF on iOS sideloaded builds to prevent native AVCaptureSession aborts
  const [showLiveCamera, setShowLiveCamera] = useState<boolean>(false);
  const [hasCamPermission, setHasCamPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // Non-blocking location permission check only — never auto-mount CameraView
  useEffect(() => {
    breadcrumb('C10', 'CameraScreen useEffect');
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled) {
          setLocationPermission(status === 'granted');
        }
      } catch (e: any) {
        console.warn('Location check failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const requestCameraPermission = useCallback(async () => {
    try {
      breadcrumb('C20', 'Requesting camera permission');
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasCamPermission(status === 'granted');
      if (status === 'granted') {
        setShowLiveCamera(true);
      }
    } catch (e: any) {
      breadcrumb('C22', `camera request error: ${e?.message}`);
      setHasCamPermission(false);
      setShowLiveCamera(false);
      showToast('Live camera restricted on sideload build. Use gallery.', 'info');
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
            console.log('Location fetch skipped');
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
            console.warn('Save to library skipped');
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
        showToast('Failed to take photo. Use photo library.', 'error');
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

      if (!result.canceled && result.assets?.[0]?.uri) {
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

  // Fallback Viewfinder for when camera hardware is unavailable or disabled
  const FallbackViewfinder = (
    <View style={styles.fallbackContainer}>
      <View style={styles.viewfinderBox}>
        {/* Corner Brackets */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        
        <CameraIcon size={48} color="#ffffff" style={{ opacity: 0.3 }} />
        <Text style={styles.fallbackTitle}>ARCHIVAL SCANNER</Text>
        <Text style={styles.fallbackSub}>Select a photo from your library to archive a monument</Text>

        <TouchableOpacity onPress={pickImage} style={styles.primaryActionBtn}>
          <ImageIcon size={18} color="#000000" style={{ marginRight: 8 }} />
          <Text style={styles.primaryActionText}>SELECT FROM GALLERY</Text>
        </TouchableOpacity>

        {!showLiveCamera && (
          <TouchableOpacity onPress={requestCameraPermission} style={styles.secondaryActionBtn}>
            <Text style={styles.secondaryActionText}>ENABLE LIVE CAMERA</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Native Camera View wrapped in Error Boundary */}
      {showLiveCamera && hasCamPermission === true ? (
        <CameraErrorBoundary fallback={FallbackViewfinder}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mute={true}
          />
        </CameraErrorBoundary>
      ) : (
        FallbackViewfinder
      )}

      {/* Monochrome Apple Overlay UI */}
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        pointerEvents="box-none"
      >
        {/* Top Navigation */}
        <View style={styles.topRow} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.iconCircle}
          >
            <User color="#ffffff" size={20} />
          </TouchableOpacity>

          <View style={styles.modeBadge}>
            <View style={styles.goldDot} />
            <Text style={styles.modeText}>{t('explorerMode')}</Text>
          </View>

          <TouchableOpacity style={styles.iconCircle}>
            <MapPin color={locationPermission ? '#c9a84c' : '#ffffff'} size={20} />
          </TouchableOpacity>
        </View>

        {/* Center Hint (Viewfinder corners for live view) */}
        {showLiveCamera && hasCamPermission === true && (
          <View style={styles.centerTarget} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <Text style={styles.hintText}>"{t('focusHint')}"</Text>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.bottomControls} pointerEvents="box-none">
          <TouchableOpacity onPress={pickImage} style={styles.iconCircle}>
            <ImageIcon color="#ffffff" size={22} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={showLiveCamera && hasCamPermission === true ? takePicture : pickImage}
            disabled={isProcessing}
            style={styles.shutterRing}
          >
            <View style={styles.shutterButton}>
              {isProcessing ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <View style={styles.shutterInnerDot} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={pickImage} style={styles.iconCircle}>
            <Sparkles color="#c9a84c" size={22} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  viewfinderBox: {
    width: '100%',
    aspectRatio: 0.85,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
  },
  fallbackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 20,
  },
  fallbackSub: {
    color: '#8e8e93',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  primaryActionBtn: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 28,
  },
  primaryActionText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  secondaryActionBtn: {
    marginTop: 16,
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: '#c9a84c',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeBadge: {
    backgroundColor: 'rgba(28, 28, 30, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  goldDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c9a84c',
    marginRight: 10,
  },
  modeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  centerTarget: {
    width: 260,
    height: 260,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#ffffff',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  hintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(201, 168, 76, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButton: {
    width: 66,
    height: 66,
    backgroundColor: '#ffffff',
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000000',
    opacity: 0.3,
  },
});
