import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import MapView, { Marker, Callout, Circle, Polyline } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Navigation, Compass, MapPin, Eye, Lock, Swords, X, CheckCircle, Menu, ChevronRight } from 'lucide-react-native';
import AnimatedReanimated, { FadeInDown } from 'react-native-reanimated';
import { Session } from '@/types';
import { generateQuest, DynamicQuest } from '@/lib/ai';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WORLD_LANDMARKS } from '@/constants/landmarks';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuest } from '@/lib/questContext';
import { useLanguage } from '@/lib/languageContext';
import { useColorScheme } from 'nativewind';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coordinates {
  lat: number;
  lng: number;
}

interface Landmark {
  id: string;
  name: string;
  city: string;
  country: string;
  coordinates: Coordinates;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lng points */
function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Build a convex-hull-like bounding path for the "explored region" overlay */
function buildExploredPath(sessions: Session[]): Coordinates[] {
  const points = sessions
    .filter((s) => s.coordinates)
    .map((s) => s.coordinates as Coordinates);
  if (points.length < 2) return points;
  // Simple bounding polygon — expand each point by ~300 km radius approximation
  return points;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VisitedMarker() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.visitedMarkerWrapper}>
      <Animated.View style={[styles.visitedPulse, { transform: [{ scale: pulse }] }]} />
      <View style={styles.visitedDot}>
        <MapPin size={10} color="#0e0e0e" />
      </View>
    </View>
  );
}

function UnvisitedMarker() {
  return (
    <View style={styles.unvisitedDot}>
      <View style={styles.unvisitedInner} />
    </View>
  );
}

interface CalloutCardProps {
  session: Session;
  onOpen: () => void;
}

function VisitedCallout({ session, onOpen }: CalloutCardProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.calloutCard}>
      <View style={styles.calloutImageWrapper}>
        <Image
          source={{ uri: session.photo_url }}
          style={styles.calloutImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.calloutCountryPill}>
          <Text style={styles.calloutCountryText}>{session.location_country}</Text>
        </View>
      </View>
      <View style={styles.calloutInfo}>
        <Text style={styles.calloutName}>{session.monument_name}</Text>
        <Text style={styles.calloutCity}>
          {session.location_city} · {new Date(session.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
        </Text>
      </View>
      <TouchableOpacity onPress={onOpen} style={styles.calloutBtn}>
        <Text style={styles.calloutBtnText}>{t('openEntry')}</Text>
      </TouchableOpacity>
    </View>
  );
}

interface UnvisitedCalloutProps {
  landmark: Landmark;
}

function UnvisitedCallout({ landmark }: UnvisitedCalloutProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.unvisitedCallout}>
      <Lock size={12} color="#9a9483" />
      <Text style={styles.unvisitedCalloutLabel}>{t('untracedSite')}</Text>
      <Text style={styles.unvisitedCalloutName}>{landmark.name}</Text>
      <Text style={styles.unvisitedCalloutCity}>{landmark.city}, {landmark.country}</Text>
    </View>
  );
}

// ─── Stats HUD ────────────────────────────────────────────────────────────────

interface StatsHUDProps {
  discovered: number;
  total: number;
  countries: number;
  coverageKm: number;
}

function StatsHUD({ discovered, total, countries, coverageKm }: StatsHUDProps) {
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  const { t } = useLanguage();

  return (
    <BlurView intensity={70} tint="dark" style={styles.statsHUD}>
      {/* Progress bar */}
      <View style={styles.progressBarTrack}>
        <Animated.View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{discovered}</Text>
          <Text style={styles.statLabel}>{t('discovered')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{total - discovered}</Text>
          <Text style={styles.statLabel}>{t('remaining')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{countries}</Text>
          <Text style={styles.statLabel}>{t('nations')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#c9a84c' }]}>{pct}%</Text>
          <Text style={styles.statLabel}>{t('coverage')}</Text>
        </View>
      </View>
    </BlurView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MapScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [showExplored, setShowExplored] = useState<boolean>(true);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [mapError, setMapError] = useState<string | null>(null);
  const [region, setRegion] = useState({
    latitude: 20,
    longitude: 10,
    latitudeDelta: 110,
    longitudeDelta: 110,
  });

  // Gamification State
  const { activeQuest, setActiveQuest, questTimeLeft, setQuestTimeLeft, players, broadcastLocation } = useQuest();
  const [questLoading, setQuestLoading] = useState(false);
  const [showPlayback, setShowPlayback] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const { t, language } = useLanguage();
  const { colorScheme } = useColorScheme();

  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (isLoaded && userId) {
      fetchSessions();
      requestLocation(true);
    }
  }, [userId, isLoaded]);

  const fetchSessions = async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId);
      if (data && !error) setSessions(data);
    } catch (e) {
      console.error(e);
    }
  };

  const requestLocation = async (isInitial = false): Promise<void> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords: Coordinates = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(coords);
      broadcastLocation(coords.lat, coords.lng);
      if (isInitial) {
        mapRef.current?.animateToRegion(
          { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 5, longitudeDelta: 5 },
          1000
        );
      }
    } catch (e) {
      console.warn('Location error:', e);
    }
  };

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    const startTrack = async () => {
      try {
        if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
          (loc) => {
            const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setUserLocation(coords);
            broadcastLocation(coords.lat, coords.lng);
          }
        );
      } catch (e) {}
    };
    if (userId) startTrack();
    return () => {
      sub?.remove();
    };
  }, [userId]);

  const zoomToWorld = (): void => {
    mapRef.current?.animateToRegion(
      { latitude: 20, longitude: 10, latitudeDelta: 110, longitudeDelta: 110 },
      800
    );
  };

  const startQuest = async () => {
    try {
      setQuestLoading(true);
      
      // Determine user city context if possible (from sessions or fallback)
      let city = 'your area';
      let country = 'the world';
      if (sessions.length > 0) {
        const lastSession = sessions[sessions.length - 1];
        if (lastSession.location_city) city = lastSession.location_city;
        if (lastSession.location_country) country = lastSession.location_country;
      }

      const quest = await generateQuest(userLocation?.lat || null, userLocation?.lng || null, city, country, language);
      setActiveQuest(quest);
      setQuestTimeLeft(quest.duration_minutes * 60); // in seconds
    } catch (e) {
      console.warn(e);
    } finally {
      setQuestLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (activeQuest) {
      if (activeQuest.tasks.every(t => t.completed)) {
        setActiveQuest(null);
        setShowPlayback(true);
      } else if (questTimeLeft > 0) {
        timer = setInterval(() => setQuestTimeLeft(prev => prev - 1), 1000);
      } else if (questTimeLeft <= 0) {
        setActiveQuest(null);
      }
    }
    return () => clearInterval(timer);
  }, [activeQuest, questTimeLeft]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Ensure coordinates strictly have numbers to prevent Native Map crashes
  const visitedCoords: Coordinates[] = sessions
    .filter((s) => s.coordinates && !isNaN((s.coordinates as any).lat) && !isNaN((s.coordinates as any).lng))
    .map((s) => s.coordinates as Coordinates);

  const unvisitedLandmarks: Landmark[] = WORLD_LANDMARKS.filter(
    (lm: Landmark) =>
      !sessions.some((s) =>
        s.monument_name?.toLowerCase().includes(lm.name.toLowerCase())
      ) && !isNaN(lm.coordinates.lat) && !isNaN(lm.coordinates.lng)
  );

  const countriesVisited = new Set(sessions.map((s) => s.location_country).filter(Boolean)).size;

  // Approximate total area covered: sum of circles (radius 250km per site)
  const coverageKm = visitedCoords.length * 250;

  // Build path lines connecting visited sites in chronological order
  const explorationPath = visitedCoords.map((c) => ({
    latitude: Number(c.lat),
    longitude: Number(c.lng),
  }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        showsUserLocation
        showsPointsOfInterest={false}
        showsBuildings={false}
        mapType={mapType === 'satellite' ? 'satellite' : 'standard'}
        onError={(e) => {
          console.error('[RELICA] MapView error:', e.nativeEvent);
          setMapError(e.nativeEvent?.message || 'Map failed to load');
        }}
      >
        {/* ── Explored area circles (coverage blobs) ── */}
        {showExplored &&
          visitedCoords.map((coord, i) => (
            <Circle
              key={`circle-${i}`}
              center={{ latitude: Number(coord.lat), longitude: Number(coord.lng) }}
              radius={280000} // 280 km radius fog-of-war reveal
              fillColor="rgba(201,168,76,0.08)"
              strokeColor="rgba(201,168,76,0.2)"
              strokeWidth={1}
            />
          ))}

        {/* ── Exploration path line ── */}
        {showExplored && explorationPath.length > 1 && (
          <Polyline
            coordinates={explorationPath}
            strokeColor="#FF2600D0"
            strokeWidth={1.5}
            lineDashPattern={[6, 10]}
          />
        )}

        {/* ── Visited markers ── */}
        {sessions.map((session) =>
          session.coordinates ? (
            <Marker
              key={session.id}
              coordinate={{
                latitude: (session.coordinates as Coordinates).lat,
                longitude: (session.coordinates as Coordinates).lng,
              }}
              tracksViewChanges={false}
            >
              <VisitedMarker />
              <Callout tooltip onPress={() => router.push(`/session/${session.id}`)}>
                <VisitedCallout
                  session={session}
                  onOpen={() => router.push(`/session/${session.id}`)}
                />
              </Callout>
            </Marker>
          ) : null
        )}

        {/* ── Unvisited landmark markers ── */}
        {unvisitedLandmarks.map((landmark: Landmark) => (
          <Marker
            key={landmark.id}
            coordinate={{
              latitude: landmark.coordinates.lat,
              longitude: landmark.coordinates.lng,
            }}
            tracksViewChanges={false}
          >
            <UnvisitedMarker />
            <Callout tooltip>
              <UnvisitedCallout landmark={landmark} />
            </Callout>
          </Marker>
        ))}

        {/* ── Multiplayer Avatars ── */}
        {Object.entries(players).map(([pid, player]) => {
          if (pid === userId || !player.location) return null;
          return (
            <Marker
              key={pid}
              coordinate={{ latitude: player.location.lat, longitude: player.location.lng }}
              title={player.name}
            >
              <View style={{
                width: 32, height: 32, borderRadius: 16, 
                backgroundColor: 'rgba(201,168,76,0.3)', 
                borderWidth: 2, borderColor: '#c9a84c',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <Text style={{ fontSize: 16 }}>🏃</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* ── Map Error Fallback ── */}
      {mapError && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0e0e0e', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 40 }]}>
          <Text style={{ color: '#ff4444', fontSize: 40, marginBottom: 16 }}>🗺️</Text>
          <Text style={{ color: '#f0ece0', fontSize: 18, fontFamily: 'Georgia', textAlign: 'center', marginBottom: 8 }}>Map unavailable</Text>
          <Text style={{ color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{mapError}</Text>
          <TouchableOpacity 
            onPress={() => setMapError(null)} 
            style={{ marginTop: 24, backgroundColor: '#c9a84c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 }}
          >
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Top HUD / Quest Dashboard ── */}
      <View style={[styles.topHUD, { top: insets.top + 12 }]}>
        {!activeQuest && !showPlayback ? (
          <BlurView intensity={75} tint="dark" style={styles.topHUDInner}>
            <View>
              <Text style={styles.topHUDTitle}>{t('explorationMap')}</Text>
              <Text style={styles.topHUDSub}>
                {t('sitesCharted', { count: sessions.length.toString(), countries: countriesVisited.toString(), countryLabel: countriesVisited === 1 ? t('country') : t('countries') })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowExplored((v) => !v)}
              style={[styles.toggleBtn, showExplored && styles.toggleBtnActive]}
            >
              <Eye size={14} color={showExplored ? '#0e0e0e' : '#c9a84c'} />
              <Text style={[styles.toggleBtnText, showExplored && styles.toggleBtnTextActive]}>
                {showExplored ? t('coverageOn') : t('coverageOff')}
              </Text>
            </TouchableOpacity>
          </BlurView>
        ) : activeQuest ? (
          <BlurView intensity={90} tint="dark" style={[styles.topHUDInner, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={[styles.topHUDTitle, { color: '#c9a84c' }]}>{activeQuest.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.questTimeText}>
                    {formatTime(questTimeLeft)} {t('remaining')}
                  </Text>
                  <View style={{ backgroundColor: '#c9a84c20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#c9a84c40' }}>
                    <Text style={{ color: '#c9a84c', fontSize: 9, fontWeight: '800' }}>+{activeQuest.total_xp} XP</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setActiveQuest(null)} style={styles.cancelQuestBtn}>
                <X size={16} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={{ gap: 8 }}>
              {activeQuest.tasks.map((task) => (
                <QuestTaskRow key={task.id} task={task} />
              ))}
            </View>
          </BlurView>
        ) : null}
      </View>

      {/* ── Animated Expedition Playback Overlay ── */}
      {showPlayback && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', padding: 20, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 64, marginBottom: 20 }}>🏆</Text>
          <Text style={{ color: '#c9a84c', fontSize: 32, fontFamily: 'serif', fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
            {t('expeditionComplete')}
          </Text>
          <Text style={{ color: '#f0ece0', fontSize: 16, marginBottom: 30, textAlign: 'center', lineHeight: 24, paddingHorizontal: 20 }}>
            {t('expeditionCompleteDesc')}
          </Text>
          <TouchableOpacity 
            onPress={() => setShowPlayback(false)} 
            style={{ backgroundColor: '#c9a84c', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30 }}
          >
            <Text style={{ color: '#0e0e0e', fontWeight: 'bold', fontSize: 18 }}>{t('closePlayback')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Stats HUD (bottom) ── */}
      <View style={[styles.statsWrapper, { bottom: insets.bottom + 100 }]}>
        <StatsHUD
          discovered={sessions.length}
          total={sessions.length + unvisitedLandmarks.length}
          countries={countriesVisited}
          coverageKm={coverageKm}
        />
      </View>

      {/* ── Map Controls & Action Buttons ── */}
      <View style={[styles.controls, { bottom: insets.bottom + 210 }]}>
        {showControls && (
          <View style={{ gap: 10, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => requestLocation()} style={styles.controlBtn}>
              <Navigation size={20} color="#c9a84c" />
            </TouchableOpacity>
            <TouchableOpacity onPress={zoomToWorld} style={[styles.controlBtn, styles.controlBtnGold]}>
              <Compass size={22} color="#0e0e0e" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')} 
              style={styles.controlBtn}
            >
              <Text style={{ fontSize: 18 }}>🗺️</Text>
            </TouchableOpacity>
            {!activeQuest && (
              <TouchableOpacity 
                onPress={() => router.push('/(tabs)/quest')} 
                style={[styles.controlBtn, styles.questBtn]}
              >
                <Swords size={20} color="#0e0e0e" />
              </TouchableOpacity>
            )}
          </View>
        )}
        <TouchableOpacity 
          onPress={() => setShowControls(!showControls)} 
          style={[styles.controlBtn, { backgroundColor: showControls ? '#c9a84c' : '#1a1a1a', borderColor: showControls ? '#c9a84c' : 'rgba(255,255,255,0.1)' }]}
        >
          <Menu size={22} color={showControls ? "#0e0e0e" : "#f0ece0"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070707',
  },

  // Markers
  visitedMarkerWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitedPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(201,168,76,0.25)',
  },
  visitedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0e0e0e',
  },
  unvisitedDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unvisitedInner: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  // Callouts
  calloutCard: {
    width: 240,
    backgroundColor: '#121212',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  calloutImageWrapper: {
    height: 120,
    width: '100%',
    position: 'relative',
  },
  calloutImage: {
    width: '100%',
    height: '100%',
  },
  calloutCountryPill: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    backgroundColor: 'rgba(201,168,76,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  calloutCountryText: {
    color: '#0e0e0e',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  calloutInfo: {
    padding: 12,
    paddingBottom: 4,
  },
  calloutName: {
    color: '#f0ece0',
    fontSize: 15,
    fontFamily: 'Georgia',
    marginBottom: 3,
  },
  calloutCity: {
    color: '#9a9483',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  calloutBtn: {
    margin: 12,
    marginTop: 10,
    backgroundColor: '#c9a84c',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calloutBtnText: {
    color: '#0e0e0e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  unvisitedCallout: {
    width: 180,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  unvisitedCalloutLabel: {
    color: '#9a9483',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  unvisitedCalloutName: {
    color: 'rgba(240,236,224,0.5)',
    fontSize: 14,
    fontFamily: 'Georgia',
    textAlign: 'center',
  },
  unvisitedCalloutCity: {
    color: '#9a948366',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Top HUD
  topHUD: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topHUDInner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHUDTitle: {
    color: '#f0ece0',
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  topHUDSub: {
    color: '#c9a84c',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c9a84c66',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
  },
  toggleBtnText: {
    color: '#c9a84c',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  toggleBtnTextActive: {
    color: '#0e0e0e',
  },
  questTimeText: {
    color: '#f0ece0',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
    fontVariant: ['tabular-nums']
  },
  cancelQuestBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  taskCheckboxActive: {
    backgroundColor: '#c9a84c',
  },
  taskText: {
    flex: 1,
    color: '#f0ece0',
    fontSize: 12,
    lineHeight: 18,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },

 // Stats HUD
  statsWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statsHUD: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#c9a84c',
    borderRadius: 2,
    shadowColor: '#c9a84c',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#f0ece0',
    fontSize: 18,
    fontFamily: 'Georgia',
    lineHeight: 20,
  },
  statLabel: {
    color: '#9a9483',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Controls
  controls: {
    position: 'absolute',
    right: 16,
    gap: 10,
    alignItems: 'center',
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  controlBtnGold: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
    shadowColor: '#c9a84c',
    shadowOpacity: 0.4,
  },
  questBtn: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOpacity: 0.6,
    shadowRadius: 15,
  },
});

// ─── Dark map style (disabled — Apple Maps ignores customMapStyle) ────────────
// Kept as reference for future Google Maps integration
const darkMapStyle: any[] = [];

function QuestTaskRow({ task }: { task: any }) {
  const [showHint, setShowHint] = useState(false);
  
  return (
    <View>
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => setShowHint(!showHint)}
        style={styles.questTaskRow}
      >
        <View style={[styles.taskCheckbox, task.completed && styles.taskCheckboxActive]}>
          {task.completed && <CheckCircle size={12} color="#000" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
            <Text style={{fontWeight: 'bold', color: '#c9a84c'}}>[{task.type.toUpperCase()}] </Text>
            {task.description}
          </Text>
        </View>
        <ChevronRight size={14} color="#666" style={{ transform: [{ rotate: showHint ? '90deg' : '0deg' }] }} />
      </TouchableOpacity>
      
      {showHint && !task.completed && (
        <AnimatedReanimated.View entering={FadeInDown} style={{ paddingLeft: 24, paddingTop: 4, paddingBottom: 8 }}>
          <Text style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic', marginBottom: 2 }}>
            🔍 {task.hint}
          </Text>
          <Text style={{ color: '#888', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📍 {task.location_hint}
          </Text>
        </AnimatedReanimated.View>
      )}
    </View>
  );
}