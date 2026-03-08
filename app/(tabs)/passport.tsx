import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Dimensions,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Award, Globe, Flame, Star, Lock, MapPin, Zap } from 'lucide-react-native';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { Session } from '@/types';

const { width } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSupabaseToken(getToken: Function): Promise<string | null> {
  try { return await getToken({ template: 'supabase' }); }
  catch { return await getToken(); }
}

function getRarity(score: number): { label: string; color: string } {
  if (score >= 9) return { label: 'LEGENDARY', color: '#ff6b35' };
  if (score >= 7) return { label: 'EPIC',      color: '#9b59b6' };
  if (score >= 5) return { label: 'RARE',      color: '#3498db' };
  return             { label: 'COMMON',    color: '#9a9483' };
}

function countryFlag(country: string): string {
  // Simple fallback — country codes to flag emojis
  const map: Record<string, string> = {
    France: '🇫🇷', Italy: '🇮🇹', Spain: '🇪🇸', Greece: '🇬🇷',
    Japan: '🇯🇵', China: '🇨🇳', India: '🇮🇳', Egypt: '🇪🇬',
    Peru: '🇵🇪', Mexico: '🇲🇽', Cambodia: '🇰🇭', Turkey: '🇹🇷',
    UK: '🇬🇧', USA: '🇺🇸', Brazil: '🇧🇷', Mongolia: '🇲🇳',
    Germany: '🇩🇪', Portugal: '🇵🇹', Morocco: '🇲🇦', Jordan: '🇯🇴',
  };
  return map[country] ?? '🌍';
}

function getXPFromSessions(sessions: Session[]): number {
  return sessions.reduce((total, s) => {
    const score = s.details?.significance_score ?? 5;
    return total + score * 100;
  }, 0);
}

function getLevel(xp: number): { level: number; progress: number; nextXP: number } {
  const thresholds = [0, 500, 1200, 2500, 4500, 7500, 12000, 20000];
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
    else break;
  }
  const currentThresh = thresholds[Math.min(level - 1, thresholds.length - 1)];
  const nextThresh = thresholds[Math.min(level, thresholds.length - 1)];
  const progress = nextThresh > currentThresh
    ? (xp - currentThresh) / (nextThresh - currentThresh)
    : 1;
  return { level, progress: Math.min(progress, 1), nextXP: nextThresh };
}

const TITLES = ['Novice', 'Wanderer', 'Explorer', 'Historian', 'Scholar', 'Sage', 'Legend', 'Immortal'];

// ─── Stamp Component ──────────────────────────────────────────────────────────

function Stamp({ session, delay }: { session: Session; delay: number }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const score = session.details?.significance_score ?? 5;
  const { color } = getRarity(score);
  const angle = ((session.id?.charCodeAt(0) ?? 0) % 11) - 5; // deterministic tilt from id

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }).start();
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const flag = countryFlag(session.location_country ?? '');
  const name = session.monument_name ?? 'Unknown Monument';
  const city = session.location_city ?? '';
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    : '';

  return (
    <Animated.View style={[
      stampStyles.wrapper,
      { transform: [{ scale }, { rotate: `${angle}deg` }], opacity }
    ]}>
      <View style={[stampStyles.outer, { borderColor: color }]}>
        <View style={[stampStyles.inner, { borderColor: color + '55' }]}>
          <Text style={stampStyles.flag}>{flag}</Text>
          <Text style={[stampStyles.name, { color }]} numberOfLines={2}>{name}</Text>
          <Text style={[stampStyles.city, { color: color + 'aa' }]}>
            {city ? `${city}` : ''}
          </Text>
          <Text style={[stampStyles.date, { color: color + '77' }]}>{date}</Text>
        </View>
        {/* Ink bleed glow */}
        <View style={[stampStyles.glow, { backgroundColor: color + '12' }]} />
      </View>
    </Animated.View>
  );
}

function LockedStamp() {
  return (
    <View style={stampStyles.wrapper}>
      <View style={stampStyles.lockedOuter}>
        <View style={stampStyles.lockedInner}>
          <Lock size={18} color="#333" />
          <Text style={stampStyles.lockedText}>???</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Badge Component ──────────────────────────────────────────────────────────

const BADGES = [
  { icon: '🏛️', label: 'First Stamp',    req: (n: number) => n >= 1  },
  { icon: '🔥', label: '5 Monuments',    req: (n: number) => n >= 5  },
  { icon: '⭐', label: '10 Monuments',   req: (n: number) => n >= 10 },
  { icon: '🌍', label: 'Globe Trotter',  req: (_: number, c: number) => c >= 3 },
  { icon: '🗺️', label: 'World Citizen',  req: (_: number, c: number) => c >= 7 },
  { icon: '👑', label: 'Legend',         req: (n: number) => n >= 20 },
];

function Badge({ icon, label, earned }: { icon: string; label: string; earned: boolean }) {
  return (
    <View style={[badgeStyles.container, !earned && badgeStyles.locked]}>
      <Text style={[badgeStyles.icon, !earned && { opacity: 0.2 }]}>{icon}</Text>
      <Text style={[badgeStyles.label, !earned && badgeStyles.labelLocked]}>{label}</Text>
      {!earned && <Lock size={10} color="#444" style={badgeStyles.lockIcon} />}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PassportScreen() {
  const insets = useSafeAreaInsets();
  const { getToken, userId, isLoaded } = useAuth();
  const { user } = useUser();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const passportNum = userId
    ? 'MNT-' + userId.slice(-6).toUpperCase()
    : 'MNT-000000';

  const fetchSessions = async () => {
    if (!isLoaded || !userId) return;
    try {
      setLoading(true);
      const token = await getSupabaseToken(getToken);
      const client = token ? createClerkSupabaseClient(token) : supabase;
      const { data, error } = await client
        .from('sessions')
        .select('id, monument_name, location_city, location_country, created_at, details')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
     setSessions((data ?? []).map((item): Session => ({
        id: item.id,
        user_id: userId,
        monument_name: item.monument_name,
        location_city: item.location_city,
        location_country: item.location_country,
        created_at: item.created_at,

        // fields missing from the query
        coordinates: { lat: 0, lng: 0 },
        photo_url: '',
        history_text: '',
        qa_thread: [],

        details: item.details ?? {},
    }))
    );
    } catch (e) {
      console.error('[RELICA] Passport fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(React.useCallback(() => { fetchSessions(); }, [isLoaded, userId]));

  const xp = getXPFromSessions(sessions);
  const { level, progress, nextXP } = getLevel(xp);
  const title = TITLES[Math.min(level - 1, TITLES.length - 1)];
  const totalStamps = sessions.length;
  const uniqueCountries = new Set(sessions.map(s => s.location_country).filter(Boolean)).size;
  const displayName = user?.firstName ?? user?.username ?? 'Explorer';

  // Show 6 locked slots if < 6 stamps
  const lockedCount = Math.max(0, 6 - totalStamps);
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: progress,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  return (
    <ScrollView
      style={screen.scroll}
      contentContainerStyle={[screen.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Passport Cover ─────────────────────────────────────────────────── */}
      <View style={cover.container}>
        {/* Gold texture lines */}
        <View style={cover.lineTL} /><View style={cover.lineBR} />
        <View style={cover.cornerTL} /><View style={cover.cornerTR} />
        <View style={cover.cornerBL} /><View style={cover.cornerBR} />

        <Text style={cover.countryLabel}>RELICA EXPLORER</Text>
        <Text style={cover.passportTitle}>PASSPORT</Text>
        <View style={cover.emblem}><Globe size={36} color="#c9a84c" /></View>

        <View style={cover.divider} />

        <Text style={cover.holderLabel}>PASSPORT HOLDER</Text>
        <Text style={cover.holderName}>{displayName.toUpperCase()}</Text>
        <Text style={cover.passNum}>{passportNum}</Text>

        {/* Level pill */}
        <View style={cover.levelPill}>
          <Star size={12} color="#000" />
          <Text style={cover.levelPillText}>LEVEL {level} · {title.toUpperCase()}</Text>
        </View>
      </View>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <View style={stats.row}>
        <View style={stats.card}>
          <MapPin size={18} color="#c9a84c" />
          <Text style={stats.val}>{totalStamps}</Text>
          <Text style={stats.label}>Stamps</Text>
        </View>
        <View style={stats.card}>
          <Globe size={18} color="#c9a84c" />
          <Text style={stats.val}>{uniqueCountries}</Text>
          <Text style={stats.label}>Countries</Text>
        </View>
        <View style={stats.card}>
          <Zap size={18} color="#c9a84c" />
          <Text style={stats.val}>{xp.toLocaleString()}</Text>
          <Text style={stats.label}>XP</Text>
        </View>
      </View>

      {/* ── XP Progress Bar ────────────────────────────────────────────────── */}
      <View style={xpBar.container}>
        <View style={xpBar.header}>
          <Text style={xpBar.label}>Level {level}</Text>
          <Text style={xpBar.next}>{xp.toLocaleString()} / {nextXP.toLocaleString()} XP</Text>
        </View>
        <View style={xpBar.track}>
          <Animated.View style={[xpBar.fill, {
            width: progressWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
          }]} />
        </View>
      </View>

      {/* ── Stamps Section ─────────────────────────────────────────────────── */}
      <Text style={section.title}>Stamps Collected</Text>
      <View style={section.subRow}>
        <Text style={section.sub}>{totalStamps} monument{totalStamps !== 1 ? 's' : ''} identified</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#c9a84c" style={{ marginVertical: 40 }} />
      ) : (
        <View style={stampsGrid.grid}>
          {sessions.map((s, i) => (
            <Stamp key={s.id} session={s} delay={i * 80} />
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <LockedStamp key={`locked-${i}`} />
          ))}
        </View>
      )}

      {totalStamps === 0 && !loading && (
        <View style={empty.container}>
          <Text style={empty.emoji}>📸</Text>
          <Text style={empty.text}>Snap your first monument to earn a stamp!</Text>
        </View>
      )}

      {/* ── Badges ─────────────────────────────────────────────────────────── */}
      <Text style={[section.title, { marginTop: 32 }]}>Achievements</Text>
      <View style={badgeGrid.grid}>
        {BADGES.map((b, i) => (
          <Badge
            key={i}
            icon={b.icon}
            label={b.label}
            earned={b.req(totalStamps, uniqueCountries)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const screen = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0e0e0e' },
  content: { paddingHorizontal: 20 },
});

const cover = StyleSheet.create({
  container: {
    backgroundColor: '#141008',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1.5,
    borderColor: '#c9a84c55',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  lineTL: { position: 'absolute', top: 12, left: 12, right: 12, height: 1, backgroundColor: '#c9a84c22' },
  lineBR: { position: 'absolute', bottom: 12, left: 12, right: 12, height: 1, backgroundColor: '#c9a84c22' },
  cornerTL: { position: 'absolute', top: 12, left: 12, width: 20, height: 20, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: '#c9a84c66', borderTopLeftRadius: 4 },
  cornerTR: { position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: '#c9a84c66', borderTopRightRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 12, left: 12, width: 20, height: 20, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: '#c9a84c66', borderBottomLeftRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 12, right: 12, width: 20, height: 20, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: '#c9a84c66', borderBottomRightRadius: 4 },
  countryLabel: { color: '#c9a84c99', fontSize: 9, fontWeight: '900', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 4 },
  passportTitle: { color: '#c9a84c', fontSize: 28, fontFamily: 'Georgia', letterSpacing: 6, marginBottom: 16 },
  emblem: { width: 70, height: 70, borderRadius: 35, borderWidth: 1.5, borderColor: '#c9a84c44', backgroundColor: '#c9a84c11', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  divider: { width: '80%', height: 1, backgroundColor: '#c9a84c33', marginBottom: 16 },
  holderLabel: { color: '#9a9483', fontSize: 8, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  holderName: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', letterSpacing: 2, marginBottom: 4 },
  passNum: { color: '#c9a84c77', fontSize: 10, fontFamily: 'Courier New', letterSpacing: 2, marginBottom: 16 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#c9a84c', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  levelPillText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
});

const stats = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  card: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#2a2a2a' },
  val: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia' },
  label: { color: '#9a9483', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
});

const xpBar = StyleSheet.create({
  container: { backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, marginBottom: 28, borderWidth: 1, borderColor: '#2a2a2a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { color: '#f0ece0', fontSize: 13, fontWeight: '800' },
  next: { color: '#9a9483', fontSize: 11, fontWeight: '600' },
  track: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#c9a84c', borderRadius: 3 },
});

const section = StyleSheet.create({
  title: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', marginBottom: 6 },
  subRow: { flexDirection: 'row', marginBottom: 16 },
  sub: { color: '#9a9483', fontSize: 12, fontWeight: '600' },
});

const stampsGrid = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

const stampStyles = StyleSheet.create({
  wrapper: { width: (width - 40 - 10) / 2 },
  outer: {
    borderWidth: 2, borderRadius: 16, padding: 12,
    backgroundColor: '#0e0e0e', position: 'relative', overflow: 'hidden',
  },
  inner: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 10,
    alignItems: 'center', gap: 4,
  },
  flag: { fontSize: 24 },
  name: { fontSize: 9, fontFamily: 'Courier New', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', lineHeight: 13 },
  city: { fontSize: 8, fontFamily: 'Courier New', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
  date: { fontSize: 7, fontFamily: 'Courier New', marginTop: 2 },
  glow: { position: 'absolute', inset: 0, borderRadius: 14 } as any,
  lockedOuter: { borderWidth: 2, borderRadius: 16, padding: 12, borderColor: '#222', borderStyle: 'dashed' },
  lockedInner: { borderRadius: 10, padding: 14, alignItems: 'center', gap: 6, backgroundColor: '#111' },
  lockedText: { color: '#333', fontSize: 10, fontFamily: 'Courier New', fontWeight: '900', letterSpacing: 3 },
});

const badgeGrid = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

const badgeStyles = StyleSheet.create({
  container: {
    width: (width - 40 - 20) / 3,
    backgroundColor: '#1a1a1a', borderRadius: 16,
    padding: 14, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
  },
  locked: { borderColor: '#222', opacity: 0.6 },
  icon: { fontSize: 26 },
  label: { color: '#f0ece0', fontSize: 9, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  labelLocked: { color: '#444' },
  lockIcon: { position: 'absolute', top: 8, right: 8 } as any,
});

const empty = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 40 },
  emoji: { fontSize: 48, marginBottom: 12 },
  text: { color: '#9a9483', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});