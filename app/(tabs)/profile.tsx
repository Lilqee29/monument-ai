import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Image, ScrollView, Alert,
  Dimensions, StyleSheet, Share, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import {
  LogOut, Map as MapIcon, Globe, Camera, ChevronRight, BookOpen,
  Trophy, Zap, Brain, Share2, CreditCard, Settings, RefreshCw,
  Flame, Star, TrendingUp,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { Session } from '@/types';
import Animated, { FadeInDown, FadeInRight, ZoomIn, FadeInUp } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/lib/languageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { OPENROUTER_API_URL, OPENROUTER_API_KEY, TEXT_MODELS } from '@/lib/ai';
import { useToast } from '@/components/Toast';
import { useDemoMode } from '@/lib/demoMode';
import { DailyMonumentCard } from '@/components/DailyMonumentCard';

// ─── Streak helpers (self-contained, no external lib needed) ──────────────────
// These functions compute the streak directly from session dates so they always
// reflect the real data instead of a cached AsyncStorage value that never updates.

function computeStreak(sessions: Session[]) {
  if (!sessions.length) return { currentStreak: 0, longestStreak: 0, totalDays: 0, lastScanDate: null as string | null };

  // Get unique scan DATES (YYYY-MM-DD) sorted newest → oldest
  const dateSet = new Set<string>();
  sessions.forEach(s => dateSet.add(new Date(s.created_at).toISOString().slice(0, 10)));
  const sorted = Array.from(dateSet).sort((a, b) => (a > b ? -1 : 1));

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Current streak: count consecutive days back from today (or yesterday)
  let current = 0;
  let cursor = today;

  // Start only if scanned today or yesterday
  if (sorted[0] === today || sorted[0] === yesterday) {
    cursor = sorted[0];
    current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const expected = new Date(new Date(cursor).getTime() - 86400000).toISOString().slice(0, 10);
      if (sorted[i] === expected) {
        current++;
        cursor = sorted[i];
      } else {
        break;
      }
    }
  }

  // Longest streak: sliding window over all dates
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const expected = new Date(new Date(prev).getTime() - 86400000).toISOString().slice(0, 10);
    if (curr === expected) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    totalDays: sorted.length,
    lastScanDate: sorted[0] ?? null,
  };
}

function streakEmoji(n: number) {
  if (n >= 30) return '🔥';
  if (n >= 14) return '⚡';
  if (n >= 7)  return '🌟';
  if (n >= 3)  return '✨';
  if (n >= 1)  return '🌱';
  return '💤';
}

function streakTitle(n: number) {
  if (n >= 30) return 'Legendary Explorer';
  if (n >= 14) return 'Dedicated Archivist';
  if (n >= 7)  return 'Weekly Wanderer';
  if (n >= 3)  return 'Getting Started';
  if (n >= 1)  return 'First Steps';
  return 'No streak yet';
}

function xpMultiplier(n: number) {
  if (n >= 30) return 3;
  if (n >= 7)  return 1.5;
  return 1;
}

// ─── AI Mini Quiz ─────────────────────────────────────────────────────────────

interface MiniQuestion {
  q: string;
  options: string[];
  correct: number;
  fun_fact?: string;
}

async function generateMiniQuiz(): Promise<MiniQuestion[]> {
  const prompt = `Generate exactly 3 multiple-choice quiz questions about world architecture, monuments, or history.
Rules:
- Each has exactly 4 answer options
- Exactly one is correct (0-based index in "correct")
- Wrong answers are plausible but incorrect
- Include a fun_fact (1 surprising sentence)
- Vary difficulty: 1 easy, 1 medium, 1 hard
Return ONLY a JSON array, no markdown fences:
[{"q":"...","options":["A","B","C","D"],"correct":2,"fun_fact":"..."}]`;

  for (const model of TEXT_MODELS) {
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://relica.expo.app',
          'X-Title': 'RELICA',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Generate the 3 quiz questions as a JSON array.' },
          ],
          max_tokens: 600,
          temperature: 0.9,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const raw: string = data.choices?.[0]?.message?.content ?? '';
      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
        .trim();
      let parsed: MiniQuestion[] | null = null;
      try {
        const obj = JSON.parse(cleaned);
        parsed = Array.isArray(obj) ? obj : obj.questions ?? null;
      } catch {
        const m = cleaned.match(/\[[\s\S]*\]/);
        if (m) try { parsed = JSON.parse(m[0]); } catch { /* skip */ }
      }
      const valid = (parsed ?? []).filter(q =>
        q.q && Array.isArray(q.options) && q.options.length === 4 &&
        typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3
      );
      if (valid.length >= 2) return valid.slice(0, 3);
    } catch { /* try next */ }
  }
  // Fallback static questions if all AI fails
  return [
    { q: "Who designed the Eiffel Tower?", options: ["Le Corbusier", "Hector Guimard", "Gustave Eiffel", "Auguste Perret"], correct: 2, fun_fact: "Gustave Eiffel's company also engineered the internal structure of the Statue of Liberty." },
    { q: "The Pantheon's dome was built from?", options: ["Marble slabs", "Fired bricks", "Granite", "Unreinforced concrete"], correct: 3, fun_fact: "The Pantheon has been continuously used as a place of worship for nearly 2,000 years." },
    { q: "Machu Picchu was built by which civilization?", options: ["Aztecs", "Mayans", "Olmecs", "Incas"], correct: 3, fun_fact: "Machu Picchu was never found by Spanish conquistadors, which is why it remains so well-preserved." },
  ];
}

// ─── Token helper ─────────────────────────────────────────────────────────────

async function getSupabaseToken(getToken: (opts?: any) => Promise<string | null>) {
  try { return await getToken({ template: 'supabase' }); } catch { return await getToken(); }
}

const { width } = Dimensions.get('window');

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { isDemoMode, user: demoUser, sessions: demoSessions, exitDemoMode } = useDemoMode();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [nationsCount, setNationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ name: string; xp: number }[]>([]);

  // Streak — computed from sessions, not AsyncStorage
  const streak = computeStreak(sessions);

  // Mini quiz state
  const [quizQuestions, setQuizQuestions] = useState<MiniQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [showFact, setShowFact] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    if (auth.isLoaded && auth.userId) fetchStats();
  }, [auth.userId, auth.isLoaded, isDemoMode]);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getSupabaseToken(auth.getToken);
      const client = token ? createClerkSupabaseClient(token) : supabase;

      const { data, error } = await client
        .from('sessions').select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        setSessions(data);
        const nations = new Set(data.map((s: Session) => s.location_country));
        setNationsCount(nations.size);
      }

      // Leaderboard
      const { data: lbData } = await supabase
        .from('sessions').select('user_id').neq('user_id', auth.userId);
      if (lbData) {
        const counts: Record<string, number> = {};
        lbData.forEach((r: any) => { counts[r.user_id] = (counts[r.user_id] || 0) + 150; });
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([, xp], i) => ({ name: `Explorer #${i + 1}`, xp }));
        setLeaderboard(sorted);
      }
    } catch (err) {
      console.error('[RELICA] Profile stats error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth]);

  const onRefresh = () => { setRefreshing(true); fetchStats(); };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      try {
        setLoading(true);
        await user?.setProfileImage({ file: `data:image/jpeg;base64,${result.assets[0].base64}` });
        showToast('Profile image updated!', 'success');
      } catch { showToast('Failed to update profile image.', 'error'); }
      finally { setLoading(false); }
    }
  };

  const handleSignOut = () =>
    Alert.alert('End Expedition', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { auth.signOut(); router.replace('/'); } },
    ]);

  const handleShareProfile = async () => {
    const xp = myXP; const lvl = calculateLevel();
    await Share.share({ message: `🏛️ I'm a Level ${lvl} Explorer on RELICA!\n📍 ${sessions.length} sites across ${nationsCount} nations\n✨ ${xp} XP earned\n🔥 ${streak.currentStreak}-day streak\n\nJoin me exploring the world's wonders.` });
  };

  const calculateLevel   = () => Math.floor(myXP / 2000) + 1;
  const calculatePrestige = () => sessions.reduce((acc, s) => acc + (s.details?.is_quest_only ? 0 : 150) + (s.details?.xp_reward || 0), 0);
  const myXP   = calculatePrestige();
  const myRank = leaderboard.filter(l => l.xp > myXP).length + 1;

  // ── Quiz logic ───────────────────────────────────────────────────────────────

  const startQuiz = async () => {
    setQuizLoading(true);
    setQuizActive(false);
    setQuizIdx(0);
    setQuizScore(0);
    setQuizSelected(null);
    setQuizDone(false);
    setShowFact(false);
    try {
      const qs = await generateMiniQuiz();
      setQuizQuestions(qs);
      setQuizActive(true);
    } catch { showToast('Could not load quiz. Try again.', 'error'); }
    finally { setQuizLoading(false); }
  };

  const handleQuizAnswer = (idx: number) => {
    if (quizSelected !== null) return;
    const correct = quizQuestions[quizIdx]?.correct;
    setQuizSelected(idx);
    setShowFact(true);
    if (idx === correct) setQuizScore(s => s + 1);

    setTimeout(() => {
      setShowFact(false);
      setQuizSelected(null);
      if (quizIdx + 1 >= quizQuestions.length) {
        setQuizDone(true);
        setQuizActive(false);
      } else {
        setQuizIdx(i => i + 1);
      }
    }, 1600);
  };

  // ── Titles / badges ──────────────────────────────────────────────────────────

  const getTitles = () => {
    const cityCounts: Record<string, number> = {};
    sessions.forEach(s => { cityCounts[s.location_city] = (cityCounts[s.location_city] || 0) + 1; });
    const isNight = (d: string) => { const h = new Date(d).getHours(); return h >= 22 || h <= 5; };
    const isDayPeak = (d: string) => { const h = new Date(d).getHours(); return h >= 11 && h <= 15; };
    return [
      { id: 'pioneer',  name: t('pioneer'),       emoji: '🎇', unlocked: sessions.length >= 1,                                                  context: t('pioneerContext'),       color: '#ffd700' },
      { id: 'roman',    name: t('romanEmperor'),   emoji: '🏛️', unlocked: sessions.filter(s => s.location_country.toLowerCase().includes('ital')).length >= 3, context: t('romanEmperorContext'), color: '#ff6b6b' },
      { id: 'night',    name: t('nightOwl'),       emoji: '🦉', unlocked: sessions.some(s => isNight(s.created_at)),                             context: t('nightOwlContext'),      color: '#4ecdc4' },
      { id: 'traveler', name: t('worldTraveler'),  emoji: '🌍', unlocked: nationsCount >= 3,                                                      context: t('worldTravelerContext'), color: '#ffe66d' },
      { id: 'citizen',  name: t('globalCitizen'),  emoji: '🛂', unlocked: nationsCount >= 5,                                                      context: t('globalCitizenContext'), color: '#f7fff7' },
      { id: 'urban',    name: t('urbanLegend'),    emoji: '🌇', unlocked: Object.values(cityCounts).some(c => c >= 5),                            context: t('urbanLegendContext'),   color: '#a29bfe' },
      { id: 'sun',      name: t('sunSeeker'),      emoji: '☀️', unlocked: sessions.some(s => isDayPeak(s.created_at)),                            context: t('sunSeekerContext'),     color: '#fab1a0' },
      { id: 'parisian', name: t('parisian'),       emoji: '🎨', unlocked: sessions.filter(s => s.location_city.toLowerCase().includes('paris')).length >= 2, context: t('parisianContext'), color: '#74b9ff' },
      { id: 'streak7',  name: 'Week Warrior',      emoji: '🔥', unlocked: streak.longestStreak >= 7,                                              context: 'Maintained a 7-day exploration streak.',  color: '#ff6b35' },
      { id: 'streak30', name: 'Immortal Explorer', emoji: '⚡', unlocked: streak.longestStreak >= 30,                                             context: 'Maintained a 30-day exploration streak.', color: '#e0aaff' },
    ];
  };

  const titles = getTitles();
  const currentQ = quizQuestions[quizIdx];

  // ── Demo Mode Render ──────────────────────────────────────────────────────────

  if (isDemoMode) {
    const demoStreak = { currentStreak: demoUser.streak, longestStreak: demoUser.longestStreak, totalDays: 15, lastScanDate: new Date().toISOString().slice(0, 10) };
    const demoTitles = getTitles();
    const demoMyXP = demoUser.xp;
    const demoLevel = Math.floor(demoMyXP / 2000) + 1;

    return (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>RELICA</Text>
              <Text style={styles.headerSub}>{t('craftedFor')}</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconBtn}>
                <Settings color="#c9a84c" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Demo Banner */}
          <Animated.View entering={FadeInDown.duration(500)} style={[styles.userCard, { borderColor: 'rgba(201,168,76,0.3)' }]}>
            <View style={styles.avatarContainer}>
              <View style={[styles.avatar, { backgroundColor: '#c9a84c22', borderColor: '#c9a84c' }]}>
                <Text style={styles.avatarText}>D</Text>
              </View>
            </View>
            <Text style={styles.userName}>{demoUser.displayName}</Text>
            <Text style={[styles.userRole, { color: '#c9a84c' }]}>DEMO MODE</Text>
          </Animated.View>

          {/* Daily Monument */}
          <DailyMonumentCard />

          {/* Stats */}
          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{demoMyXP}</Text>
              <Text style={styles.statLabel}>XP</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{demoLevel}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{demoUser.sites}</Text>
              <Text style={styles.statLabel}>Sites</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{demoUser.nations}</Text>
              <Text style={styles.statLabel}>Nations</Text>
            </View>
          </Animated.View>

          {/* Streak */}
          <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.streakCard}>
            <Text style={styles.streakEmoji}>{streakEmoji(demoStreak.currentStreak)}</Text>
            <View style={styles.streakInfo}>
              <Text style={styles.streakTitle}>{streakTitle(demoStreak.currentStreak)}</Text>
              <Text style={styles.streakSub}>{demoStreak.currentStreak}-day streak · Best: {demoStreak.longestStreak}</Text>
            </View>
          </Animated.View>

          {/* Exit Demo */}
          <TouchableOpacity
            onPress={async () => { await exitDemoMode(); router.replace('/'); }}
            style={[styles.signOutBtn, { borderColor: '#ff4444' }]}
          >
            <Text style={[styles.signOutText, { color: '#ff4444' }]}>Exit Demo Mode</Text>
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c9a84c" />}
    >
      <View style={styles.container}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>RELICA</Text>
            <Text style={styles.headerSub}>{t('craftedFor')}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleShareProfile} style={styles.iconBtn}>
              <Share2 color="#c9a84c" size={20} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconBtn}>
              <Settings color="#c9a84c" size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── User Card ───────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(700)} style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: user?.imageUrl }} style={styles.avatar} />
            <TouchableOpacity onPress={pickImage} style={styles.cameraBtn}>
              <Camera color="#000" size={14} />
            </TouchableOpacity>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.firstName || t('traveler')}</Text>
            <View style={styles.levelRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>LVL {calculateLevel()}</Text>
              </View>
              <Text style={styles.rankText}>#{myRank} Global</Text>
              {streak.currentStreak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={{ fontSize: 10 }}>🔥</Text>
                  <Text style={styles.streakBadgeText}>{streak.currentStreak}d</Text>
                </View>
              )}
            </View>
            {/* XP Progress bar */}
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.min(((myXP % 2000) / 2000) * 100, 100)}%` as any }]} />
            </View>
            <Text style={styles.xpHint}>{myXP % 2000} / 2000 XP · {2000 - (myXP % 2000)} to Level {calculateLevel() + 1}</Text>
          </View>
        </Animated.View>

        {/* ── Stats Grid ──────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatBox label={t('archives') ?? 'Archives'} value={sessions.filter(s => !s.details?.is_quest_only).length.toString()} icon={<MapIcon size={18} color="#c9a84c" />} />
          <StatBox label={t('nations') ?? 'Nations'} value={nationsCount.toString()} icon={<Globe size={18} color="#c9a84c" />} />
          <StatBox label="XP" value={myXP > 999 ? `${(myXP / 1000).toFixed(1)}k` : myXP.toString()} icon={<Zap size={18} color="#c9a84c" />} />
        </View>

        {/* ── Streak Widget ────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(80)} style={styles.section}>
          <LinearGradient
            colors={streak.currentStreak >= 7 ? ['#3d1500', '#1a0a00'] : ['#1a1a1a', '#141414']}
            style={streakSt.card}
          >
            <View style={streakSt.left}>
              <Text style={streakSt.emoji}>{streakEmoji(streak.currentStreak)}</Text>
              <View>
                <Text style={streakSt.days}>{streak.currentStreak}-Day Streak</Text>
                <Text style={streakSt.title}>{streakTitle(streak.currentStreak)}</Text>
              </View>
            </View>
            <View style={streakSt.right}>
              <Text style={streakSt.multiplier}>{xpMultiplier(streak.currentStreak)}×</Text>
              <Text style={streakSt.xpLabel}>XP Boost</Text>
            </View>
          </LinearGradient>

          <View style={streakSt.metaRow}>
            <View style={streakSt.metaStat}>
              <Text style={streakSt.metaVal}>{streak.longestStreak}</Text>
              <Text style={streakSt.metaLabel}>Best</Text>
            </View>
            <View style={streakSt.metaStat}>
              <Text style={streakSt.metaVal}>{streak.totalDays}</Text>
              <Text style={streakSt.metaLabel}>Total Days</Text>
            </View>
            <View style={streakSt.metaStat}>
              <Text style={streakSt.metaVal}>{xpMultiplier(streak.currentStreak)}×</Text>
              <Text style={streakSt.metaLabel}>Multiplier</Text>
            </View>
          </View>

          {/* Streak tip */}
          {streak.currentStreak === 0 && (
            <View style={streakSt.tip}>
              <Flame size={13} color="#c9a84c" />
              <Text style={streakSt.tipText}>Scan a monument today to start your streak!</Text>
            </View>
          )}
          {streak.currentStreak > 0 && streak.currentStreak < 7 && (
            <View style={streakSt.tip}>
              <TrendingUp size={13} color="#4ecdc4" />
              <Text style={[streakSt.tipText, { color: '#4ecdc4' }]}>{7 - streak.currentStreak} more days to unlock 1.5× XP boost!</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Quick Nav Tiles ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(130)} style={navSt.row}>
          <TouchableOpacity style={navSt.tile} onPress={() => router.push('/worldmap')}>
            <LinearGradient colors={['#001a1a', '#0e0e0e']} style={navSt.tileGrad}>
              <Globe size={24} color="#00d2d3" />
              <Text style={[navSt.tileTitle, { color: '#00d2d3' }]}>World Map</Text>
              <Text style={navSt.tileSub}>Countries explored</Text>
              <Text style={[navSt.tileCount, { color: '#00d2d3' }]}>{nationsCount} 🌍</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={navSt.tile} onPress={() => router.push('/collection')}>
            <LinearGradient colors={['#1a0a2a', '#0e0e0e']} style={navSt.tileGrad}>
              <CreditCard size={24} color="#b04aff" />
              <Text style={[navSt.tileTitle, { color: '#b04aff' }]}>Collection</Text>
              <Text style={navSt.tileSub}>Monument cards</Text>
              <Text style={[navSt.tileCount, { color: '#b04aff' }]}>{sessions.length} 🎴</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Leaderboard ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(160)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Trophy size={16} color="#c9a84c" />
            <Text style={styles.sectionTitle}>Global Leaderboard</Text>
            <TouchableOpacity onPress={() => router.push('/leaderboard')}>
              <Text style={styles.seeAll}>Full Rankings →</Text>
            </TouchableOpacity>
          </View>
          {/* My row */}
          <View style={[styles.lbRow, styles.lbRowMe]}>
            <Text style={styles.lbRank}>#{myRank}</Text>
            <Image source={{ uri: user?.imageUrl }} style={styles.lbAvatar} />
            <Text style={[styles.lbName, { color: '#c9a84c' }]}>{user?.firstName || 'You'} (You)</Text>
            <Text style={styles.lbXp}>{myXP} XP</Text>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={styles.emptyLabel}>Scan monuments to climb the ranks! 🏛️</Text>
          ) : leaderboard.map((entry, i) => (
            <View key={i} style={styles.lbRow}>
              <Text style={styles.lbRank}>{i < myRank - 1 ? `#${i + 1}` : `#${i + 2}`}</Text>
              <View style={styles.lbAvatarFallback}><Text style={styles.lbAvatarText}>{entry.name[0]}</Text></View>
              <Text style={styles.lbName}>{entry.name}</Text>
              <Text style={styles.lbXp}>{entry.xp} XP</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── AI Mini Quiz ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Brain size={16} color="#c9a84c" />
            <Text style={styles.sectionTitle}>Daily Monument Quiz</Text>
            <View style={styles.xpPill}><Text style={styles.xpPillText}>+{3 * 50} XP</Text></View>
          </View>

          {/* Idle state */}
          {!quizActive && !quizDone && (
            <View>
              <Text style={styles.quizDesc}>3 AI-generated questions, unique every time. Test your monument knowledge!</Text>
              <TouchableOpacity
                style={[styles.quizStartBtn, quizLoading && { opacity: 0.6 }]}
                onPress={startQuiz}
                disabled={quizLoading}
              >
                {quizLoading
                  ? <ActivityIndicator color="#c9a84c" size="small" />
                  : <Text style={styles.quizStartText}>Generate & Start Quiz →</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* Active quiz */}
          {quizActive && currentQ && (
            <View style={{ gap: 10 }}>
              {/* Progress */}
              <View style={styles.quizProgressRow}>
                <Text style={styles.quizProgress}>{quizIdx + 1} / {quizQuestions.length}</Text>
                <View style={styles.quizProgressBarBg}>
                  <View style={[styles.quizProgressBarFill, { width: `${((quizIdx + 1) / quizQuestions.length) * 100}%` as any }]} />
                </View>
              </View>

              <Text style={styles.quizQuestion}>{currentQ.q}</Text>

              {/* 4 real options */}
              {currentQ.options.map((opt, i) => {
                const isSelected = quizSelected === i;
                const isCorrect = currentQ.correct === i;
                const revealed = quizSelected !== null;

                let bg = '#111', border = '#2a2a2a', color = '#f0ece0';
                if (revealed) {
                  if (isCorrect)         { bg = 'rgba(0,200,100,0.1)'; border = 'rgba(0,200,100,0.5)'; color = '#00c864'; }
                  else if (isSelected)   { bg = 'rgba(255,50,50,0.1)'; border = 'rgba(255,50,50,0.5)'; color = '#ff4444'; }
                  else                   { bg = '#0a0a0a'; border = '#1a1a1a'; color = '#333'; }
                }
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => handleQuizAnswer(i)}
                    disabled={quizSelected !== null}
                    style={[styles.quizOption, { backgroundColor: bg, borderColor: border }]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.quizOptLetter, { borderColor: border }]}>
                      <Text style={[styles.quizOptLetterText, { color }]}>
                        {revealed ? (isCorrect ? '✓' : isSelected ? '✗' : ['A','B','C','D'][i]) : ['A','B','C','D'][i]}
                      </Text>
                    </View>
                    <Text style={[styles.quizOptText, { color }]}>{opt}</Text>
                    {revealed && isCorrect && <Star size={13} color="#00c864" fill="#00c864" />}
                  </TouchableOpacity>
                );
              })}

              {/* Fun fact after answering */}
              {showFact && currentQ.fun_fact && (
                <View style={styles.quizFactCard}>
                  <Text style={styles.quizFactLabel}>💡 Did you know?</Text>
                  <Text style={styles.quizFactText}>{currentQ.fun_fact}</Text>
                </View>
              )}
            </View>
          )}

          {/* Done state */}
          {quizDone && (
            <View style={styles.quizDoneContainer}>
              <Text style={styles.quizDoneEmoji}>
                {quizScore === quizQuestions.length ? '🏆' : quizScore >= 2 ? '🥇' : '📚'}
              </Text>
              <Text style={styles.quizDoneScore}>{quizScore}/{quizQuestions.length} Correct</Text>
              <Text style={styles.quizDoneXP}>+{quizScore * 50} XP Earned!</Text>
              <TouchableOpacity style={styles.quizStartBtn} onPress={startQuiz}>
                <RefreshCw size={13} color="#c9a84c" />
                <Text style={[styles.quizStartText, { marginLeft: 6 }]}>Play Again (New Questions)</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* ── Unlocked Titles ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Star size={16} color="#c9a84c" />
            <Text style={styles.sectionTitle}>Unlocked Titles</Text>
            <Text style={styles.seeAll}>{titles.filter(t => t.unlocked).length}/{titles.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {titles.map((title, idx) => (
              <TouchableOpacity
                key={title.id}
                onPress={() => Alert.alert(title.emoji + ' ' + title.name, title.unlocked ? title.context : '🔒 Not yet unlocked. Keep exploring!')}
              >
                <Animated.View entering={ZoomIn.delay(idx * 40)} style={[styles.badge, !title.unlocked && styles.badgeLocked]}>
                  <View style={[styles.badgeCircle, { borderColor: title.unlocked ? title.color : '#333' }]}>
                    <Text style={styles.badgeEmoji}>{title.emoji}</Text>
                  </View>
                  <Text style={[styles.badgeLabel, { color: title.unlocked ? title.color : '#555' }]} numberOfLines={2}>{title.name}</Text>
                </Animated.View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Digital Passport ─────────────────────────────────────────────── */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/passport')} style={styles.passportBtn}>
          <View style={styles.passportBtnLeft}>
            <View style={styles.passportIcon}><BookOpen color="#c9a84c" size={22} /></View>
            <View>
              <Text style={styles.passportTitle}>{t('digitalPassport')}</Text>
              <Text style={styles.passportSub}>{sessions.length} stamps collected</Text>
            </View>
          </View>
          <ChevronRight color="#c9a84c" size={20} />
        </TouchableOpacity>

        {/* ── Recent Gallery ───────────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('recentDiscoveries')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/gallery')}>
                <Text style={styles.seeAll}>See All →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.galleryGrid}>
              {sessions.slice(0, 4).map((session, index) => (
                <Animated.View
                  key={session.id}
                  entering={FadeInRight.delay(index * 80)}
                  style={[styles.galleryCard, { height: index % 2 === 0 ? 170 : 220 }]}
                >
                  <TouchableOpacity onPress={() => router.push(`/session/${session.id}`)} style={{ flex: 1 }}>
                    <Image source={{ uri: session.photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.75)']}
                      style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', padding: 10 }]}
                    >
                      <Text style={styles.galleryName} numberOfLines={1}>{session.monument_name}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!loading && sessions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🏛️</Text>
            <Text style={styles.emptyStateTitle}>No Archives Yet</Text>
            <Text style={styles.emptyStateSub}>Scan your first monument to begin your collection and start earning XP.</Text>
          </View>
        )}

        {/* ── Sign Out ─────────────────────────────────────────────────────── */}
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <LogOut color="#ff4444" size={20} />
          <Text style={styles.signOutText}>{t('endExpeditionAction') ?? 'Sign Out'}</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </View>
    </ScrollView>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <View style={styles.statBox}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0e0e0e' },
  container: { paddingHorizontal: 20, paddingTop: 70, paddingBottom: 20 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  headerTitle: { color: '#c9a84c', fontSize: 32, fontFamily: 'Georgia' },
  headerSub: { color: '#9a9483', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center' },

  userCard: { backgroundColor: '#1a1a1a', borderRadius: 28, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  avatarContainer: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#f0ece0', fontSize: 28, fontFamily: 'Georgia', fontWeight: '700' },
  cameraBtn: { position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, backgroundColor: '#c9a84c', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a1a1a' },
  userInfo: { marginLeft: 16, flex: 1 },
  userName: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia' },
  userRole: { color: '#9a9483', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' },
  levelBadge: { backgroundColor: '#c9a84c', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  levelText: { color: '#000', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  rankText: { color: '#9a9483', fontSize: 10, fontWeight: '700' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,107,53,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)' },
  streakBadgeText: { color: '#ff6b35', fontSize: 10, fontWeight: '900' },
  streakCard: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 14 },
  streakEmoji: { fontSize: 32 },
  streakInfo: { flex: 1 },
  streakTitle: { color: '#f0ece0', fontSize: 16, fontFamily: 'Georgia', fontWeight: '700' },
  streakSub: { color: '#9a9483', fontSize: 11, fontWeight: '600', marginTop: 2 },
  progressBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#c9a84c', borderRadius: 2 },
  xpHint: { color: '#9a9483', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  statBox: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 20, padding: 16, alignItems: 'center', width: '31%' },
  statValue: { color: '#f0ece0', fontSize: 18, fontFamily: 'Georgia', marginTop: 8 },
  statLabel: { color: '#9a9483', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginTop: 2 },

  section: { backgroundColor: '#1a1a1a', borderRadius: 24, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  sectionTitle: { color: '#f0ece0', fontSize: 13, fontWeight: '800', flex: 1 },
  seeAll: { color: '#9a9483', fontSize: 10, fontWeight: '700' },
  emptyLabel: { color: '#9a9483', fontSize: 12, textAlign: 'center', paddingVertical: 8 },

  xpPill: { backgroundColor: 'rgba(201,168,76,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  xpPillText: { color: '#c9a84c', fontSize: 9, fontWeight: '900' },

  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 10 },
  lbRowMe: { backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 14, paddingHorizontal: 10, borderBottomWidth: 0, marginBottom: 8 },
  lbRank: { color: '#c9a84c', fontSize: 12, fontWeight: '900', width: 28 },
  lbAvatar: { width: 30, height: 30, borderRadius: 15 },
  lbAvatarFallback: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  lbAvatarText: { color: '#9a9483', fontSize: 12, fontWeight: '700' },
  lbName: { color: '#f0ece0', fontSize: 12, fontWeight: '600', flex: 1 },
  lbXp: { color: '#9a9483', fontSize: 11, fontWeight: '700' },

  // Quiz
  quizDesc: { color: '#9a9483', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  quizStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 14, padding: 14 },
  quizStartText: { color: '#c9a84c', fontWeight: '800', fontSize: 13 },
  quizProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quizProgress: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', minWidth: 40 },
  quizProgressBarBg: { flex: 1, height: 3, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden' },
  quizProgressBarFill: { height: '100%', backgroundColor: '#c9a84c', borderRadius: 2 },
  quizQuestion: { color: '#f0ece0', fontSize: 15, fontFamily: 'Georgia', lineHeight: 22 },
  quizOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  quizOptLetter: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quizOptLetterText: { fontWeight: '900', fontSize: 12 },
  quizOptText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  quizFactCard: { backgroundColor: 'rgba(201,168,76,0.07)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 12, padding: 12, gap: 5 },
  quizFactLabel: { color: '#c9a84c', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  quizFactText: { color: '#c8c4b8', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  quizDoneContainer: { alignItems: 'center', paddingVertical: 10, gap: 8 },
  quizDoneEmoji: { fontSize: 44 },
  quizDoneScore: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia' },
  quizDoneXP: { color: '#c9a84c', fontSize: 13, fontWeight: '800' },

  // Badges
  badge: { alignItems: 'center', marginRight: 20, width: 64 },
  badgeLocked: { opacity: 0.22 },
  badgeCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#111', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  badgeEmoji: { fontSize: 22 },
  badgeLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' },

  // Passport
  passportBtn: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  passportBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  passportIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  passportTitle: { color: '#c9a84c', fontFamily: 'Georgia', fontSize: 17 },
  passportSub: { color: '#9a9483', fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Gallery
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryCard: { width: '48%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  galleryName: { color: '#fff', fontSize: 11, fontFamily: 'Georgia' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyStateTitle: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', marginBottom: 8 },
  emptyStateSub: { color: '#9a9483', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Sign out
  signOutBtn: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255,50,50,0.05)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,50,50,0.15)', marginTop: 6 },
  signOutText: { color: '#ff4444', fontWeight: '700', fontSize: 15, marginLeft: 12 },
});

const streakSt = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 32 },
  days: { color: '#f0ece0', fontSize: 18, fontWeight: '900' },
  title: { color: '#9a9483', fontSize: 11, fontWeight: '700', marginTop: 2 },
  right: { alignItems: 'center' },
  multiplier: { color: '#c9a84c', fontSize: 22, fontWeight: '900' },
  xpLabel: { color: '#9a9483', fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  metaRow: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  metaStat: { flex: 1, alignItems: 'center' },
  metaVal: { color: '#f0ece0', fontSize: 14, fontWeight: '800' },
  metaLabel: { color: '#555', fontSize: 8, fontWeight: '900', textTransform: 'uppercase', marginTop: 2 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, padding: 10 },
  tipText: { color: '#c9a84c', fontSize: 11, fontWeight: '700', flex: 1 },
});

const navSt = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tile: { flex: 1, height: 130, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  tileGrad: { flex: 1, padding: 16, justifyContent: 'space-between' },
  tileTitle: { fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  tileSub: { color: '#555', fontSize: 10, fontWeight: '700' },
  tileCount: { fontSize: 18, fontWeight: '900', fontStyle: 'italic' },
});