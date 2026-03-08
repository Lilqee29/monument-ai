import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Dimensions, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MapPin, Users, Target, ChevronRight, KeyRound,
  CheckCircle, Shield, Sword, Lock,
} from 'lucide-react-native';
import { generateQuest } from '@/lib/ai';
import { useQuest } from '@/lib/questContext';
import { useLanguage } from '@/lib/languageContext';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

const DIFFICULTY_CONFIG = {
  novice:    { label: 'Novice',    emoji: '🌱', xp: 500,  duration: 20, color: '#4ecdc4' },
  scholar:   { label: 'Scholar',   emoji: '📚', xp: 1000, duration: 45, color: '#c9a84c' },
  historian: { label: 'Historian', emoji: '🏛️', xp: 2000, duration: 75, color: '#ff6b6b' },
} as const;

type Difficulty = keyof typeof DIFFICULTY_CONFIG;

// ─── Shared location helper ───────────────────────────────────────────────────

async function getLocationContext() {
  let lat: number | null = null;
  let lng: number | null = null;
  let city = 'Unknown City';
  let country = 'Unknown Country';
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo) {
        city = geo.city || geo.subregion || 'Your Area';
        country = geo.country || 'Your Country';
      }
    }
  } catch (e) {
    console.warn('[RELICA] Location failed for quest:', e);
  }
  return { lat, lng, city, country };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QuestHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, t } = useLanguage();
  const {
    activeQuest, setActiveQuest, questTimeLeft, setQuestTimeLeft,
    roomPin: globalRoomPin, joinRoom: ctxJoinRoom, createRoom: ctxCreateRoom,
    leaveRoom: ctxLeaveRoom, players, broadcastQuest, joinTeam,
  } = useQuest();

  const [activeTab, setActiveTab] = useState(0); // 0=solo, 1=group, 2=1v1
  const [pinCode, setPinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('scholar');
  const flatListRef = useRef<FlatList>(null);

  const TABS = useMemo(() => [
    { id: 'solo',  label: t('solo'),    Icon: Target },
    { id: 'group', label: t('group'),   Icon: Users  },
    { id: '1v1',   label: t('onevone'), Icon: Lock   },
  ], [language]);

  const onTabPress = (idx: number) => {
    setActiveTab(idx);
    flatListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const onScrollEnd = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (width - 40));
    if (idx >= 0 && idx < TABS.length) setActiveTab(idx);
  };

  // ─── Quest Generation ───────────────────────────────────────────────────────

  const startSoloQuest = async () => {
    try {
      setLoading(true);
      const { lat, lng, city, country } = await getLocationContext();
      const quest = await generateQuest(lat, lng, city, country, language);
      const mult = difficulty === 'historian' ? 2 : difficulty === 'novice' ? 0.5 : 1;
      quest.total_xp = Math.round(quest.total_xp * mult);
      quest.tasks.forEach(task => { task.xp_reward = Math.round(task.xp_reward * mult); });
      setActiveQuest(quest);
      setQuestTimeLeft(quest.duration_minutes * 60);
      router.push('/(tabs)/map');
    } catch (e) {
      alert(t('questGenFailed'));
    } finally {
      setLoading(false);
    }
  };

  const startGroupQuest = async () => {
    try {
      setLoading(true);
      const { lat, lng, city, country } = await getLocationContext();
      const quest = await generateQuest(lat, lng, city, country, language);
      setActiveQuest(quest);
      setQuestTimeLeft(quest.duration_minutes * 60);
      broadcastQuest(quest);
      router.push('/(tabs)/map');
    } catch (e) {
      alert(t('questGenFailed'));
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = () => {
    if (pinCode.length === 4) ctxJoinRoom(pinCode);
    else alert(t('validPinAlert'));
  };

  const createRoom = () => {
    const pin = ctxCreateRoom();
    alert(t('roomCreatedAlert', { pin }));
  };

  // ─── Lobby View (when in a room) ────────────────────────────────────────────

  if (globalRoomPin) {
    const playersArr = Object.values(players);
    const teamA = playersArr.filter(p => p.team === 'A');
    const teamB = playersArr.filter(p => p.team === 'B');

    return (
      <View style={[lobbyStyles.container, { paddingTop: insets.top + 20 }]}>
        <Text style={lobbyStyles.title}>{t('lobby', { pin: globalRoomPin })}</Text>
        <Text style={lobbyStyles.sub}>{t('waitingExplorers')}</Text>

        <View style={lobbyStyles.teamsRow}>
          <TouchableOpacity onPress={() => joinTeam('A')} style={[lobbyStyles.teamBtn, { borderColor: '#3498db55', backgroundColor: '#3498db11' }]}>
            <Shield size={20} color="#3498db" />
            <Text style={[lobbyStyles.teamText, { color: '#3498db' }]}>Alpha ({teamA.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => joinTeam('B')} style={[lobbyStyles.teamBtn, { borderColor: '#e74c3c55', backgroundColor: '#e74c3c11' }]}>
            <Sword size={20} color="#e74c3c" />
            <Text style={[lobbyStyles.teamText, { color: '#e74c3c' }]}>Omega ({teamB.length})</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={lobbyStyles.playerList} contentContainerStyle={{ padding: 16, gap: 14 }}>
          {playersArr.map((p, i) => (
            <View key={p.id} style={lobbyStyles.playerRow}>
              <View style={[lobbyStyles.playerAvatar, {
                borderColor: p.team === 'A' ? '#3498db' : p.team === 'B' ? '#e74c3c' : '#c9a84c'
              }]}>
                <Text style={{ color: p.team === 'A' ? '#3498db' : p.team === 'B' ? '#e74c3c' : '#c9a84c', fontWeight: 'bold' }}>
                  {p.name.charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={lobbyStyles.playerName}>{p.name}</Text>
                <Text style={[lobbyStyles.playerTeam, { color: p.team === 'A' ? '#3498db' : p.team === 'B' ? '#e74c3c' : '#9a9483' }]}>
                  {!p.team || p.team === 'Solo' ? 'FREE AGENT' : `TEAM ${p.team}`}
                </Text>
              </View>
              {i === 0 && (
                <View style={lobbyStyles.hostBadge}><Text style={lobbyStyles.hostText}>HOST</Text></View>
              )}
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[lobbyStyles.startBtn, loading && { opacity: 0.6 }]}
          onPress={startGroupQuest}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={lobbyStyles.startBtnText}>{t('startExpedition')}</Text>
          }
          <ChevronRight size={18} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity onPress={ctxLeaveRoom} style={lobbyStyles.leaveBtn}>
          <Text style={lobbyStyles.leaveBtnText}>{t('leaveRoom')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Main Hub ────────────────────────────────────────────────────────────────

  const cfg = DIFFICULTY_CONFIG[difficulty];

  return (
    <View style={[hubStyles.container, { paddingTop: insets.top + 20 }]}>
      <Text style={hubStyles.title}>{t('questHub')}</Text>
      <Text style={hubStyles.sub}>{t('questHubDesc')}</Text>

      {/* Active Quest Banner */}
      {activeQuest ? (
        <View style={hubStyles.activeBanner}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={hubStyles.activeBannerLabel}>Current Quest</Text>
            <Text style={hubStyles.activeBannerTitle} numberOfLines={1}>{activeQuest.title}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/map')} style={hubStyles.activeBannerBtn}>
            <Text style={hubStyles.activeBannerBtnText}>View Map</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={startSoloQuest}
          disabled={loading}
          style={hubStyles.dailyBounty}
        >
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={hubStyles.dailyLabel}>{t('dailyBounty')} • 500 XP</Text>
            <Text style={hubStyles.dailyTitle}>The Pantheon's Shadow Walk</Text>
          </View>
          <View style={hubStyles.dailyArrow}>
            <ChevronRight size={20} color="#000" />
          </View>
        </TouchableOpacity>
      )}

      {/* Tab Bar */}
      <View style={tabStyles.bar}>
        {TABS.map((tab, idx) => {
          const active = activeTab === idx;
          return (
            <TouchableOpacity key={tab.id} style={[tabStyles.btn, active && tabStyles.btnActive]} onPress={() => onTabPress(idx)}>
              <tab.Icon size={16} color={active ? '#000' : '#9a9483'} />
              <Text style={[tabStyles.label, active && tabStyles.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Swipeable Tab Content */}
      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        data={TABS}
        keyExtractor={item => item.id}
        getItemLayout={(_, index) => ({ length: width - 40, offset: (width - 40) * index, index })}
        renderItem={({ item, index }) => (
          <View style={{ width: width - 40 }}>

            {/* ── SOLO TAB ── */}
            {index === 0 && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 120 }}>
                {/* Difficulty selector */}
                <View style={soloStyles.diffRow}>
                  {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map(d => {
                    const c = DIFFICULTY_CONFIG[d];
                    const active = difficulty === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        onPress={() => setDifficulty(d)}
                        style={[soloStyles.diffBtn, active && { borderColor: c.color, backgroundColor: c.color + '18' }]}
                      >
                        <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
                        <Text style={[soloStyles.diffLabel, active && { color: c.color }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Quest Card */}
                <View style={soloStyles.card}>
                  <View style={[soloStyles.cardIcon, { backgroundColor: cfg.color }]}>
                    <MapPin size={32} color="#000" />
                  </View>
                  <Text style={soloStyles.cardTitle}>{t('localExplorer')}</Text>
                  <Text style={[soloStyles.cardXP, { color: cfg.color }]}>
                    +{cfg.xp} XP · {cfg.duration} min
                  </Text>
                  <Text style={soloStyles.cardDesc}>{t('localExplorerDesc')}</Text>
                  <TouchableOpacity
                    disabled={loading}
                    style={[soloStyles.startBtn, { backgroundColor: cfg.color, opacity: loading ? 0.7 : 1 }]}
                    onPress={startSoloQuest}
                  >
                    {loading
                      ? <ActivityIndicator color="#000" />
                      : <Text style={soloStyles.startBtnText}>{t('generateStartSolo')}</Text>
                    }
                    <View style={soloStyles.arrowCircle}>
                      <ChevronRight size={18} color="#000" />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Active quest task list */}
                {activeQuest && (
                  <View style={soloStyles.taskList}>
                    <Text style={soloStyles.taskListTitle}>Active Tasks</Text>
                    {activeQuest.tasks.map(task => (
                      <View key={task.id} style={soloStyles.taskRow}>
                        <View style={[soloStyles.taskDot, task.completed && soloStyles.taskDotDone]}>
                          {task.completed && <CheckCircle size={10} color="#000" />}
                        </View>
                        <Text style={[soloStyles.taskText, task.completed && soloStyles.taskTextDone]}>
                          {task.description}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Quiz Shortcut */}
                <TouchableOpacity style={soloStyles.quizCard} onPress={() => router.push('/quiz')}>
                  <View style={soloStyles.quizIcon}><Text style={{ fontSize: 22 }}>🧠</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={soloStyles.quizTitle}>Monument Quiz</Text>
                    <Text style={soloStyles.quizSub}>Test your knowledge · Earn XP</Text>
                  </View>
                  <ChevronRight size={18} color="#c9a84c" />
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── GROUP / 1v1 TABS ── */}
            {(index === 1 || index === 2) && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 120 }}>
                {/* Join Room */}
                <View style={multiStyles.card}>
                  <View style={multiStyles.cardIcon}><KeyRound size={30} color="#c9a84c" /></View>
                  <Text style={multiStyles.cardTitle}>{t('joinExpedition')}</Text>
                  <Text style={multiStyles.cardDesc}>{t('joinExpeditionDesc')}</Text>
                  <View style={multiStyles.pinRow}>
                    <TextInput
                      style={multiStyles.pinInput}
                      placeholder="****"
                      placeholderTextColor="#444"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={pinCode}
                      onChangeText={setPinCode}
                    />
                    <TouchableOpacity style={multiStyles.joinBtn} onPress={joinRoom}>
                      <Text style={multiStyles.joinBtnText}>{t('join')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Divider */}
                <View style={multiStyles.divider}>
                  <View style={multiStyles.dividerLine} />
                  <Text style={multiStyles.dividerText}>OR</Text>
                  <View style={multiStyles.dividerLine} />
                </View>

                {/* Create Room */}
                <View style={multiStyles.card}>
                  <Text style={multiStyles.cardTitle}>{item.id === 'group' ? t('hostGroup') : t('host1v1')}</Text>
                  <Text style={multiStyles.cardDesc}>{t('hostGroupDesc')}</Text>
                  <TouchableOpacity style={multiStyles.createBtn} onPress={createRoom}>
                    <Text style={multiStyles.createBtnText}>{t('createNewRoom')}</Text>
                    <ChevronRight size={18} color="#c9a84c" />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

          </View>
        )}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hubStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e', paddingHorizontal: 20 },
  title: { color: '#c9a84c', fontSize: 38, fontFamily: 'Georgia', marginBottom: 4, lineHeight: 44 },
  sub: { color: '#9a9483', fontSize: 14, marginBottom: 20 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 20, padding: 16, marginBottom: 20 },
  activeBannerLabel: { color: '#c9a84c', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
  activeBannerTitle: { color: '#f0ece0', fontSize: 17, fontFamily: 'Georgia' },
  activeBannerBtn: { backgroundColor: '#c9a84c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  activeBannerBtnText: { color: '#000', fontWeight: '900', fontSize: 11 },
  dailyBounty: { backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dailyLabel: { color: '#c9a84c', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
  dailyTitle: { color: '#f0ece0', fontSize: 17, fontFamily: 'Georgia' },
  dailyArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
});

const tabStyles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 22, padding: 5, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 18, gap: 6 },
  btnActive: { backgroundColor: '#c9a84c', shadowColor: '#c9a84c', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  label: { color: '#9a9483', fontWeight: '900', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5 },
  labelActive: { color: '#000' },
});

const soloStyles = StyleSheet.create({
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a' },
  diffLabel: { color: '#9a9483', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 28, padding: 24, borderWidth: 1, borderColor: '#2a2a2a', gap: 8 },
  cardIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardTitle: { color: '#f0ece0', fontSize: 26, fontFamily: 'Georgia' },
  cardXP: { fontSize: 12, fontWeight: '800' },
  cardDesc: { color: '#9a9483', fontSize: 14, lineHeight: 22, marginBottom: 8 },
  startBtn: { height: 58, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  arrowCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  taskList: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  taskListTitle: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  taskDotDone: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  taskText: { flex: 1, color: '#f0ece0', fontSize: 13, lineHeight: 20 },
  taskTextDone: { color: '#555', textDecorationLine: 'line-through' },
  quizCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, gap: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  quizIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center' },
  quizTitle: { color: '#f0ece0', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  quizSub: { color: '#9a9483', fontSize: 11, fontWeight: '600' },
});

const multiStyles = StyleSheet.create({
  card: { backgroundColor: '#1a1a1a', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: '#2a2a2a', gap: 12 },
  cardIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  cardTitle: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia' },
  cardDesc: { color: '#9a9483', fontSize: 13, lineHeight: 20 },
  pinRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  pinInput: { flex: 1, height: 60, backgroundColor: '#111', borderRadius: 18, borderWidth: 1, borderColor: '#2a2a2a', color: '#f0ece0', fontSize: 28, textAlign: 'center', letterSpacing: 12, fontFamily: 'monospace' },
  joinBtn: { backgroundColor: '#c9a84c', height: 60, paddingHorizontal: 24, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: '#000', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  dividerText: { color: '#333', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', height: 58, borderRadius: 18, paddingHorizontal: 20 },
  createBtnText: { color: '#c9a84c', fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 },
});

const lobbyStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e', paddingHorizontal: 20 },
  title: { color: '#c9a84c', fontSize: 30, fontFamily: 'Georgia', marginBottom: 4 },
  sub: { color: '#9a9483', fontSize: 14, marginBottom: 20 },
  teamsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  teamBtn: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 6 },
  teamText: { fontWeight: '800', fontSize: 13 },
  playerList: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, marginBottom: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  playerName: { color: '#f0ece0', fontSize: 14, fontWeight: '700' },
  playerTeam: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 },
  hostBadge: { backgroundColor: '#c9a84c', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  hostText: { color: '#000', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  startBtn: { height: 58, backgroundColor: '#c9a84c', borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  leaveBtn: { alignItems: 'center', paddingBottom: 24 },
  leaveBtnText: { color: '#ff4444', fontWeight: '700', fontSize: 14 },
});