import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Dimensions, Animated, Image, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { ChevronLeft, Star, Lock, Globe2, Zap, Award } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const CARD_W = (width - 56) / 2;
const CARD_H = CARD_W * 1.48;

interface Rarity {
  label: string;
  color: string;
  glow: string;
  gradient: [string, string];
  minScore: number;
  xpBonus: number;
}

const RARITIES: Record<string, Rarity> = {
  legendary: { label: 'LEGENDARY', color: '#ffd700', glow: 'rgba(255,215,0,0.4)', gradient: ['#3d2c00', '#1a1200'], minScore: 9, xpBonus: 500 },
  epic: { label: 'EPIC', color: '#b04aff', glow: 'rgba(176,74,255,0.35)', gradient: ['#1e0a3c', '#0e0518'], minScore: 7, xpBonus: 250 },
  rare: { label: 'RARE', color: '#4a9eff', glow: 'rgba(74,158,255,0.3)', gradient: ['#0a1e3c', '#050e1e'], minScore: 5, xpBonus: 100 },
  common: { label: 'COMMON', color: '#c9a84c', glow: 'rgba(201,168,76,0.2)', gradient: ['#1a1500', '#0e0e0e'], minScore: 0, xpBonus: 50 },
};

function getRarity(significanceScore: number): Rarity {
  if (significanceScore >= 9) return RARITIES.legendary;
  if (significanceScore >= 7) return RARITIES.epic;
  if (significanceScore >= 5) return RARITIES.rare;
  return RARITIES.common;
}

interface MonumentCard {
  id: string;
  name: string;
  city: string;
  country: string;
  image_url?: string;
  significance_score: number;
  xp_earned: number;
  scanned_at: string;
  fun_fact?: string;
}

function CollectionCard({ card, onPress }: { card: MonumentCard; onPress: () => void }) {
  const rarity = getRarity(card.significance_score ?? 5);
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rarity.label === 'LEGENDARY') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.85] });

  return (
    <TouchableOpacity onPress={onPress} style={[cardStyles.wrapper, { width: CARD_W, height: CARD_H }]}>
      {rarity.label === 'LEGENDARY' && (
        <Animated.View style={[cardStyles.legendaryGlow, { opacity: glowOpacity, shadowColor: rarity.glow }]} />
      )}
      <LinearGradient colors={rarity.gradient} style={cardStyles.card}>
        <View style={[cardStyles.rarityBadge, { borderColor: rarity.color + '60', backgroundColor: rarity.color + '18' }]}>
          <Text style={[cardStyles.rarityText, { color: rarity.color }]}>{rarity.label}</Text>
        </View>
        <View style={cardStyles.imageContainer}>
          {card.image_url ? (
            <Image source={{ uri: card.image_url }} style={cardStyles.image} resizeMode="cover" />
          ) : (
            <View style={cardStyles.imagePlaceholder}>
              <Text style={{ fontSize: 36 }}>🏛️</Text>
            </View>
          )}
          <View style={cardStyles.scoreRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={9}
                color={i < Math.round((card.significance_score ?? 5) / 2) ? rarity.color : '#333'}
                fill={i < Math.round((card.significance_score ?? 5) / 2) ? rarity.color : 'transparent'}
              />
            ))}
          </View>
        </View>
        <View style={cardStyles.info}>
          <Text style={[cardStyles.cardName, { color: rarity.color }]} numberOfLines={2}>{card.name}</Text>
          <Text style={cardStyles.cardLocation}>📍 {card.city}, {card.country}</Text>
          <View style={cardStyles.xpRow}>
            <Zap size={10} color="#c9a84c" fill="#c9a84c" />
            <Text style={cardStyles.xpText}>+{card.xp_earned ?? rarity.xpBonus} XP</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function CardDetail({ card, onClose }: { card: MonumentCard; onClose: () => void }) {
  const rarity = getRarity(card.significance_score ?? 5);
  const scanDate = new Date(card.scanned_at).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <View style={detailStyles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
      <LinearGradient colors={rarity.gradient} style={detailStyles.modal}>
        <View style={[detailStyles.borderGlow, { borderColor: rarity.color + '40' }]} />
        <View style={[detailStyles.rarityTop, { backgroundColor: rarity.color + '22', borderColor: rarity.color + '55' }]}>
          <Text style={[detailStyles.rarityLabel, { color: rarity.color }]}>{rarity.label} CARD</Text>
          <Award size={16} color={rarity.color} />
        </View>
        <View style={detailStyles.imageWrap}>
          {card.image_url ? (
            <Image source={{ uri: card.image_url }} style={detailStyles.bigImage} resizeMode="cover" />
          ) : (
            <View style={detailStyles.bigPlaceholder}>
              <Text style={{ fontSize: 64 }}>🏛️</Text>
            </View>
          )}
        </View>
        <Text style={[detailStyles.name, { color: rarity.color }]}>{card.name}</Text>
        <Text style={detailStyles.location}>📍 {card.city}, {card.country}</Text>
        <View style={detailStyles.statsRow}>
          <View style={detailStyles.stat}>
            <Text style={[detailStyles.statVal, { color: rarity.color }]}>{card.significance_score ?? 5}/10</Text>
            <Text style={detailStyles.statLabel}>Significance</Text>
          </View>
          <View style={detailStyles.stat}>
            <Text style={[detailStyles.statVal, { color: '#c9a84c' }]}>+{card.xp_earned ?? rarity.xpBonus}</Text>
            <Text style={detailStyles.statLabel}>XP Earned</Text>
          </View>
          <View style={detailStyles.stat}>
            <Text style={[detailStyles.statVal, { color: '#9a9483' }]}>{scanDate.split(' ')[2]}</Text>
            <Text style={detailStyles.statLabel}>Year Found</Text>
          </View>
        </View>
        {card.fun_fact && (
          <View style={detailStyles.funFact}>
            <Text style={detailStyles.funFactLabel}>💡 Fun Fact</Text>
            <Text style={detailStyles.funFactText}>{card.fun_fact}</Text>
          </View>
        )}
        <Text style={detailStyles.dateScanned}>Discovered on {scanDate}</Text>
        <TouchableOpacity style={[detailStyles.closeBtn, { borderColor: rarity.color + '60' }]} onPress={onClose}>
          <Text style={[detailStyles.closeBtnText, { color: rarity.color }]}>Close Card</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

type FilterType = 'all' | 'legendary' | 'epic' | 'rare' | 'common';

export default function CollectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [cards, setCards] = useState<MonumentCard[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<MonumentCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isLoaded && auth.userId) loadCards();
  }, [auth.isLoaded, auth.userId]);

  const loadCards = async () => {
    setLoading(true);
    // ✅ FIX: use supabase template for RLS
    let token: string | null = null;
    try { token = await auth.getToken({ template: 'supabase' }); } catch { token = await auth.getToken(); }
    const client = token ? createClerkSupabaseClient(token) : supabase;

    // ✅ FIX: use correct column names matching your sessions table
    const { data, error } = await client
      .from('sessions')
      .select('id, monument_name, location_city, location_country, photo_url, details, created_at')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false });

    if (error) console.error('[RELICA] Collection fetch error:', error.message);

    if (data) {
      const mapped: MonumentCard[] = data.map(s => ({
        id: s.id,
        // ✅ FIX: map correct column names to card fields
        name: s.monument_name || 'Unknown Monument',
        city: s.location_city || '—',
        country: s.location_country || '—',
        image_url: s.photo_url,
        significance_score: s.details?.significance_score ?? Math.floor(Math.random() * 5) + 4,
        xp_earned: s.details?.xp_reward ?? 150,
        scanned_at: s.created_at,
        fun_fact: s.details?.fun_fact,
      }));
      setCards(mapped);
    }
    setLoading(false);
  };

  const filtered = filter === 'all' ? cards : cards.filter(c => {
    const r = getRarity(c.significance_score);
    return r.label.toLowerCase() === filter;
  });

  const counts = {
    all: cards.length,
    legendary: cards.filter(c => getRarity(c.significance_score).label === 'LEGENDARY').length,
    epic: cards.filter(c => getRarity(c.significance_score).label === 'EPIC').length,
    rare: cards.filter(c => getRarity(c.significance_score).label === 'RARE').length,
    common: cards.filter(c => getRarity(c.significance_score).label === 'COMMON').length,
  };

  const FILTERS: { key: FilterType; label: string; color: string }[] = [
    { key: 'all', label: `All (${counts.all})`, color: '#f0ece0' },
    { key: 'legendary', label: `⭐ ${counts.legendary}`, color: '#ffd700' },
    { key: 'epic', label: `💜 ${counts.epic}`, color: '#b04aff' },
    { key: 'rare', label: `💙 ${counts.rare}`, color: '#4a9eff' },
    { key: 'common', label: `✨ ${counts.common}`, color: '#c9a84c' },
  ];

  return (
    <View style={[screenStyles.container, { paddingTop: insets.top }]}>
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={screenStyles.backBtn}>
          <ChevronLeft size={22} color="#c9a84c" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={screenStyles.title}>Collection</Text>
          <Text style={screenStyles.sub}>{cards.length} monuments archived</Text>
        </View>
        <Globe2 size={22} color="#c9a84c" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[screenStyles.filterBtn, filter === f.key && { borderColor: f.color, backgroundColor: f.color + '18' }]}
          >
            <Text style={[screenStyles.filterText, { color: filter === f.key ? f.color : '#555' }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={screenStyles.empty}>
          <Text style={screenStyles.emptyText}>Loading collection...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={screenStyles.empty}>
          <Lock size={40} color="#333" />
          <Text style={screenStyles.emptyTitle}>No cards yet</Text>
          <Text style={screenStyles.emptyText}>
            {filter !== 'all'
              ? `You haven't unlocked any ${filter} cards. Keep scanning!`
              : 'Scan your first monument to unlock your first card! 🏛️'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={item => item.id}
          contentContainerStyle={screenStyles.grid}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <CollectionCard card={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      {selected && <CardDetail card={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#c9a84c', fontSize: 22, fontFamily: 'Georgia' },
  sub: { color: '#9a9483', fontSize: 11, fontWeight: '600' },
  filters: { paddingHorizontal: 20, gap: 8, paddingBottom: 8, flexDirection: 'row' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#141414' },
  filterText: { fontSize: 11, fontWeight: '800' },
  grid: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyTitle: { color: '#f0ece0', fontSize: 18, fontFamily: 'Georgia', textAlign: 'center' },
  emptyText: { color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

const cardStyles = StyleSheet.create({
  wrapper: { borderRadius: 20, overflow: 'hidden' },
  legendaryGlow: { position: 'absolute', top: -8, left: -8, right: -8, bottom: -8, borderRadius: 28, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20, elevation: 0 },
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  rarityBadge: { margin: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  rarityText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  imageContainer: { flex: 1, margin: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },
  scoreRow: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 2 },
  info: { paddingHorizontal: 10, paddingBottom: 10, gap: 3 },
  cardName: { fontSize: 11, fontFamily: 'Georgia', lineHeight: 15 },
  cardLocation: { color: '#9a9483', fontSize: 9, fontWeight: '600' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  xpText: { color: '#c9a84c', fontSize: 9, fontWeight: '900' },
});

const detailStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 100 },
  modal: { width: width - 48, borderRadius: 28, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  borderGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28, borderWidth: 2 },
  rarityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 16 },
  rarityLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  imageWrap: { height: 180, borderRadius: 20, overflow: 'hidden', marginBottom: 16, backgroundColor: '#111' },
  bigImage: { width: '100%', height: '100%' },
  bigPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontFamily: 'Georgia', textAlign: 'center', marginBottom: 4 },
  location: { color: '#9a9483', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, alignItems: 'center' },
  statVal: { fontSize: 18, fontFamily: 'Georgia', marginBottom: 2 },
  statLabel: { color: '#9a9483', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  funFact: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 14, gap: 6 },
  funFactLabel: { color: '#c9a84c', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  funFactText: { color: '#f0ece0', fontSize: 13, lineHeight: 20 },
  dateScanned: { color: '#555', fontSize: 11, textAlign: 'center', marginBottom: 16, fontStyle: 'italic' },
  closeBtn: { borderWidth: 1, borderRadius: 18, padding: 14, alignItems: 'center' },
  closeBtnText: { fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 2 },
});