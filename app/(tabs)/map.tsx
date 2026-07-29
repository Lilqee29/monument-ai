import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar,Platform, type NativeSyntheticEvent } from 'react-native';
import MapView, { Marker, Callout, Circle, Polyline } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WORLD_LANDMARKS } from '@/constants/landmarks';
import { useQuest } from '@/lib/questContext';
import { useLanguage } from '@/lib/languageContext';
import { useColorScheme } from 'nativewind';
import * as Location from 'expo-location';
import { generateQuest } from '@/lib/ai';
import { Session } from '@/types';
import { useMapViewport, Coordinates } from '@/hooks/useMapViewport';
import {
  VisitedMarker,
  UnvisitedMarker,
  VisitedCallout,
  UnvisitedCallout,
  PlayerAvatarMarker,
  Landmark,
} from '@/components/map/MapMarkers';
import {
  TopHUD,
  QuestHUD,
  StatsHUD,
  MapControls,
} from '@/components/map/MapOverlay';
import { ExpeditionPlayback } from '@/components/map/ExpeditionPlayback';
import { useDemoMode } from '@/lib/demoMode';
import { DEMO_MAP_MARKERS } from '@/lib/demoData';

// ─── Map Error Boundary ────────────────────────────────────────────────────────
class MapErrorBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: any) {
    console.warn('[MapScreen] Native MapView failed, rendering fallback:', err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Dark map style ────────────────────────────────────────────────────────────
const darkMapStyle: any[] = [];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MapScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [showExplored, setShowExplored] = useState<boolean>(true);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [mapError, setMapError] = useState<string | null>(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [questLoading, setQuestLoading] = useState(false);

  const { activeQuest, setActiveQuest, questTimeLeft, setQuestTimeLeft, players, broadcastLocation } = useQuest();
  const { t, language } = useLanguage();
  const { userId, isLoaded } = useAuth();
  const { isDemoMode, sessions: demoSessions } = useDemoMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const { region, visibleRegion, isWithinViewport, handleRegionChange } = useMapViewport();

  // ── Data fetching ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isDemoMode) {
      setSessions(demoSessions);
      // Set a default location (Paris) for demo
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
      return;
    }
    if (isLoaded && userId) {
      fetchSessions();
      requestLocation(true);
    }
  }, [userId, isLoaded, isDemoMode]);

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
    return () => { sub?.remove(); };
  }, [userId]);

  // ── Quest logic ──────────────────────────────────────────────────────────

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

  // ── Derived data (viewport filtered) ─────────────────────────────────────

  const visitedCoords: Coordinates[] = sessions
    .filter((s) => s.coordinates && !isNaN((s.coordinates as any).lat) && !isNaN((s.coordinates as any).lng))
    .map((s) => s.coordinates as Coordinates);

  const unvisitedLandmarks: Landmark[] = WORLD_LANDMARKS.filter(
    (lm: Landmark) =>
      !sessions.some((s) => s.monument_name?.toLowerCase().includes(lm.name.toLowerCase()))
      && !isNaN(lm.coordinates.lat) && !isNaN(lm.coordinates.lng)
  );

  const countriesVisited = new Set(sessions.map((s) => s.location_country).filter(Boolean)).size;
  const coverageKm = visitedCoords.length * 250;

  const explorationPath = visitedCoords.map((c) => ({
    latitude: Number(c.lat),
    longitude: Number(c.lng),
  }));

  const viewportSessions = sessions.filter(
    (s) => s.coordinates && isWithinViewport(s.coordinates as Coordinates)
  );
  const viewportUnvisitedLandmarks = unvisitedLandmarks.filter((lm) => isWithinViewport(lm.coordinates));
  const viewportExplorationPath = explorationPath.filter((c) =>
    isWithinViewport({ lat: c.latitude, lng: c.longitude })
  );

  // ── Map actions ──────────────────────────────────────────────────────────

  const zoomToWorld = (): void => {
    mapRef.current?.animateToRegion(
      { latitude: 20, longitude: 10, latitudeDelta: 110, longitudeDelta: 110 },
      800
    );
  };

  const startQuest = async () => {
    try {
      setQuestLoading(true);
      let city = 'your area';
      let country = 'the world';
      if (sessions.length > 0) {
        const lastSession = sessions[sessions.length - 1];
        if (lastSession.location_city) city = lastSession.location_city;
        if (lastSession.location_country) country = lastSession.location_country;
      }
      const quest = await generateQuest(userLocation?.lat || null, userLocation?.lng || null, city, country, language);
      setActiveQuest(quest);
      setQuestTimeLeft(quest.duration_minutes * 60);
    } catch (e) {
      console.warn(e);
    } finally {
      setQuestLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const topHudTop = insets.top + 12;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <MapErrorBoundary fallback={
        <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', letterSpacing: 2 }}>WORLD EXPLORER MAP</Text>
          <Text style={{ color: '#8e8e93', fontSize: 13, marginTop: 8, textAlign: 'center' }}>Map view requires active location services.</Text>
        </View>
      }>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          showsUserLocation={Platform.OS !== 'ios'}
          showsBuildings={false}
        mapType={mapType === 'satellite' ? 'satellite' : 'standard'}
        onRegionChangeComplete={handleRegionChange}
        // @ts-ignore — react-native-maps onError works at runtime but type availability varies by platform/version
        onError={(e: NativeSyntheticEvent<{ message?: string }>) => {
          console.error('[RELICA] MapView error:', e.nativeEvent);
          setMapError(e.nativeEvent?.message || 'Map failed to load');
        }}
      >
        {showExplored && viewportSessions.filter((s) => s.coordinates).map((session, i) => {
          const coord = session.coordinates as Coordinates;
          return (
            <Circle
              key={`circle-${session.id ?? i}`}
              center={{ latitude: Number(coord.lat), longitude: Number(coord.lng) }}
              radius={280000}
              fillColor="rgba(201,168,76,0.08)"
              strokeColor="rgba(201,168,76,0.2)"
              strokeWidth={1}
            />
          );
        })}

        {showExplored && viewportExplorationPath.length > 1 && (
          <Polyline coordinates={viewportExplorationPath} strokeColor="#FF2600D0" strokeWidth={1.5} lineDashPattern={[6, 10]} />
        )}

        {viewportSessions.map((session) =>
          session.coordinates ? (
            <Marker
              key={session.id}
              coordinate={{ latitude: (session.coordinates as Coordinates).lat, longitude: (session.coordinates as Coordinates).lng }}
              tracksViewChanges={false}
            >
              <VisitedMarker />
              <Callout tooltip onPress={() => router.push(`/session/${session.id}`)}>
                <VisitedCallout session={session} onOpen={() => router.push(`/session/${session.id}`)} />
              </Callout>
            </Marker>
          ) : null
        )}

        {viewportUnvisitedLandmarks.map((landmark: Landmark) => (
          <Marker key={landmark.id} coordinate={{ latitude: landmark.coordinates.lat, longitude: landmark.coordinates.lng }} tracksViewChanges={false}>
            <UnvisitedMarker />
            <Callout tooltip><UnvisitedCallout landmark={landmark} /></Callout>
          </Marker>
        ))}

        {Object.entries(players).map(([pid, player]) => {
          if (pid === userId || !player.location) return null;
          return <PlayerAvatarMarker key={pid} pid={pid} name={player.name} location={player.location} />;
        })}
      </MapView>
      </MapErrorBoundary>

      {mapError && (
        <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
          <Text style={{ color: '#ff4444', fontSize: 40, marginBottom: 16 }}>🗺️</Text>
          <Text style={{ color: '#f0ece0', fontSize: 18, fontFamily: 'Georgia', textAlign: 'center', marginBottom: 8 }}>Map unavailable</Text>
          <Text style={{ color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{mapError}</Text>
          <TouchableOpacity onPress={() => setMapError(null)} style={styles.dismissBtn}>
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top HUD */}
      <View style={[styles.topHUD, { top: topHudTop }]}>
        {!activeQuest && !showPlayback && (
          <TopHUD
            sessionsCount={sessions.length}
            countriesVisited={countriesVisited}
            showExplored={showExplored}
            onToggleExplored={() => setShowExplored((v) => !v)}
            activeQuest={null}
            questTimeLeft={0}
            showPlayback={false}
          />
        )}
        {activeQuest && !showPlayback && (
          <QuestHUD activeQuest={activeQuest} questTimeLeft={questTimeLeft} />
        )}
      </View>

      {showPlayback && <ExpeditionPlayback onClose={() => setShowPlayback(false)} />}

      <View style={[styles.statsWrapper, { bottom: insets.bottom + 100 }]}>
        <StatsHUD discovered={sessions.length} total={sessions.length + unvisitedLandmarks.length} countries={countriesVisited} />
      </View>

      <MapControls
        showControls={showControls}
        onToggleControls={() => setShowControls(!showControls)}
        onCenterPress={zoomToWorld}
        onLocatePress={() => requestLocation()}
        mapType={mapType}
        onToggleMapType={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
        hasActiveQuest={!!activeQuest}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070707' },
  topHUD: { position: 'absolute', left: 16, right: 16, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statsWrapper: { position: 'absolute', left: 16, right: 16, bottom: 60, borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  errorOverlay: { backgroundColor: '#0e0e0e', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 40 },
  dismissBtn: { marginTop: 24, backgroundColor: '#c9a84c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },
});
