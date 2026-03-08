import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, Dimensions, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Brain, Zap, Clock, Star, RefreshCw, AlertCircle } from 'lucide-react-native';
import { OPENROUTER_API_URL, OPENROUTER_API_KEY, TEXT_MODELS } from '@/lib/ai';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  q: string;
  options: string[];
  correct: number;
  category: string;
  difficulty: 'novice' | 'scholar' | 'historian';
  fun_fact?: string;
}

// ─── Modes ────────────────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'novice' as const,
    label: 'Novice',
    emoji: '🌱',
    questions: 10,
    timePerQ: 25,
    xpPerQ: 30,
    color: '#4ecdc4',
    description: 'Famous landmarks & easy history',
    difficultyPrompt: "very easy, suitable for casual tourists with no specialist knowledge. Focus on the world's most famous monuments (Eiffel Tower, Colosseum, Taj Mahal, Pyramids, etc.) and very well-known historical facts.",
  },
  {
    id: 'scholar' as const,
    label: 'Scholar',
    emoji: '📚',
    questions: 20,
    timePerQ: 15,
    xpPerQ: 60,
    color: '#c9a84c',
    description: 'Architecture, context & real dates',
    difficultyPrompt: 'intermediate, requiring genuine knowledge of architectural styles, construction techniques, key architects, specific dates, and monument details beyond just their names and locations.',
  },
  {
    id: 'historian' as const,
    label: 'Historian',
    emoji: '🏛️',
    questions: 30,
    timePerQ: 10,
    xpPerQ: 100,
    color: '#ff6b6b',
    description: 'Expert: obscure facts & engineering',
    difficultyPrompt: 'hard to expert level, covering obscure historical facts, precise engineering details, lesser-known architects, exact construction dates, structural innovations, building materials, and deep cultural context that only a specialist would know.',
  },
];

type Mode = typeof MODES[number];
type Screen = 'menu' | 'loading' | 'quiz' | 'result';

// ─── AI Question Generator ────────────────────────────────────────────────────

async function generateQuestions(mode: Mode): Promise<Question[]> {
  const count = mode.questions;

  const systemPrompt = `You are an expert quiz master specializing in world architecture, monuments, history, and cultural heritage.

Generate exactly ${count} multiple-choice quiz questions that are ${mode.difficultyPrompt}

STRICT RULES:
- Each question must have exactly 4 answer options
- Exactly one option is correct — the others must be plausible but wrong
- Wrong answers should NOT be obviously ridiculous — make players think
- Spread questions across these categories: Architecture, History, Monuments, Engineering, Art & Culture, Urban Planning
- No two questions on the same specific topic
- fun_fact must be a genuinely surprising 1-sentence fact related to the question topic
- The "correct" field is the 0-based index (0, 1, 2, or 3) of the correct option

Respond ONLY with a valid JSON array. No markdown fences, no explanation, just the raw JSON array.

[
  {
    "q": "Full question text ending with ?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 2,
    "category": "Architecture",
    "difficulty": "${mode.id}",
    "fun_fact": "One genuinely surprising related fact in one sentence."
  }
]`;

  for (const model of TEXT_MODELS) {
    try {
      console.log(`[QUIZ] Trying ${model} for ${count} questions...`);

      const response = await fetch(OPENROUTER_API_URL, {
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
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Generate ${count} ${mode.id}-level quiz questions about world monuments and architecture. Return ONLY the JSON array, nothing else.`,
            },
          ],
          max_tokens: count * 200,
          temperature: 0.9,
        }),
      });

      if (!response.ok) {
        console.warn(`[QUIZ] ${model} HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const raw: string = data.choices?.[0]?.message?.content ?? '';

      // Strip <think> blocks (some models emit these) and markdown fences
      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      let parsed: Question[] | null = null;

      try {
        const obj = JSON.parse(cleaned);
        // Handle both array and { questions: [...] } shapes
        parsed = Array.isArray(obj) ? obj : (obj.questions ?? null);
      } catch {
        // Try to extract array from anywhere in the string
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* skip */ }
        }
      }

      if (!parsed) {
        console.warn(`[QUIZ] ${model} parse failed`);
        continue;
      }

      // Validate each entry
      const valid = parsed.filter(q =>
        typeof q.q === 'string' &&
        q.q.length > 5 &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correct === 'number' &&
        q.correct >= 0 &&
        q.correct <= 3
      );

      const minRequired = Math.floor(count * 0.7);
      if (valid.length >= minRequired) {
        console.log(`[QUIZ] ✓ ${model} → ${valid.length} valid questions`);
        return valid.slice(0, count);
      }

      console.warn(`[QUIZ] ${model} only gave ${valid.length} valid questions (need ${minRequired})`);
    } catch (err: any) {
      console.error(`[QUIZ] ${model} error:`, err.message);
    }
  }

  throw new Error('All AI models failed. Please check your connection and try again.');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuizScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<Mode>(MODES[0]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFact, setShowFact] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);
  const [genError, setGenError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ─── Start: generate questions via AI ──────────────────────────────────────
  const startQuiz = async (m: Mode) => {
    setMode(m);
    setGenError(null);
    setScreen('loading');
    try {
      const qs = await generateQuestions(m);
      setQuestions(qs);
      setCurrentIdx(0);
      setScore(0);
      setSelected(null);
      setShowFact(false);
      setScreen('quiz');
    } catch (e: any) {
      setGenError(e.message ?? 'Failed to generate questions.');
      setScreen('menu');
    }
  };

  // ─── Timer per question ─────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'quiz') return;

    setTimeLeft(mode.timePerQ);
    setShowFact(false);
    progressAnim.setValue(1);
    fadeAnim.setValue(0);

    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
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

  // ─── Answer handler ─────────────────────────────────────────────────────────
  const handleAnswer = (optionIdx: number | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const current = questions[currentIdx];
    if (!current || selected !== null) return;

    const isCorrect = optionIdx !== null && optionIdx === current.correct;
    setSelected(optionIdx ?? -1); // -1 = timed out
    if (isCorrect) setScore(s => s + 1);
    setShowFact(true);

    setTimeout(() => {
      setShowFact(false);
      if (currentIdx + 1 >= questions.length) {
        setScreen('result');
      } else {
        setCurrentIdx(i => i + 1);
        setSelected(null);
      }
    }, 1500);
  };

  const totalXP = score * mode.xpPerQ;
  const accuracy = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  // ─── LOADING SCREEN ─────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
        <View style={s.loadingCard}>
          <View style={[s.loadingIconBg, { backgroundColor: mode.color + '22', borderColor: mode.color + '44' }]}>
            <Brain size={40} color={mode.color} />
          </View>
          <Text style={[s.loadingTitle, { color: mode.color }]}>Generating Quiz</Text>
          <Text style={s.loadingMode}>{mode.emoji}  {mode.label} · {mode.questions} Questions</Text>
          <ActivityIndicator size="large" color={mode.color} style={{ marginTop: 20 }} />
          <Text style={s.loadingHint}>AI is crafting unique questions for this session…</Text>
          <Text style={s.loadingHint2}>Every game is different</Text>
        </View>
      </View>
    );
  }

  // ─── MENU ────────────────────────────────────────────────────────────────────
  if (screen === 'menu') {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ChevronLeft size={24} color="#c9a84c" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Monument Quiz</Text>
            <Text style={s.headerSub}>AI-Generated · Unique Every Session</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
          <View style={s.heroIcon}>
            <Brain size={44} color="#c9a84c" />
          </View>
          <Text style={s.heroText}>Fresh questions every time you play</Text>
          <Text style={s.heroSub}>Architecture · History · Monuments · Engineering · Art & Culture</Text>

          {genError && (
            <View style={s.errorBanner}>
              <AlertCircle size={16} color="#ff6b6b" />
              <Text style={s.errorText}>{genError}</Text>
            </View>
          )}

          <Text style={s.sectionLabel}>Choose Difficulty</Text>

          {MODES.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[s.diffCard, mode.id === m.id && { borderColor: m.color, backgroundColor: m.color + '11' }]}
              onPress={() => setMode(m)}
              activeOpacity={0.75}
            >
              <View style={[s.diffEmoji, { backgroundColor: m.color + '22' }]}>
                <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.diffLabel, mode.id === m.id && { color: m.color }]}>{m.label}</Text>
                <Text style={[s.diffDesc, { color: m.color + 'cc' }]}>{m.description}</Text>
                <Text style={s.diffMeta}>{m.questions} q · {m.timePerQ}s each · {m.xpPerQ} XP/correct</Text>
              </View>
              <View style={[s.diffCheck, mode.id === m.id && { backgroundColor: m.color }]}>
                {mode.id === m.id && <Text style={{ color: '#000', fontWeight: '900', fontSize: 11 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}

          {/* Max XP comparison */}
          <View style={s.xpInfoRow}>
            {MODES.map(m => (
              <View key={m.id} style={[s.xpInfoBox, { borderColor: m.color + '33' }, mode.id === m.id && { borderColor: m.color, backgroundColor: m.color + '0a' }]}>
                <Text style={{ fontSize: 18, marginBottom: 4 }}>{m.emoji}</Text>
                <Text style={[s.xpInfoVal, { color: m.color }]}>{(m.questions * m.xpPerQ).toLocaleString()}</Text>
                <Text style={s.xpInfoLabel}>Max XP</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.startBtn, { backgroundColor: mode.color }]}
            onPress={() => startQuiz(mode)}
            activeOpacity={0.8}
          >
            <Brain size={18} color="#000" />
            <Text style={s.startBtnText}>Generate & Start {mode.label}</Text>
            <View style={s.xpBadge}>
              <Zap size={10} color="rgba(0,0,0,0.5)" />
              <Text style={s.xpBadgeText}>Up to {(mode.questions * mode.xpPerQ).toLocaleString()} XP</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── RESULT ─────────────────────────────────────────────────────────────────
  if (screen === 'result') {
    const grade =
      accuracy >= 90 ? { emoji: '🏆', label: 'Legendary', color: '#ffd700' } :
      accuracy >= 70 ? { emoji: '🥇', label: 'Expert',    color: '#c9a84c' } :
      accuracy >= 50 ? { emoji: '📚', label: 'Scholar',   color: '#4ecdc4' } :
                       { emoji: '💡', label: 'Keep Going', color: '#9a9483' };

    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top, padding: 28 }]}>
        <Text style={{ fontSize: 76, marginBottom: 10 }}>{grade.emoji}</Text>
        <Text style={[s.resultGrade, { color: grade.color }]}>{grade.label}</Text>
        <Text style={s.resultScore}>{score}/{questions.length}</Text>
        <Text style={s.resultAccuracy}>{accuracy}% Accuracy</Text>

        <View style={s.resultXPRow}>
          <Zap size={18} color="#c9a84c" />
          <Text style={s.resultXPText}>+{totalXP.toLocaleString()} XP Earned</Text>
        </View>

        <View style={s.resultGrid}>
          <View style={s.resultStat}>
            <Text style={[s.resultStatVal, { color: '#00c864' }]}>{score}</Text>
            <Text style={s.resultStatLabel}>Correct</Text>
          </View>
          <View style={s.resultStat}>
            <Text style={[s.resultStatVal, { color: '#ff4444' }]}>{questions.length - score}</Text>
            <Text style={s.resultStatLabel}>Missed</Text>
          </View>
          <View style={s.resultStat}>
            <Text style={[s.resultStatVal, { color: mode.color }]}>{accuracy}%</Text>
            <Text style={s.resultStatLabel}>Score</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.startBtn, { backgroundColor: mode.color, width: '100%', marginTop: 28 }]}
          onPress={() => startQuiz(mode)}
        >
          <RefreshCw size={16} color="#000" />
          <Text style={[s.startBtnText, { marginLeft: 6 }]}>New Game (Fresh Questions)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.outlineBtn, { width: '100%', marginTop: 10 }]}
          onPress={() => setScreen('menu')}
        >
          <Text style={s.outlineBtnText}>Change Difficulty</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 18, padding: 10 }} onPress={() => router.back()}>
          <Text style={{ color: '#9a9483', fontWeight: '700', fontSize: 13 }}>← Back to Quest Hub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── QUIZ ────────────────────────────────────────────────────────────────────
  const currentQ = questions[currentIdx];
  if (!currentQ) return null;

  return (
    <Animated.View style={[s.container, { paddingTop: insets.top, opacity: fadeAnim }]}>
      {/* Header: back + progress pills + timer */}
      <View style={q.header}>
        <TouchableOpacity
          onPress={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen('menu'); }}
          style={s.backBtn}
        >
          <ChevronLeft size={22} color="#c9a84c" />
        </TouchableOpacity>

        {/* Mini progress dots */}
        <View style={q.progressPills}>
          {questions.slice(0, 30).map((_, i) => (
            <View
              key={i}
              style={[
                q.pill,
                i < currentIdx && { backgroundColor: '#c9a84c' },
                i === currentIdx && { backgroundColor: mode.color, width: 16, borderRadius: 3 },
              ]}
            />
          ))}
        </View>

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={q.content}>
        {/* Category + count */}
        <View style={q.metaRow}>
          <View style={[q.categoryTag, { backgroundColor: mode.color + '22', borderColor: mode.color + '44' }]}>
            <Text style={[q.categoryText, { color: mode.color }]}>{currentQ.category ?? 'General'}</Text>
          </View>
          <Text style={q.qCount}>{currentIdx + 1} / {questions.length}</Text>
        </View>

        {/* Question text */}
        <Text style={q.question}>{currentQ.q}</Text>

        {/* Options */}
        <View style={q.options}>
          {currentQ.options.map((opt, i) => {
            const isSelected  = selected === i;
            const isCorrect   = currentQ.correct === i;
            const showResult  = selected !== null;

            let bg        = '#1a1a1a';
            let border    = '#2a2a2a';
            let textColor = '#f0ece0';
            let numBg     = 'transparent';

            if (showResult) {
              if (isCorrect) {
                bg = 'rgba(0,200,100,0.1)';
                border = 'rgba(0,200,100,0.5)';
                textColor = '#00c864';
                numBg = 'rgba(0,200,100,0.2)';
              } else if (isSelected) {
                bg = 'rgba(255,50,50,0.1)';
                border = 'rgba(255,50,50,0.5)';
                textColor = '#ff4444';
                numBg = 'rgba(255,50,50,0.2)';
              } else {
                bg = '#111';
                border = '#1a1a1a';
                textColor = '#3a3a3a';
              }
            }

            const label = showResult
              ? (isCorrect ? '✓' : isSelected ? '✗' : ['A', 'B', 'C', 'D'][i])
              : ['A', 'B', 'C', 'D'][i];

            return (
              <TouchableOpacity
                key={i}
                disabled={selected !== null}
                onPress={() => handleAnswer(i)}
                style={[q.option, { backgroundColor: bg, borderColor: border }]}
                activeOpacity={0.72}
              >
                <View style={[q.optNum, { backgroundColor: numBg, borderColor: border }]}>
                  <Text style={[q.optNumText, { color: textColor }]}>{label}</Text>
                </View>
                <Text style={[q.optText, { color: textColor }]}>{opt}</Text>
                {showResult && isCorrect && <Star size={14} color="#00c864" fill="#00c864" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Fun fact reveal */}
        {showFact && currentQ.fun_fact && (
          <View style={[q.factCard, { borderColor: mode.color + '44', backgroundColor: mode.color + '0d' }]}>
            <Text style={[q.factLabel, { color: mode.color }]}>💡 Did you know?</Text>
            <Text style={q.factText}>{currentQ.fun_fact}</Text>
          </View>
        )}

        {/* Timeout notice */}
        {selected === -1 && (
          <View style={q.timeoutCard}>
            <Text style={q.timeoutText}>⏱  Time's up — correct answer is highlighted above.</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#c9a84c', fontSize: 20, fontFamily: 'Georgia' },
  headerSub: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  heroIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  heroText: { color: '#f0ece0', fontSize: 16, fontFamily: 'Georgia', textAlign: 'center' },
  heroSub: { color: '#9a9483', fontSize: 11, textAlign: 'center', marginTop: -8, lineHeight: 18 },
  sectionLabel: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,107,107,0.08)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)', borderRadius: 14, padding: 14 },
  errorText: { color: '#ff6b6b', fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },
  diffCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', gap: 14 },
  diffEmoji: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  diffLabel: { color: '#f0ece0', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  diffDesc: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
  diffMeta: { color: '#9a9483', fontSize: 10, fontWeight: '600' },
  diffCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  xpInfoRow: { flexDirection: 'row', gap: 10 },
  xpInfoBox: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  xpInfoVal: { fontSize: 18, fontFamily: 'Georgia', fontWeight: '700' },
  xpInfoLabel: { color: '#9a9483', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  startBtn: { borderRadius: 20, padding: 18, alignItems: 'center', gap: 8, flexDirection: 'row', justifyContent: 'center' },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 15 },
  outlineBtn: { borderRadius: 20, padding: 16, alignItems: 'center', backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  outlineBtnText: { color: '#f0ece0', fontWeight: '700', fontSize: 14 },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  xpBadgeText: { color: 'rgba(0,0,0,0.6)', fontWeight: '700', fontSize: 11 },
  loadingCard: { alignItems: 'center', padding: 32, gap: 10, maxWidth: 300 },
  loadingIconBg: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  loadingTitle: { fontSize: 24, fontFamily: 'Georgia' },
  loadingMode: { color: '#9a9483', fontSize: 14, fontWeight: '700' },
  loadingHint: { color: '#555', fontSize: 12, marginTop: 10, textAlign: 'center' },
  loadingHint2: { color: '#333', fontSize: 10, textAlign: 'center', fontStyle: 'italic' },
  resultGrade: { fontSize: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 4 },
  resultScore: { color: '#f0ece0', fontSize: 54, fontFamily: 'Georgia' },
  resultAccuracy: { color: '#9a9483', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  resultXPRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', marginBottom: 24 },
  resultXPText: { color: '#c9a84c', fontWeight: '900', fontSize: 16 },
  resultGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  resultStat: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  resultStatVal: { fontSize: 22, fontFamily: 'Georgia' },
  resultStatLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
});

const q = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  progressPills: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, flexWrap: 'wrap', paddingHorizontal: 4 },
  pill: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2a2a2a' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)' },
  timerBadgeDanger: { backgroundColor: 'rgba(255,50,50,0.12)', borderColor: 'rgba(255,50,50,0.35)' },
  timerText: { color: '#c9a84c', fontWeight: '900', fontSize: 12 },
  timerBg: { height: 3, backgroundColor: '#1a1a1a', marginHorizontal: 20, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  timerFill: { height: '100%', borderRadius: 2 },
  content: { padding: 20, gap: 14, paddingBottom: 60 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  qCount: { color: '#444', fontSize: 11, fontWeight: '800' },
  question: { color: '#f0ece0', fontSize: 19, fontFamily: 'Georgia', lineHeight: 28 },
  options: { gap: 10, marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, gap: 14 },
  optNum: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optNumText: { fontWeight: '900', fontSize: 13 },
  optText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  factCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  factLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  factText: { color: '#c8c4b8', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  timeoutCard: { backgroundColor: 'rgba(255,50,50,0.07)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,50,50,0.2)' },
  timeoutText: { color: '#ff6b6b', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});