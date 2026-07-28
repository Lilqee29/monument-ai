import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { MapPin, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Session } from '@/types';
import { useLanguage } from '@/lib/languageContext';
import type { Coordinates } from '@/hooks/useMapViewport';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Landmark {
  id: string;
  name: string;
  city: string;
  country: string;
  coordinates: Coordinates;
}

interface VisitedMarkerProps {}

interface UnvisitedMarkerProps {}

interface VisitedCalloutProps {
  session: Session;
  onOpen: () => void;
}

interface UnvisitedCalloutProps {
  landmark: Landmark;
}

// ─── Visited Marker (pulsing gold dot) ────────────────────────────────────────

export function VisitedMarker() {
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

// ─── Unvisited Marker (subtle grey dot) ───────────────────────────────────────

export function UnvisitedMarker() {
  return (
    <View style={styles.unvisitedDot}>
      <View style={styles.unvisitedInner} />
    </View>
  );
}

// ─── Visited Callout Card ─────────────────────────────────────────────────────

export function VisitedCallout({ session, onOpen }: VisitedCalloutProps) {
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

// ─── Unvisited Callout Card ───────────────────────────────────────────────────

export function UnvisitedCallout({ landmark }: UnvisitedCalloutProps) {
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

// ─── Multiplayer Avatar Marker ────────────────────────────────────────────────

interface PlayerAvatarMarkerProps {
  pid: string;
  name: string;
  location: Coordinates;
}

export function PlayerAvatarMarker({ pid, name, location }: PlayerAvatarMarkerProps) {
  return (
    <Marker
      key={pid}
      coordinate={{ latitude: location.lat, longitude: location.lng }}
      title={name}
    >
      <View style={styles.playerAvatar}>
        <Text style={styles.playerEmoji}>🏃</Text>
      </View>
    </Marker>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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

  // Player avatar
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(201,168,76,0.3)',
    borderWidth: 2,
    borderColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerEmoji: {
    fontSize: 16,
  },
});
