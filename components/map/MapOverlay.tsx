import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Eye, Navigation, Compass, Swords, Menu } from 'lucide-react-native';
import { useLanguage } from '@/lib/languageContext';
import { useQuest } from '@/lib/questContext';
import { useRouter } from 'expo-router';
import type { DynamicQuest } from '@/lib/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopHUDProps {
  sessionsCount: number;
  countriesVisited: number;
  showExplored: boolean;
  onToggleExplored: () => void;
  activeQuest: DynamicQuest | null;
  questTimeLeft: number;
  showPlayback: boolean;
}

interface StatsHUDProps {
  discovered: number;
  total: number;
  countries: number;
}

interface MapControlsProps {
  showControls: boolean;
  onToggleControls: () => void;
  onCenterPress: () => void;
  onLocatePress: () => void;
  mapType: 'standard' | 'satellite';
  onToggleMapType: () => void;
  hasActiveQuest: boolean;
  bottomInset: number;
}

// ─── Format time helper ───────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Top HUD ──────────────────────────────────────────────────────────────────

export function TopHUD({
  sessionsCount,
  countriesVisited,
  showExplored,
  onToggleExplored,
  activeQuest,
  questTimeLeft,
  showPlayback,
}: TopHUDProps) {
  const { t } = useLanguage();
  const { setActiveQuest } = useQuest();

  if (showPlayback || activeQuest) return null;

  return (
    <BlurView intensity={75} tint="dark" style={styles.topHUDInner}>
      <View>
        <Text style={styles.topHUDTitle}>{t('explorationMap')}</Text>
        <Text style={styles.topHUDSub}>
          {t('sitesCharted', { count: sessionsCount.toString(), countries: countriesVisited.toString(), countryLabel: countriesVisited === 1 ? t('country') : t('countries') })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onToggleExplored}
        style={[styles.toggleBtn, showExplored && styles.toggleBtnActive]}
      >
        <Eye size={14} color={showExplored ? '#0e0e0e' : '#c9a84c'} />
        <Text style={[styles.toggleBtnText, showExplored && styles.toggleBtnTextActive]}>
          {showExplored ? t('coverageOn') : t('coverageOff')}
        </Text>
      </TouchableOpacity>
    </BlurView>
  );
}

// ─── Quest HUD (active quest display) ────────────────────────────────────────

interface QuestHUDProps {
  activeQuest: DynamicQuest;
  questTimeLeft: number;
}

export function QuestHUD({ activeQuest, questTimeLeft }: QuestHUDProps) {
  const { t } = useLanguage();
  const { setActiveQuest } = useQuest();

  return (
    <BlurView intensity={90} tint="dark" style={[styles.topHUDInner, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View>
          <Text style={[styles.topHUDTitle, { color: '#c9a84c' }]}>{activeQuest.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.questTimeText}>
              {formatTime(questTimeLeft)} {t('remaining')}
            </Text>
            <View style={{ backgroundColor: '#c9a84c20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: '#c9a84c40' }}>
              <Text style={{ color: '#c9a84c', fontSize: 9, fontWeight: '800' }}>+{activeQuest.total_xp} XP</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => setActiveQuest(null)} style={styles.cancelQuestBtn}>
          <Text style={{ color: '#fff', fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
      
      <View style={{ gap: 8 }}>
        {activeQuest.tasks.map((task) => (
          <QuestTaskRow key={task.id} task={task} />
        ))}
      </View>
    </BlurView>
  );
}

// ─── Quest Task Row ───────────────────────────────────────────────────────────

function QuestTaskRow({ task }: { task: DynamicQuest['tasks'][number] }) {
  const [showHint, setShowHint] = React.useState(false);
  
  return (
    <View>
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => setShowHint(!showHint)}
        style={styles.questTaskRow}
      >
        <View style={[styles.taskCheckbox, task.completed && styles.taskCheckboxActive]}>
          {task.completed && <Text style={{ color: '#000', fontSize: 10 }}>✓</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
            <Text style={{ fontWeight: 'bold', color: '#c9a84c' }}>[{task.type.toUpperCase()}] </Text>
            {task.description}
          </Text>
        </View>
      </TouchableOpacity>
      
      {showHint && !task.completed && (
        <View style={{ paddingLeft: 24, paddingTop: 4, paddingBottom: 8 }}>
          <Text style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic', marginBottom: 2 }}>
            🔍 {task.hint}
          </Text>
          <Text style={{ color: '#888', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📍 {task.location_hint}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Stats HUD (bottom) ──────────────────────────────────────────────────────

export function StatsHUD({ discovered, total, countries }: StatsHUDProps) {
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  const { t } = useLanguage();

  return (
    <BlurView intensity={70} tint="dark" style={styles.statsHUD}>
      <View style={styles.progressBarTrack}>
        <Animated.View style={[styles.progressBarFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{discovered}</Text>
          <Text style={styles.statLabel}>{t('discovered')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{total - discovered}</Text>
          <Text style={styles.statLabel}>{t('remaining')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{countries}</Text>
          <Text style={styles.statLabel}>{t('nations')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#c9a84c' }]}>{pct}%</Text>
          <Text style={styles.statLabel}>{t('coverage')}</Text>
        </View>
      </View>
    </BlurView>
  );
}

// ─── Map Controls ─────────────────────────────────────────────────────────────

export function MapControls({
  showControls,
  onToggleControls,
  onCenterPress,
  onLocatePress,
  mapType,
  onToggleMapType,
  hasActiveQuest,
  bottomInset,
}: MapControlsProps) {
  const router = useRouter();

  return (
    <View style={[styles.controls, { bottom: bottomInset + 210 }]}>
      {showControls && (
        <View style={{ gap: 10, marginBottom: 10 }}>
          <TouchableOpacity onPress={onLocatePress} style={styles.controlBtn}>
            <Navigation size={20} color="#c9a84c" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onCenterPress} style={[styles.controlBtn, styles.controlBtnGold]}>
            <Compass size={22} color="#0e0e0e" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleMapType} style={styles.controlBtn}>
            <Text style={{ fontSize: 18 }}>🗺️</Text>
          </TouchableOpacity>
          {!hasActiveQuest && (
            <TouchableOpacity 
              onPress={() => router.push('/(tabs)/quest')} 
              style={[styles.controlBtn, styles.questBtn]}
            >
              <Swords size={20} color="#0e0e0e" />
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity 
        onPress={onToggleControls} 
        style={[styles.controlBtn, { backgroundColor: showControls ? '#c9a84c' : '#1a1a1a', borderColor: showControls ? '#c9a84c' : 'rgba(255,255,255,0.1)' }]}
      >
        <Menu size={22} color={showControls ? '#0e0e0e' : '#f0ece0'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Top HUD
  topHUDInner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHUDTitle: {
    color: '#f0ece0',
    fontSize: 16,
    fontFamily: 'Georgia',
  },
  topHUDSub: {
    color: '#c9a84c',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c9a84c66',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
  },
  toggleBtnText: {
    color: '#c9a84c',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  toggleBtnTextActive: {
    color: '#0e0e0e',
  },
  questTimeText: {
    color: '#f0ece0',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  cancelQuestBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  taskCheckboxActive: {
    backgroundColor: '#c9a84c',
  },
  taskText: {
    flex: 1,
    color: '#f0ece0',
    fontSize: 12,
    lineHeight: 18,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },

  // Stats HUD
  statsHUD: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#c9a84c',
    borderRadius: 2,
    shadowColor: '#c9a84c',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#f0ece0',
    fontSize: 18,
    fontFamily: 'Georgia',
    lineHeight: 20,
  },
  statLabel: {
    color: '#9a9483',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Controls
  controls: {
    position: 'absolute',
    right: 16,
    gap: 10,
    alignItems: 'center',
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  controlBtnGold: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
    shadowColor: '#c9a84c',
    shadowOpacity: 0.4,
  },
  questBtn: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOpacity: 0.6,
    shadowRadius: 15,
  },
});
