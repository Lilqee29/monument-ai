/**
 * LiquidGlassTabBar — Custom floating pill with real iOS 26 Liquid Glass.
 *
 * Follows Apple HIG:
 *   - 44pt minimum touch targets (we use 48pt)
 *   - 25pt SF Symbol icons
 *   - UIGlassEffect .regular on iOS 26+
 *   - Solid dark fallback on older platforms
 *
 * Layout:   [  Gallery | Map | Quest | Leaderboard  ]   (Camera)
 * Expanded:                                           ( ← )
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  Image as ImageIcon,
  Map,
  Swords,
  Trophy,
  ChevronLeft,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Tab config ──────────────────────────────────────────────────────
interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

const PILL_TABS: TabItem[] = [
  { key: 'gallery', label: 'Gallery', icon: ImageIcon },
  { key: 'map', label: 'Map', icon: Map },
  { key: 'quest', label: 'Quest', icon: Swords },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

// ─── Apple HIG dimensions ────────────────────────────────────────────
const PILL_HEIGHT = 56;           // generous but not bloated
const PILL_RADIUS = 28;           // fully rounded ends (height/2)
const CIRCLE_SIZE = 52;           // slightly smaller than pill
const ICON_SIZE = 24;             // Apple HIG standard SF Symbol size
const TAB_MIN_TOUCH = 48;         // Apple HIG minimum touch target
const TAB_BAR_BOTTOM = Platform.OS === 'ios' ? 28 : 16;
const GAP = 10;                   // gap between pill and circle
const ANIM_DURATION = 250;

// ─── Props ──────────────────────────────────────────────────────────
interface LiquidGlassTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

// Glass wrapper: LiquidGlassView on iOS 26+, solid fallback otherwise
function GlassWrapper({ children, style }: { children: React.ReactNode; style?: any }) {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        effect="regular"
        interactive={false}
        colorScheme="dark"
        style={style}
      >
        {children}
      </LiquidGlassView>
    );
  }
  return <View style={[style, styles.solidFallback]}>{children}</View>;
}

export function LiquidGlassTabBar({ state, descriptors, navigation }: LiquidGlassTabBarProps) {
  const [expanded, setExpanded] = useState(false);
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const pillScale = useRef(new Animated.Value(1)).current;

  const routes = state.routes;

  const animatePill = (toOpacity: number, toScale: number) => {
    Animated.parallel([
      Animated.timing(pillOpacity, {
        toValue: toOpacity,
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pillScale, {
        toValue: toScale,
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCameraPress = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setExpanded(true);
    animatePill(0, 0.9);
    navigation.navigate('index');
  }, [navigation]);

  const handleBackPress = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpanded(false);
    animatePill(1, 1);
    navigation.navigate('gallery');
  }, [navigation]);

  const handleTabPress = useCallback(
    (tabKey: string) => {
      if (process.env.EXPO_OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      navigation.navigate(tabKey);
    },
    [navigation]
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ─── Pill (liquid glass) ──── */}
      <Animated.View
        style={[
          styles.pillAnimated,
          { opacity: pillOpacity, transform: [{ scale: pillScale }] },
        ]}
        pointerEvents={expanded ? 'none' : 'auto'}
      >
        <GlassWrapper style={styles.pillGlass}>
          <View style={styles.pillInner}>
            {PILL_TABS.map((tab) => {
              const routeIndex = routes.findIndex((r: any) => r.name === tab.key);
              const isFocused = state.index === routeIndex;
              const color = isFocused ? '#ffffff' : 'rgba(255,255,255,0.5)';

              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleTabPress(tab.key)}
                  activeOpacity={0.7}
                  style={[
                    styles.tabItem,
                    isFocused && styles.tabItemActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isFocused }}
                >
                  <tab.icon size={ICON_SIZE} color={color} />
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassWrapper>
      </Animated.View>

      {/* ─── Circle (camera / back) ──── */}
      <GlassWrapper
        style={[
          styles.circleGlass,
          expanded ? styles.circleActive : styles.circleDefault,
        ]}
      >
        <TouchableOpacity
          onPress={expanded ? handleBackPress : handleCameraPress}
          activeOpacity={0.7}
          style={styles.circleButton}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Back' : 'Camera'}
        >
          {expanded ? (
            <ChevronLeft size={ICON_SIZE} color="#ffffff" />
          ) : (
            <Camera size={ICON_SIZE} color="#ffffff" />
          )}
        </TouchableOpacity>
      </GlassWrapper>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: TAB_BAR_BOTTOM,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: GAP,
    paddingHorizontal: 20,
    zIndex: 100,
  },

  // ── Pill ──
  pillAnimated: {
    flex: 1,
    maxWidth: SCREEN_WIDTH * 0.72,
  },
  pillGlass: {
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: PILL_HEIGHT,
  },
  tabItem: {
    height: TAB_MIN_TOUCH,
    width: TAB_MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TAB_MIN_TOUCH / 2,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  // ── Circle ──
  circleGlass: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: 'hidden',
  },
  circleDefault: {},
  circleActive: {},
  circleButton: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Fallback (pre-iOS 26 / Android) ──
  solidFallback: {
    backgroundColor: 'rgba(30,30,30,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
