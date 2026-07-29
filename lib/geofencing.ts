import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { WORLD_LANDMARKS } from '@/constants/landmarks';

// Distance calculation
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
}

let lastNotifiedMonument: string | null = null;
let lastNotificationTime: number = 0;

// Safe foreground geofencing watcher (to prevent Expo Go background crashes)
export async function requestGeofencingPermissions() {
  if (Platform.OS === 'ios') {
    console.log('[Geofencing] Skipping native notification/geofencing setup on iOS sideload build');
    return;
  }
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();

    if (notifStatus === 'granted') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }

    if (fgStatus === 'granted') {
      // Start a foreground watcher
      Location.watchPositionAsync(
         { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 20000 },
         (loc) => {
            const { latitude, longitude } = loc.coords;
            
            for (const lm of WORLD_LANDMARKS) {
              if (!lm.coordinates || isNaN(lm.coordinates.lat) || isNaN(lm.coordinates.lng)) continue;
              const distance = getDistance(latitude, longitude, lm.coordinates.lat, lm.coordinates.lng);
              
              if (distance < 500) {
                 const now = Date.now();
                 if (lastNotifiedMonument === lm.name && (now - lastNotificationTime) < 10 * 60 * 1000) {
                    continue; 
                 }
                 Notifications.scheduleNotificationAsync({
                   content: {
                     title: `✨ Discovery Radar: Landmark Detected!`,
                     body: `You are near ${lm.name}! 🏛️\nOpen the map to identify and archive this masterpiece.`,
                     sound: true,
                     data: { type: 'landmark_near', landmarkId: lm.id }
                   },
                   trigger: null,
                 });
                 lastNotifiedMonument = lm.name;
                 lastNotificationTime = now;
                 break;
              }
            }
         }
      );
    }
  } catch (e) {
    console.warn("Geofencing fallback failed:", e);
  }
}
