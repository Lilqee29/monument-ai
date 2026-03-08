import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Brain, Zap, Clock, Star } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface Question {
  q: string;
  options: string[];
  correct: number;
  category: string;
}

const ALL_QUESTIONS: Question[] = [
  { q: "What architectural style features pointed arches & flying buttresses?", options: ["Baroque", "Gothic", "Romanesque", "Brutalist"], correct: 1, category: "Architecture" },
  { q: "The Pantheon's dome was revolutionary because it was built with?", options: ["Marble slabs", "Granite", "Unreinforced concrete", "Fired bricks"], correct: 2, category: "Architecture" },
  { q: "Which style is defined by grandeur, ornate detail and curved forms?", options: ["Modernist", "Gothic", "Baroque", "Art Deco"], correct: 2, category: "Architecture" },
  { q: "Haussmannian buildings in Paris are recognizable by?", options: ["Red brick facades", "Uniform stone facades with wrought-iron balconies", "Glass curtain walls", "Timber framing"], correct: 1, category: "Architecture" },
  { q: "The term 'brutalism' comes from the French word for?", options: ["Brutal", "Raw concrete", "Strong", "Heavy"], correct: 1, category: "Architecture" },
  { q: "In which city is the Blue Mosque located?", options: ["Cairo", "Tehran", "Istanbul", "Baghdad"], correct: 2, category: "History" },
  { q: "The Colosseum was originally called the?", options: ["Forum Magnum", "Amphitheatrum Flavium", "Arena Roma", "Circus Maximus"], correct: 1, category: "History" },
  { q: "Which pharaoh ordered the construction of the Great Pyramid?", options: ["Ramesses II", "Tutankhamun", "Khufu", "Cleopatra"], correct: 2, category: "History" },
  { q: "The Parthenon was dedicated to which goddess?", options: ["Hera", "Aphrodite", "Artemis", "Athena"], correct: 3, category: "History" },
  { q: "Machu Picchu was built by the?", options: ["Aztecs", "Mayans", "Incas", "Olmecs"], correct: 2, category: "History" },
  { q: "Who designed the Eiffel Tower?", options: ["Hector Guimard", "Le Corbusier", "Gustave Eiffel", "Auguste Perret"], correct: 2, category: "Monuments" },
  { q: "The Sagrada Família in Barcelona was designed by?", options: ["Rafael Moneo", "Antoni Gaudí", "Enric Miralles", "Santiago Calatrava"], correct: 1, category: "Monuments" },
  { q: "The Taj Mahal was built as a mausoleum for?", options: ["Akbar's mother", "Shah Jahan's wife", "Babur", "Mumtaz's daughter"], correct: 1, category: "Monuments" },
  { q: "The Sydney Opera House architect was?", options: ["Frank Lloyd Wright", "Oscar Niemeyer", "Jørn Utzon", "Tadao Ando"], correct: 2, category: "Monuments" },
  { q: "Which monument is located in Agra, India?", options: ["Qutb Minar", "Red Fort", "Taj Mahal", "Hawa Mahal"], correct: 2, category: "Monuments" },
  { q: "The Great Wall of China was primarily built to?", options: ["Collect taxes", "Mark territory", "Defend against northern invasions", "Connect trade routes"], correct: 2, category: "Engineering" },
  { q: "The Burj Khalifa's record height is supported by?", options: ["Concrete core + steel exoskeleton", "Buttressed core structural system", "Tensile cables", "Earthquake-resistant frame"], correct: 1, category: "Engineering" },
  { q: "Stonehenge stones were transported from?", options: ["Local quarries", "Wales, 200 miles away", "France", "Ireland"], correct: 1, category: "Engineering" },
];

const MODES = [
  { id: 'novice',    label: 'Novice',    emoji: '🌱', questions: 5,  timePerQ: 20, xpPerQ: 30,  color: '#4ecdc4' },
  { id: 'scholar',   label: 'Scholar',   emoji: '📚', questions: 8,  timePerQ: 15, xpPerQ: 60,  color: '#c9a84c' },
  { id: 'historian', label: 'Historian', emoji: '🏛️', questions: 12, timePerQ: 10, xpPerQ: 100, color: '#ff6b6b' },
] as const;

type Mode = typeof MODES[number];
type Screen = 'menu' | 'quiz' | 'result';

export default function QuizScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<Mode>(MODES[0]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(20);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  const startQuiz = (m: Mode) => {
    setMode(m);
    const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, m.questions);
    setQuestions(shuffled);
    setCurrentIdx(0);
    setScore(0);
    setSelected(null);
    setTimeLeft(m.timePerQ);
    setScreen('quiz');
  };

  useEffect(() => {
    if (screen !== 'quiz') return;
    setTimeLeft(mode.timePerQ);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: mode.timePerQ * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIdx, screen]);

  const handleAnswer = (optionIdx: number | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const current = questions[currentIdx];
    if (!current) return;
    const isCorrect = optionIdx === current.correct;
    setSelected(optionIdx);
    if (isCorrect) setScore(s => s + 1);

    setTimeout(() => {
      if (currentIdx + 1 >= questions.length) {
        setScreen('result');
      } else {
        setCurrentIdx(i => i + 1);
        setSelected(null);
      }
    }, 900);
  };

  const totalXP = score * mode.xpPerQ;
  const accuracy = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  // ─── MENU ───────────────────────────────────────────────────────────────────

  if (screen === 'menu') {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ChevronLeft size={24} color="#c9a84c" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Monument Quiz</Text>
            <Text style={s.headerSub}>Test your world heritage knowledge</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
          <View style={s.heroIcon}>
            <Brain size={44} color="#c9a84c" />
          </View>
          <Text style={s.heroText}>18 Questions • 4 Categories</Text>
          <Text style={s.heroSub}>Architecture • History • Monuments • Engineering</Text>

          <Text style={s.sectionLabel}>Choose Difficulty</Text>

          {MODES.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[s.diffCard, mode.id === m.id && { borderColor: m.color, backgroundColor: m.color + '11' }]}
              onPress={() => setMode(m)}
            >
              <View style={[s.diffEmoji, { backgroundColor: m.color + '22' }]}>
                <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.diffLabel, mode.id === m.id && { color: m.color }]}>{m.label}</Text>
                <Text style={s.diffMeta}>{m.questions} questions · {m.timePerQ}s each · {m.xpPerQ} XP each</Text>
              </View>
              <View style={[s.diffCheck, mode.id === m.id && { backgroundColor: m.color }]}>
                {mode.id === m.id && <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[s.startBtn, { backgroundColor: mode.color }]} onPress={() => startQuiz(mode)}>
            <Text style={s.startBtnText}>Start {mode.label} Quiz 🚀</Text>
            <View style={s.xpBadge}>
              <Text style={s.xpBadgeText}>Up to {mode.questions * mode.xpPerQ} XP</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── RESULT ─────────────────────────────────────────────────────────────────

  if (screen === 'result') {
    const grade = accuracy >= 90 ? '🏆' : accuracy >= 70 ? '🥇' : accuracy >= 50 ? '📚' : '💡';
    return (
      <View style={[s.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', padding: 28 }]}>
        <Text style={{ fontSize: 80, marginBottom: 12 }}>{grade}</Text>
        <Text style={s.resultScore}>{score}/{questions.length}</Text>
        <Text style={s.resultAccuracy}>{accuracy}% Accuracy</Text>

        <View style={s.resultXPRow}>
          <Zap size={18} color="#c9a84c" />
          <Text style={s.resultXPText}>+{totalXP} XP Earned</Text>
        </View>

        <View style={s.resultGrid}>
          <View style={s.resultStat}>
            <Text style={s.resultStatVal}>{score}</Text>
            <Text style={s.resultStatLabel}>Correct</Text>
          </View>
          <View style={s.resultStat}>
            <Text style={s.resultStatVal}>{questions.length - score}</Text>
            <Text style={s.resultStatLabel}>Missed</Text>
          </View>
          <View style={s.resultStat}>
            <Text style={s.resultStatVal}>{accuracy}%</Text>
            <Text style={s.resultStatLabel}>Score</Text>
          </View>
        </View>

        <TouchableOpacity style={[s.startBtn, { backgroundColor: mode.color, width: '100%', marginTop: 24 }]} onPress={() => setScreen('menu')}>
          <Text style={s.startBtnText}>Play Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16, padding: 12 }} onPress={() => router.back()}>
          <Text style={{ color: '#9a9483', fontWeight: '700', fontSize: 13 }}>← Back to Quest Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── QUIZ ────────────────────────────────────────────────────────────────────

  const currentQ = questions[currentIdx];
  if (!currentQ) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={q.header}>
        <TouchableOpacity onPress={() => setScreen('menu')} style={s.backBtn}>
          <ChevronLeft size={22} color="#c9a84c" />
        </TouchableOpacity>
        <Text style={q.progress}>{currentIdx + 1} / {questions.length}</Text>
        <View style={[q.timerBadge, timeLeft <= 5 && q.timerBadgeDanger]}>
          <Clock size={12} color={timeLeft <= 5 ? '#ff4444' : '#c9a84c'} />
          <Text style={[q.timerText, timeLeft <= 5 && { color: '#ff4444' }]}>{timeLeft}s</Text>
        </View>
      </View>

      {/* Timer bar */}
      <View style={q.timerBg}>
        <Animated.View style={[q.timerFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: timeLeft <= 5 ? '#ff4444' : mode.color,
        }]} />
      </View>

      <View style={q.content}>
        {/* Category */}
        <View style={[q.categoryTag, { backgroundColor: mode.color + '22', borderColor: mode.color + '44' }]}>
          <Text style={[q.categoryText, { color: mode.color }]}>{currentQ.category}</Text>
        </View>

        {/* Question */}
        <Text style={q.question}>{currentQ.q}</Text>

        {/* Options */}
        <View style={q.options}>
          {currentQ.options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = currentQ.correct === i;
            const showResult = selected !== null;

            let bg = '#1a1a1a', border = '#2a2a2a', textColor = '#f0ece0';
            if (showResult) {
              if (isCorrect) { bg = 'rgba(0,200,100,0.12)'; border = 'rgba(0,200,100,0.5)'; textColor = '#00c864'; }
              else if (isSelected) { bg = 'rgba(255,50,50,0.12)'; border = 'rgba(255,50,50,0.5)'; textColor = '#ff4444'; }
              else { bg = '#111'; border = '#1e1e1e'; textColor = '#555'; }
            }

            return (
              <TouchableOpacity
                key={i}
                disabled={selected !== null}
                onPress={() => handleAnswer(i)}
                style={[q.option, { backgroundColor: bg, borderColor: border }]}
              >
                <View style={[q.optNum, { borderColor: border }]}>
                  <Text style={[q.optNumText, { color: textColor }]}>{['A', 'B', 'C', 'D'][i]}</Text>
                </View>
                <Text style={[q.optText, { color: textColor }]}>{opt}</Text>
                {showResult && isCorrect && <Star size={16} color="#00c864" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#c9a84c', fontSize: 20, fontFamily: 'Georgia' },
  headerSub: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  heroText: { color: '#f0ece0', fontSize: 16, fontFamily: 'Georgia', textAlign: 'center' },
  heroSub: { color: '#9a9483', fontSize: 11, textAlign: 'center', marginTop: -8 },
  sectionLabel: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 },
  diffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 14 },
  diffEmoji: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  diffLabel: { color: '#f0ece0', fontSize: 15, fontWeight: '800', marginBottom: 3 },
  diffMeta: { color: '#9a9483', fontSize: 10, fontWeight: '600' },
  diffCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  startBtn: { borderRadius: 20, padding: 18, alignItems: 'center', gap: 6 },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  xpBadge: { backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  xpBadgeText: { color: 'rgba(0,0,0,0.6)', fontWeight: '700', fontSize: 11 },
  resultScore: { color: '#c9a84c', fontSize: 52, fontFamily: 'Georgia' },
  resultAccuracy: { color: '#9a9483', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  resultXPRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', marginBottom: 24 },
  resultXPText: { color: '#c9a84c', fontWeight: '900', fontSize: 16 },
  resultGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  resultStat: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  resultStatVal: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia' },
  resultStatLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});

const q = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  progress: { color: '#f0ece0', fontSize: 14, fontWeight: '800' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)' },
  timerBadgeDanger: { backgroundColor: 'rgba(255,50,50,0.12)', borderColor: 'rgba(255,50,50,0.35)' },
  timerText: { color: '#c9a84c', fontWeight: '900', fontSize: 12 },
  timerBg: { height: 3, backgroundColor: '#1a1a1a', marginHorizontal: 20, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
  timerFill: { height: '100%', borderRadius: 2 },
  content: { flex: 1, padding: 20, gap: 16 },
  categoryTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  question: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia', lineHeight: 30 },
  options: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  optNum: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optNumText: { fontWeight: '900', fontSize: 13 },
  optText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
});