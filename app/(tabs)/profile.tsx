import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Alert, Dimensions, StyleSheet, Share } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { LogOut, Map as MapIcon, Globe, Camera, ChevronRight, BookOpen, Trophy, Zap, Brain, Share2, CreditCard } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { Session } from '@/types';
import Animated, { FadeInDown, FadeInRight, ZoomIn, FadeInUp } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/lib/languageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { getStreak, getStreakEmoji, getStreakTitle, getXPMultiplier, type StreakData } from '@/lib/streak';

const { width } = Dimensions.get('window');

const QUIZ_QUESTIONS = [
  { q: "What architectural style features pointed arches and flying buttresses?", a: "Gothic" },
  { q: "Which ancient wonder was located in Alexandria?", a: "The Lighthouse" },
  { q: "What material was the Pantheon's dome made of?", a: "Concrete" },
  { q: "In which city is the Blue Mosque located?", a: "Istanbul" },
  { q: "Who designed the Eiffel Tower?", a: "Gustave Eiffel" },
  { q: "What is the oldest standing monument in the world?", a: "Pyramids of Giza" },
];

// ✅ Shared helper to get the right token everywhere
async function getSupabaseToken(getToken: (opts?: any) => Promise<string | null>) {
  try { return await getToken({ template: 'supabase' }); } catch { return await getToken(); }
}

export default function ProfileScreen() {
  const { user } = useUser();
  const auth = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nationsCount, setNationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<{ name: string; xp: number }[]>([]);
  const [quizActive, setQuizActive] = useState(false);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState<boolean | null>(null);
  const [quizDone, setQuizDone] = useState(false);
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastScanDate: null, totalDays: 0 });
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    if (auth.isLoaded && auth.userId) {
      fetchStats();
      getStreak().then(setStreak);
    }
  }, [auth.userId, auth.isLoaded]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      // ✅ FIX: use supabase template
      const token = await getSupabaseToken(auth.getToken);
      const client = token ? createClerkSupabaseClient(token) : supabase;

      const { data, error } = await client
        .from('sessions')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (data && !error) {
        setSessions(data);
        const nations = new Set(data.map((s: Session) => s.location_country));
        setNationsCount(nations.size);
      }

      // Leaderboard: use anon client — reads all users' counts (no personal data)
      const { data: lbData } = await supabase
        .from('sessions')
        .select('user_id')
        .neq('user_id', auth.userId);

      if (lbData) {
        const counts: Record<string, number> = {};
        lbData.forEach((r: any) => { counts[r.user_id] = (counts[r.user_id] || 0) + 150; });
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([uid, xp], i) => ({ name: `Explorer #${i + 1}`, xp }));
        setLeaderboard(sorted);
      }
    } catch (err) {
      console.error('[RELICA] Profile stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      try {
        setLoading(true);
        await user?.setProfileImage({ file: `data:image/jpeg;base64,${result.assets[0].base64}` });
        Alert.alert("Success", "Profile image updated!");
      } catch (err) {
        Alert.alert("Error", "Failed to update profile image.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSignOut = () => {
    Alert.alert("End Expedition", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { auth.signOut(); router.replace('/'); } }
    ]);
  };

  const handleShareProfile = async () => {
    const xp = calculatePrestige();
    const lvl = calculateLevel();
    const text = `🏛️ I'm a Level ${lvl} Explorer on RELICA!\n\n📍 ${sessions.length} sites archived across ${nationsCount} nations\n✨ ${xp} XP earned\n\nJoin me on the quest to discover the world's wonders.`;
    await Share.share({ message: text });
  };

  const calculateLevel = () => Math.floor(calculatePrestige() / 2000) + 1;
  const calculatePrestige = () => sessions.reduce((acc, s) => {
    const base = s.details?.is_quest_only ? 0 : 150;
    const bonus = s.details?.xp_reward || 0;
    return acc + base + bonus;
  }, 0);

  const myXP = calculatePrestige();
  const myRank = leaderboard.filter(l => l.xp > myXP).length + 1;
  const currentQuiz = QUIZ_QUESTIONS[quizIdx % QUIZ_QUESTIONS.length];

  const handleQuizAnswer = (correct: boolean) => {
    setQuizAnswered(correct);
    if (correct) setQuizScore(s => s + 1);
    setTimeout(() => {
      setQuizAnswered(null);
      if (quizIdx + 1 >= 3) setQuizDone(true);
      else setQuizIdx(i => i + 1);
    }, 1000);
  };

  const getTitles = () => {
    const cityCounts: Record<string, number> = {};
    sessions.forEach(s => { cityCounts[s.location_city] = (cityCounts[s.location_city] || 0) + 1; });
    const isNight = (d: string) => { const h = new Date(d).getHours(); return h >= 22 || h <= 5; };
    const isDayPeak = (d: string) => { const h = new Date(d).getHours(); return h >= 11 && h <= 15; };
    return [
      { id: 'pioneer', name: t('pioneer'), emoji: '🎇', unlocked: sessions.length >= 1, context: t('pioneerContext'), color: '#ffd700' },
      { id: 'roman', name: t('romanEmperor'), emoji: '🏛️', unlocked: sessions.filter(s => s.location_country.toLowerCase().includes('ital')).length >= 3, context: t('romanEmperorContext'), color: '#ff6b6b' },
      { id: 'night', name: t('nightOwl'), emoji: '🦉', unlocked: sessions.some(s => isNight(s.created_at)), context: t('nightOwlContext'), color: '#4ecdc4' },
      { id: 'traveler', name: t('worldTraveler'), emoji: '🌍', unlocked: nationsCount >= 3, context: t('worldTravelerContext'), color: '#ffe66d' },
      { id: 'citizen', name: t('globalCitizen'), emoji: '🛂', unlocked: nationsCount >= 5, context: t('globalCitizenContext'), color: '#f7fff7' },
      { id: 'urban', name: t('urbanLegend'), emoji: '🌇', unlocked: Object.values(cityCounts).some(c => c >= 5), context: t('urbanLegendContext'), color: '#a29bfe' },
      { id: 'sun', name: t('sunSeeker'), emoji: '☀️', unlocked: sessions.some(s => isDayPeak(s.created_at)), context: t('sunSeekerContext'), color: '#fab1a0' },
      { id: 'parisian', name: t('parisian'), emoji: '🎨', unlocked: sessions.filter(s => s.location_city.toLowerCase().includes('paris')).length >= 2, context: t('parisianContext'), color: '#74b9ff' },
    ];
  };

  const titles = getTitles();

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
            <TouchableOpacity onPress={handleShareProfile} style={styles.iconBtn}>
              <Share2 color="#c9a84c" size={20} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconBtn}>
              <Settings color="#c9a84c" size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* User Card */}
        <Animated.View entering={FadeInDown.duration(800)} style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: user?.imageUrl }} style={styles.avatar} />
            <TouchableOpacity onPress={pickImage} style={styles.cameraBtn}>
              <Camera color="black" size={14} />
            </TouchableOpacity>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.firstName || t('traveler')}</Text>
            <View style={styles.levelRow}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>{t('level', { level: calculateLevel().toString() })}</Text>
              </View>
              <Text style={styles.rankText}>#{myRank} Global</Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${(calculatePrestige() % 2000) / 20}%` as any }]} />
            </View>
            <Text style={styles.xpHint}>{2000 - (calculatePrestige() % 2000)} XP to Level {calculateLevel() + 1}</Text>
          </View>
        </Animated.View>

        {/* Stats Grid */}
        <View style={styles.statsRow}>
          <StatBox label={t('archives')} value={sessions.filter(s => !s.details?.is_quest_only).length.toString()} icon={<MapIcon size={18} color="#c9a84c" />} />
          <StatBox label={t('nations')} value={nationsCount.toString()} icon={<Globe size={18} color="#c9a84c" />} />
          <StatBox label="XP" value={myXP > 999 ? `${(myXP / 1000).toFixed(1)}k` : myXP.toString()} icon={<Zap size={18} color="#c9a84c" />} />
        </View>

        {/* Streak Widget */}
        <Animated.View entering={FadeInUp.delay(100)} style={styles.section}>
          <LinearGradient
            colors={streak.currentStreak >= 7 ? ['#3d1500', '#1a0a00'] : ['#1a1a1a', '#141414']}
            style={streakStyles.card}
          >
            <View style={streakStyles.left}>
              <Text style={streakStyles.emoji}>{getStreakEmoji(streak.currentStreak)}</Text>
              <View>
                <Text style={streakStyles.days}>{streak.currentStreak}-Day Streak</Text>
                <Text style={streakStyles.title}>{getStreakTitle(streak.currentStreak)}</Text>
              </View>
            </View>
            <View style={streakStyles.right}>
              <Text style={streakStyles.multiplier}>{getXPMultiplier(streak.currentStreak)}×</Text>
              <Text style={streakStyles.xpLabel}>XP Boost</Text>
            </View>
          </LinearGradient>
          <View style={streakStyles.metaRow}>
            <View style={streakStyles.metaStat}>
              <Text style={streakStyles.metaVal}>{streak.longestStreak}</Text>
              <Text style={streakStyles.metaLabel}>Best Streak</Text>
            </View>
            <View style={streakStyles.metaStat}>
              <Text style={streakStyles.metaVal}>{streak.totalDays}</Text>
              <Text style={streakStyles.metaLabel}>Total Days</Text>
            </View>
            <View style={streakStyles.metaStat}>
              <Text style={streakStyles.metaVal}>{streak.currentStreak >= 30 ? '3×' : streak.currentStreak >= 7 ? '1.5×' : '1×'}</Text>
              <Text style={streakStyles.metaLabel}>Multiplier</Text>
            </View>
          </View>
        </Animated.View>

        {/* Quick Nav */}
        <Animated.View entering={FadeInUp.delay(150)} style={navStyles.row}>
          <TouchableOpacity style={navStyles.tile} onPress={() => router.push('/worldmap')}>
            <LinearGradient colors={['#001a1a', '#0e0e0e']} style={navStyles.tileGrad}>
              <Globe size={24} color="#00d2d3" />
              <Text style={[navStyles.tileTitle, { color: '#00d2d3' }]}>World Map</Text>
              <Text style={navStyles.tileSub}>Countries explored</Text>
              <Text style={[navStyles.tileCount, { color: '#00d2d3' }]}>{nationsCount} 🌍</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={navStyles.tile} onPress={() => router.push('/collection')}>
            <LinearGradient colors={['#1a0a2a', '#0e0e0e']} style={navStyles.tileGrad}>
              <CreditCard size={24} color="#b04aff" />
              <Text style={[navStyles.tileTitle, { color: '#b04aff' }]}>Collection</Text>
              <Text style={navStyles.tileSub}>Monument cards</Text>
              <Text style={[navStyles.tileCount, { color: '#b04aff' }]}>{sessions.length} 🎴</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Leaderboard Preview */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Trophy size={16} color="#c9a84c" />
            <Text style={styles.sectionTitle}>Global Leaderboard</Text>
            <TouchableOpacity onPress={() => router.push('/leaderboard')}>
              <Text style={{ color: '#c9a84c', fontSize: 10, fontWeight: '900' }}>Full Rankings →</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.lbRow, styles.lbRowMe]}>
            <Text style={styles.lbRank}>#{myRank}</Text>
            <Image source={{ uri: user?.imageUrl }} style={styles.lbAvatar} />
            <Text style={[styles.lbName, { color: '#c9a84c' }]}>{user?.firstName || 'You'} (You)</Text>
            <Text style={styles.lbXp}>{myXP} XP</Text>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={styles.emptyLabel}>Explore monuments to climb the ranks! 🏛️</Text>
          ) : (
            leaderboard.map((entry, i) => (
              <View key={i} style={styles.lbRow}>
                <Text style={styles.lbRank}>{i < myRank - 1 ? `#${i + 1}` : `#${i + 2}`}</Text>
                <View style={styles.lbAvatarFallback}>
                  <Text style={styles.lbAvatarText}>{entry.name[0]}</Text>
                </View>
                <Text style={styles.lbName}>{entry.name}</Text>
                <Text style={styles.lbXp}>{entry.xp} XP</Text>
              </View>
            ))
          )}
        </Animated.View>

        {/* Daily Quiz */}
        <Animated.View entering={FadeInUp.delay(300)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Brain size={16} color="#c9a84c" />
            <Text style={styles.sectionTitle}>Daily Architecture Quiz</Text>
            <View style={styles.xpPill}><Text style={styles.xpPillText}>+50 XP</Text></View>
          </View>
          {!quizActive ? (
            <View>
              <Text style={styles.quizDesc}>Test your knowledge of world monuments and earn bonus XP!</Text>
              <TouchableOpacity style={styles.quizStartBtn} onPress={() => { setQuizActive(true); setQuizIdx(0); setQuizScore(0); setQuizDone(false); }}>
                <Text style={styles.quizStartText}>Start Quiz →</Text>
              </TouchableOpacity>
            </View>
          ) : quizDone ? (
            <View style={styles.quizDoneContainer}>
              <Text style={styles.quizDoneEmoji}>{quizScore === 3 ? '🏆' : quizScore >= 2 ? '🥈' : '📚'}</Text>
              <Text style={styles.quizDoneScore}>{quizScore}/3 Correct</Text>
              <Text style={styles.quizDoneXP}>+{quizScore * 50} XP Earned!</Text>
              <TouchableOpacity style={styles.quizStartBtn} onPress={() => setQuizActive(false)}>
                <Text style={styles.quizStartText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.quizProgress}>{quizIdx + 1} / 3</Text>
              <Text style={styles.quizQuestion}>{currentQuiz.q}</Text>
              <TouchableOpacity style={[styles.quizOptionBtn, quizAnswered === true && styles.quizCorrect]} onPress={() => quizAnswered === null && handleQuizAnswer(true)}>
                <Text style={styles.quizOptionText}>{currentQuiz.a} ✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quizOptionBtn, quizAnswered === false && styles.quizWrong]} onPress={() => quizAnswered === null && handleQuizAnswer(false)}>
                <Text style={styles.quizOptionText}>Skip →</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* Achievement Badges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unlocked Titles</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {titles.map((title, idx) => (
              <TouchableOpacity key={title.id} onPress={() => Alert.alert(title.name, title.unlocked ? title.context : '🔒 Not yet unlocked.')}>
                <Animated.View entering={ZoomIn.delay(idx * 50)} style={[styles.badge, !title.unlocked && styles.badgeLocked]}>
                  <View style={[styles.badgeCircle, { borderColor: title.unlocked ? title.color : '#333' }]}>
                    <Text style={styles.badgeEmoji}>{title.emoji}</Text>
                  </View>
                  <Text style={[styles.badgeLabel, { color: title.unlocked ? title.color : '#555' }]} numberOfLines={1}>{title.name}</Text>
                </Animated.View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Digital Passport */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/passport')} style={styles.passportBtn}>
          <View style={styles.passportBtnLeft}>
            <View style={styles.passportIcon}>
              <BookOpen color="#c9a84c" size={22} />
            </View>
            <View>
              <Text style={styles.passportTitle}>{t('digitalPassport')}</Text>
              <Text style={styles.passportSub}>{sessions.length} stamps collected</Text>
            </View>
          </View>
          <ChevronRight color="#c9a84c" size={20} />
        </TouchableOpacity>

        {/* Recent Gallery */}
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
                <Animated.View key={session.id} entering={FadeInRight.delay(index * 100)} style={[styles.galleryCard, { height: index % 2 === 0 ? 170 : 220 }]}>
                  <TouchableOpacity onPress={() => router.push(`/session/${session.id}`)} style={{ flex: 1 }}>
                    <Image source={{ uri: session.photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end', padding: 10 }]}>
                      <Text style={styles.galleryName} numberOfLines={1}>{session.monument_name}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        )}

        {/* Sign Out */}
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <LogOut color="#ff4444" size={20} />
          <Text style={styles.signOutText}>{t('endExpeditionAction')}</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </View>
    </ScrollView>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <View style={styles.statBox}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Import Settings icon
import { Settings } from 'lucide-react-native';

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0e0e0e' },
  container: { paddingHorizontal: 20, paddingTop: 70, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  headerTitle: { color: '#c9a84c', fontSize: 32, fontFamily: 'Georgia' },
  headerSub: { color: '#9a9483', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center' },
  userCard: { backgroundColor: '#1a1a1a', borderRadius: 28, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#2a2a2a' },
  avatarContainer: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#2a2a2a' },
  cameraBtn: { position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, backgroundColor: '#c9a84c', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a1a1a' },
  userInfo: { marginLeft: 16, flex: 1 },
  userName: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia' },
  levelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  levelBadge: { backgroundColor: '#c9a84c', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  levelText: { color: '#000', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  rankText: { color: '#9a9483', fontSize: 10, fontWeight: '700' },
  progressBg: { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#c9a84c', borderRadius: 2 },
  xpHint: { color: '#9a9483', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
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
  quizDesc: { color: '#9a9483', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  quizStartBtn: { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 14, padding: 12, alignItems: 'center' },
  quizStartText: { color: '#c9a84c', fontWeight: '800', fontSize: 13 },
  quizProgress: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  quizQuestion: { color: '#f0ece0', fontSize: 15, fontFamily: 'Georgia', lineHeight: 22, marginBottom: 16 },
  quizOptionBtn: { backgroundColor: '#111', borderWidth: 1, borderColor: '#2e2e2e', borderRadius: 14, padding: 12, marginBottom: 8, alignItems: 'center' },
  quizOptionText: { color: '#f0ece0', fontWeight: '700', fontSize: 13 },
  quizCorrect: { backgroundColor: 'rgba(0,200,100,0.15)', borderColor: 'rgba(0,200,100,0.5)' },
  quizWrong: { backgroundColor: 'rgba(255,60,60,0.15)', borderColor: 'rgba(255,60,60,0.5)' },
  quizDoneContainer: { alignItems: 'center', paddingVertical: 10 },
  quizDoneEmoji: { fontSize: 40, marginBottom: 8 },
  quizDoneScore: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', marginBottom: 4 },
  quizDoneXP: { color: '#c9a84c', fontSize: 13, fontWeight: '800', marginBottom: 16 },
  badge: { alignItems: 'center', marginRight: 20 },
  badgeLocked: { opacity: 0.25 },
  badgeCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#1a1a1a', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  badgeEmoji: { fontSize: 22 },
  badgeLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center', width: 58 },
  passportBtn: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  passportBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  passportIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  passportTitle: { color: '#c9a84c', fontFamily: 'Georgia', fontSize: 17 },
  passportSub: { color: '#9a9483', fontSize: 10, fontWeight: '600', marginTop: 2 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryCard: { width: '48%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  galleryName: { color: '#fff', fontSize: 11, fontFamily: 'Georgia' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: 'rgba(255,50,50,0.05)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,50,50,0.15)', marginTop: 6 },
  signOutText: { color: '#ff4444', fontWeight: '700', fontSize: 15, marginLeft: 12 },
});

const streakStyles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, overflow: 'hidden' as const },
  left: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  emoji: { fontSize: 32 },
  days: { color: '#f0ece0', fontSize: 18, fontWeight: '900' as const },
  title: { color: '#9a9483', fontSize: 11, fontWeight: '700' as const, marginTop: 2 },
  right: { alignItems: 'center' as const },
  multiplier: { color: '#c9a84c', fontSize: 22, fontWeight: '900' as const },
  xpLabel: { color: '#9a9483', fontSize: 8, fontWeight: '900' as const, textTransform: 'uppercase' as const },
  metaRow: { flexDirection: 'row' as const, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  metaStat: { flex: 1, alignItems: 'center' as const },
  metaVal: { color: '#f0ece0', fontSize: 14, fontWeight: '800' as const },
  metaLabel: { color: '#555', fontSize: 8, fontWeight: '900' as const, textTransform: 'uppercase' as const, marginTop: 2 },
});

const navStyles = StyleSheet.create({
  row: { flexDirection: 'row' as const, gap: 12, marginBottom: 14 },
  tile: { flex: 1, height: 130, borderRadius: 24, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  tileGrad: { flex: 1, padding: 16, justifyContent: 'space-between' as const },
  tileTitle: { fontSize: 14, fontWeight: '900' as const, textTransform: 'uppercase' as const, letterSpacing: 1 },
  tileSub: { color: '#555', fontSize: 10, fontWeight: '700' as const },
  tileCount: { fontSize: 18, fontWeight: '900' as const, fontStyle: 'italic' as const },
});