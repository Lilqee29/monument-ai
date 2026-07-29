import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { ChevronLeft, Globe, MapPin } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface Region {
  id: string;
  name: string;
  emoji: string;
  color: string;
  countries: string[];
}

const REGIONS: Region[] = [
  {
    id: 'europe',
    name: 'Europe',
    emoji: '🏰',
    color: '#4a9eff',
    countries: [
      'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'United Kingdom', 'Netherlands',
      'Belgium', 'Switzerland', 'Austria', 'Greece', 'Poland', 'Czech Republic', 'Hungary',
      'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Scotland', 'Romania', 'Bulgaria',
      'Croatia', 'Serbia', 'Slovakia', 'Slovenia', 'Latvia', 'Lithuania', 'Estonia',
      'Luxembourg', 'Malta', 'Cyprus', 'Albania', 'Montenegro', 'North Macedonia', 'Bosnia',
    ],
  },
  {
    id: 'middle_east_africa',
    name: 'Middle East & Africa',
    emoji: '🌍',
    color: '#ff9f43',
    countries: [
      'Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Libya', 'Sudan', 'Ethiopia', 'Kenya',
      'Tanzania', 'South Africa', 'Nigeria', 'Ghana', 'Senegal', 'Ivory Coast', 'Cameroon',
      'Zimbabwe', 'Mozambique', 'Uganda', 'Rwanda', 'Jordan', 'Lebanon', 'Israel',
      'Palestine', 'Saudi Arabia', 'UAE', 'Oman', 'Qatar', 'Kuwait', 'Bahrain', 'Iraq',
      'Iran', 'Syria', 'Yemen', 'Turkey', 'Armenia', 'Georgia', 'Azerbaijan',
    ],
  },
  {
    id: 'asia',
    name: 'Asia & Pacific',
    emoji: '🏯',
    color: '#ee5a24',
    countries: [
      'Japan', 'China', 'India', 'Thailand', 'Vietnam', 'Cambodia', 'Indonesia', 'Malaysia',
      'Singapore', 'Philippines', 'South Korea', 'Taiwan', 'Nepal', 'Sri Lanka', 'Myanmar',
      'Bangladesh', 'Pakistan', 'Afghanistan', 'Uzbekistan', 'Kazakhstan', 'Mongolia',
      'Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Laos',
    ],
  },
  {
    id: 'americas',
    name: 'The Americas',
    emoji: '🗽',
    color: '#00d2d3',
    countries: [
      'United States', 'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Peru', 'Colombia',
      'Chile', 'Venezuela', 'Bolivia', 'Ecuador', 'Uruguay', 'Paraguay', 'Cuba', 'Jamaica',
      'Guatemala', 'Costa Rica', 'Panama', 'Dominican Republic', 'Haiti', 'Honduras',
      'El Salvador', 'Nicaragua', 'Trinidad and Tobago', 'Barbados',
    ],
  },
];

function getRegionForCountry(country: string): Region | null {
  const normalized = country.trim();
  return REGIONS.find(r => r.countries.some(c => c.toLowerCase() === normalized.toLowerCase())) ?? null;
}

interface RegionStat {
  region: Region;
  visited: number;
  total: number;
  countries: { name: string; count: number }[];
}

function CountryBadge({ country, count, color }: { country: string; count: number; color: string }) {
  return (
    <View style={[badgeStyles.badge, { borderColor: color + '40', backgroundColor: color + '12' }]}>
      <MapPin size={9} color={color} />
      <Text style={[badgeStyles.name, { color }]} numberOfLines={1}>{country}</Text>
      <View style={[badgeStyles.count, { backgroundColor: color + '30' }]}>
        <Text style={[badgeStyles.countText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

function RegionTile({ stat, delay }: { stat: RegionStat; delay: number }) {
  const pct = stat.total > 0 ? (stat.visited / stat.total) * 100 : 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <Animated.View>
      <TouchableOpacity
        style={regionStyles.tile}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.85}
      >
        <LinearGradient colors={[stat.region.color + '18', '#0e0e0e']} style={regionStyles.gradient}>
          <View style={regionStyles.header}>
            <View style={[regionStyles.emojiBox, { backgroundColor: stat.region.color + '22', borderColor: stat.region.color + '40' }]}>
              <Text style={{ fontSize: 22 }}>{stat.region.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={regionStyles.name}>{stat.region.name}</Text>
              <Text style={[regionStyles.sub, { color: stat.region.color }]}>
                {stat.visited} of {stat.total} countries explored
              </Text>
            </View>
            <View style={regionStyles.pctBox}>
              <Text style={[regionStyles.pctText, { color: stat.region.color }]}>{Math.round(pct)}%</Text>
            </View>
          </View>
          <View style={regionStyles.barBg}>
            <View style={[regionStyles.barFill, { width: `${pct}%` as any, backgroundColor: stat.region.color }]} />
          </View>
          {expanded && stat.countries.length > 0 && (
            <View style={regionStyles.countriesWrap}>
              {stat.countries.map(c => (
                <CountryBadge key={c.name} country={c.name} count={c.count} color={stat.region.color} />
              ))}
            </View>
          )}
          {stat.countries.length > 0 && (
            <Text style={[regionStyles.tapHint, { color: stat.region.color + '80' }]}>
              {expanded ? '▲ Collapse' : `▼ Show ${stat.countries.length} countries`}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function WorldMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);
  const [totalCountries, setTotalCountries] = useState(0);
  const [totalSites, setTotalSites] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isLoaded && auth.userId) loadData();
  }, [auth.isLoaded, auth.userId]);

  const loadData = async () => {
    setLoading(true);
    // ✅ FIX: use supabase template for RLS
    let token: string | null = null;
    try { token = await auth.getToken({ template: 'supabase' }); } catch { token = await auth.getToken(); }
    const client = token ? createClerkSupabaseClient(token) : supabase;

    const { data } = await client
      .from('sessions')
      .select('location_country, details')
      .eq('user_id', auth.userId);

    if (!data) { setLoading(false); return; }

    const countryCounts: Record<string, number> = {};
    let total_xp = 0;
    data.forEach(s => {
      const c = s.location_country?.trim();
      if (c) countryCounts[c] = (countryCounts[c] ?? 0) + 1;
      total_xp += s.details?.xp_reward ?? 150;
    });

    const uniqueCountries = Object.keys(countryCounts);
    setTotalCountries(uniqueCountries.length);
    setTotalSites(data.length);
    setTotalXP(total_xp);

    const stats: RegionStat[] = REGIONS.map(region => {
      const visited: { name: string; count: number }[] = [];
      uniqueCountries.forEach(c => {
        const r = getRegionForCountry(c);
        if (r?.id === region.id) visited.push({ name: c, count: countryCounts[c] });
      });
      visited.sort((a, b) => b.count - a.count);
      return { region, visited: visited.length, total: region.countries.length, countries: visited };
    });

    stats.sort((a, b) => b.visited - a.visited);
    setRegionStats(stats);
    setLoading(false);
  };

  const globalPct = Math.round((totalCountries / 195) * 100);

  return (
    <View style={[screenStyles.container, { paddingTop: insets.top }]}>
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={screenStyles.backBtn}>
          <ChevronLeft size={22} color="#c9a84c" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={screenStyles.title}>World Progress</Text>
          <Text style={screenStyles.sub}>Your global discovery map</Text>
        </View>
        <Globe size={22} color="#c9a84c" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Animated.View style={screenStyles.globalBanner}>
          <LinearGradient colors={['#1a1500', '#0e0e0e']} style={screenStyles.bannerGradient}>
            <View style={screenStyles.globeRing}>
              <Text style={screenStyles.globePct}>{globalPct}%</Text>
              <Text style={screenStyles.globeLabel}>of Earth</Text>
            </View>
            <Text style={screenStyles.bannerTitle}>Explorer Passport</Text>
            <View style={screenStyles.statsRow}>
              <View style={screenStyles.stat}>
                <Text style={screenStyles.statVal}>{totalCountries}</Text>
                <Text style={screenStyles.statLabel}>Countries</Text>
              </View>
              <View style={[screenStyles.stat, screenStyles.statDivider]}>
                <Text style={screenStyles.statVal}>{totalSites}</Text>
                <Text style={screenStyles.statLabel}>Sites</Text>
              </View>
              <View style={screenStyles.stat}>
                <Text style={screenStyles.statVal}>{totalXP.toLocaleString()}</Text>
                <Text style={screenStyles.statLabel}>Total XP</Text>
              </View>
            </View>
            <View style={screenStyles.globalBarBg}>
              <View style={[screenStyles.globalBarFill, { width: `${Math.max(globalPct, 2)}%` as any }]} />
            </View>
            <Text style={screenStyles.globalBarLabel}>{totalCountries} / 195 countries explored</Text>
          </LinearGradient>
        </Animated.View>

        <Text style={screenStyles.sectionLabel}>By Region</Text>

        {loading ? (
          <Text style={screenStyles.loading}>Loading your discoveries...</Text>
        ) : (
          regionStats.map((stat, i) => (
            <RegionTile key={stat.region.id} stat={stat} delay={i * 80 + 100} />
          ))
        )}

        {!loading && totalCountries === 0 && (
          <Animated.View style={screenStyles.cta}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🌍</Text>
            <Text style={screenStyles.ctaTitle}>Your map is empty!</Text>
            <Text style={screenStyles.ctaSub}>
              Scan your first monument to place a pin on the world map.
            </Text>
            <TouchableOpacity style={screenStyles.ctaBtn} onPress={() => router.push('/(tabs)')}>
              <Text style={screenStyles.ctaBtnText}>Start Exploring →</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#c9a84c', fontSize: 22, fontFamily: 'Georgia' },
  sub: { color: '#9a9483', fontSize: 11, fontWeight: '600' },
  globalBanner: { margin: 20, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  bannerGradient: { padding: 24, alignItems: 'center', gap: 12 },
  globeRing: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: 'rgba(201,168,76,0.4)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(201,168,76,0.06)' },
  globePct: { color: '#c9a84c', fontSize: 28, fontFamily: 'Georgia' },
  globeLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700' },
  bannerTitle: { color: '#f0ece0', fontSize: 16, fontFamily: 'Georgia' },
  statsRow: { flexDirection: 'row', width: '100%' },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statVal: { color: '#c9a84c', fontSize: 22, fontFamily: 'Georgia' },
  statLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  globalBarBg: { width: '100%', height: 4, backgroundColor: '#1e1e1e', borderRadius: 2, overflow: 'hidden' },
  globalBarFill: { height: '100%', backgroundColor: '#c9a84c', borderRadius: 2 },
  globalBarLabel: { color: '#555', fontSize: 10, fontWeight: '700' },
  sectionLabel: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, paddingHorizontal: 20, marginBottom: 12 },
  loading: { color: '#555', textAlign: 'center', paddingTop: 40, fontSize: 13 },
  cta: { alignItems: 'center', padding: 32 },
  ctaTitle: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', marginBottom: 8 },
  ctaSub: { color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  ctaBtn: { backgroundColor: '#c9a84c', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 20 },
  ctaBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
});

const regionStyles = StyleSheet.create({
  tile: { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  gradient: { padding: 18, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  emojiBox: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#f0ece0', fontSize: 16, fontFamily: 'Georgia', marginBottom: 3 },
  sub: { fontSize: 11, fontWeight: '700' },
  pctBox: { padding: 6 },
  pctText: { fontSize: 18, fontFamily: 'Georgia' },
  barBg: { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  countriesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6 },
  tapHint: { fontSize: 10, fontWeight: '700', textAlign: 'center', paddingTop: 4 },
});

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  name: { fontSize: 10, fontWeight: '700', maxWidth: 80 },
  count: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  countText: { fontSize: 9, fontWeight: '900' },
});