import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { ChevronLeft, Zap, Globe, Crown, Trophy, Medal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { DailyMonumentCard } from '@/components/DailyMonumentCard';

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  xp: number;
  site_count: number;
  nations: number;
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function LeaderboardScreen() {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [myRank, setMyRank] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isLoaded) fetchLeaderboard();
  }, [auth.isLoaded, auth.userId]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);

      // ✅ FIX: leaderboard reads ALL users — use authed client so RLS doesn't block
      // but leaderboard queries all users so we use anon client (no RLS filter needed)
      // We still use authed client so the request is accepted
      let token: string | null = null;
      try { token = await auth.getToken({ template: 'supabase' }); } catch { token = await auth.getToken(); }
      const client = token ? createClerkSupabaseClient(token) : supabase;

      // ✅ FIX: use correct column names
      const { data, error } = await client
        .from('sessions')
        .select('user_id, details, location_country, monument_name');

      if (error || !data) {
        console.error('[RELICA] Leaderboard fetch error:', error?.message);
        return;
      }

      const userMap: Record<string, { xp: number; sites: Set<string>; nations: Set<string> }> = {};
      data.forEach(row => {
        const uid = row.user_id;
        if (!userMap[uid]) userMap[uid] = { xp: 0, sites: new Set(), nations: new Set() };
        const base = row.details?.is_quest_only ? 0 : 150;
        const bonus = row.details?.xp_reward || 0;
        userMap[uid].xp += base + bonus;
        if (row.monument_name) userMap[uid].sites.add(row.monument_name);
        if (row.location_country) userMap[uid].nations.add(row.location_country);
      });

      const sorted = Object.entries(userMap)
        .sort((a, b) => b[1].xp - a[1].xp)
        .slice(0, 20)
        .map(([uid, stats], index) => ({
          user_id: uid,
          display_name: uid === auth.userId ? 'You' : `Explorer #${index + 1}`,
          xp: stats.xp,
          site_count: stats.sites.size,
          nations: stats.nations.size,
        }));

      setEntries(sorted);

      const rank = sorted.findIndex(e => e.user_id === auth.userId);
      setMyRank(rank >= 0 ? rank + 1 : sorted.length + 1);

      const me = sorted.find(e => e.user_id === auth.userId);
      if (me) setMyEntry(me);
    } catch (e) {
      console.error('[RELICA] Leaderboard error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#c9a84c" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Leaderboard</Text>
          <Text style={styles.headerSub}>Global Explorer Rankings</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#c9a84c" />
          <Text style={styles.loadingText}>Fetching explorers...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Monument of the Day */}
          <DailyMonumentCard />

          {entries.length >= 3 && (
            <View style={styles.podium}>
              <PodiumCard entry={entries[1]} rank={2} isMe={entries[1]?.user_id === auth.userId} />
              <PodiumCard entry={entries[0]} rank={1} isMe={entries[0]?.user_id === auth.userId} featured />
              <PodiumCard entry={entries[2]} rank={3} isMe={entries[2]?.user_id === auth.userId} />
            </View>
          )}

          {myEntry && myRank > 10 && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.myBanner}>
              <Text style={styles.myBannerLabel}>Your Rank</Text>
              <Text style={styles.myBannerRank}>#{myRank}</Text>
              <Text style={styles.myBannerXP}>{myEntry.xp} XP</Text>
            </Animated.View>
          )}

          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>📋 Full Rankings</Text>
            {entries.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏛️</Text>
                <Text style={styles.emptyTitle}>No explorers yet</Text>
                <Text style={styles.emptyDesc}>Scan your first monument to claim the #1 spot!</Text>
              </View>
            ) : (
              entries.map((entry, index) => (
                <Animated.View
                  key={entry.user_id}
                  entering={FadeInDown.delay(index * 40)}
                  style={[
                    styles.rankRow,
                    entry.user_id === auth.userId && styles.rankRowMe,
                    index < 3 && styles.rankRowTop,
                  ]}
                >
                  <View style={[styles.rankBadge, index < 3 && { backgroundColor: MEDAL_COLORS[index] + '22' }]}>
                    {index < 3 ? (
                      <Text style={{ fontSize: 16 }}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</Text>
                    ) : (
                      <Text style={[styles.rankNum, entry.user_id === auth.userId && { color: '#c9a84c' }]}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.avatarFallback, entry.user_id === auth.userId && { borderColor: '#c9a84c' }]}>
                    <Text style={styles.avatarText}>{entry.display_name[0]}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={[styles.rankName, entry.user_id === auth.userId && { color: '#c9a84c' }]}>
                      {entry.display_name}{entry.user_id === auth.userId ? ' (You)' : ''}
                    </Text>
                    <View style={styles.rankMeta}>
                      <Globe size={10} color="#9a9483" />
                      <Text style={styles.rankMetaText}>{entry.nations} nations</Text>
                      <Text style={styles.rankMetaDot}>·</Text>
                      <Text style={styles.rankMetaText}>{entry.site_count} sites</Text>
                    </View>
                  </View>
                  <View style={styles.xpContainer}>
                    <Zap size={12} color="#c9a84c" />
                    <Text style={[styles.xpText, entry.user_id === auth.userId && { color: '#c9a84c' }]}>
                      {entry.xp >= 1000 ? `${(entry.xp / 1000).toFixed(1)}k` : entry.xp}
                    </Text>
                  </View>
                </Animated.View>
              ))
            )}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
}

function PodiumCard({ entry, rank, isMe, featured }: { entry: LeaderboardEntry; rank: number; isMe: boolean; featured?: boolean }) {
  return (
    <Animated.View entering={ZoomIn.delay(rank * 100)} style={[styles.podiumCard, featured && styles.podiumFeatured]}>
      <View style={[styles.podiumAvatar, featured && styles.podiumAvatarFeatured, { borderColor: MEDAL_COLORS[rank - 1] }]}>
        <Text style={styles.podiumAvatarText}>{entry.display_name[0]}</Text>
      </View>
      <Text style={{ fontSize: featured ? 22 : 18 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
      <Text style={[styles.podiumName, featured && { color: '#c9a84c', fontSize: 13 }]} numberOfLines={1}>
        {isMe ? 'You' : entry.display_name}
      </Text>
      <View style={styles.podiumXPRow}>
        <Zap size={10} color={MEDAL_COLORS[rank - 1]} />
        <Text style={[styles.podiumXP, { color: MEDAL_COLORS[rank - 1] }]}>
          {entry.xp >= 1000 ? `${(entry.xp / 1000).toFixed(1)}k` : entry.xp} XP
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#c9a84c', fontSize: 22, fontFamily: 'Georgia', textAlign: 'center' },
  headerSub: { color: '#9a9483', fontSize: 10, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.5 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#9a9483', fontSize: 12 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 28, gap: 10, paddingHorizontal: 10 },
  podiumCard: { flex: 1, alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#2a2a2a', gap: 6 },
  podiumFeatured: { backgroundColor: 'rgba(201,168,76,0.06)', borderColor: 'rgba(201,168,76,0.25)', paddingVertical: 20 },
  podiumAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e1e1e', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  podiumAvatarFeatured: { width: 56, height: 56, borderRadius: 28 },
  podiumAvatarText: { color: '#f0ece0', fontSize: 18, fontWeight: '700' },
  podiumName: { color: '#9a9483', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  podiumXPRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  podiumXP: { fontSize: 10, fontWeight: '900' },
  myBanner: { backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  myBannerLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  myBannerRank: { color: '#c9a84c', fontSize: 28, fontFamily: 'Georgia' },
  myBannerXP: { color: '#9a9483', fontSize: 12, fontWeight: '700' },
  listContainer: { gap: 6 },
  listTitle: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
  rankRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 16, padding: 12, gap: 12, borderWidth: 1, borderColor: '#1e1e1e' },
  rankRowMe: { backgroundColor: 'rgba(201,168,76,0.06)', borderColor: 'rgba(201,168,76,0.2)' },
  rankRowTop: { borderColor: '#2a2a2a' },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  rankNum: { color: '#9a9483', fontSize: 13, fontWeight: '900' },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', borderWidth: 1.5, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#f0ece0', fontSize: 15, fontWeight: '700' },
  rankInfo: { flex: 1 },
  rankName: { color: '#f0ece0', fontSize: 13, fontWeight: '700' },
  rankMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  rankMetaText: { color: '#9a9483', fontSize: 10 },
  rankMetaDot: { color: '#9a9483', fontSize: 10 },
  xpContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(201,168,76,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  xpText: { color: '#9a9483', fontSize: 12, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#f0ece0', fontSize: 18, fontFamily: 'Georgia', marginBottom: 8 },
  emptyDesc: { color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});