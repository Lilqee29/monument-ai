/**
 * LiquidGlassTabBar — Custom floating pill with sliding tab indicator.
 *
 * Pure React Native Animated — no native modules, no crashes on sideload.
 * Sliding highlight gives a liquid/glass feel of fluid motion between tabs.
 *
 * Apple HIG:
 *   - 48pt minimum touch targets
 *   - 24pt SF Symbol icons
 *   - Dark translucent material (no native glass on sideload)
 *
 * Layout:   [ ◉ Gallery | ◎ Map | ◎ Quest | ◎ Leaderboard ]   (Camera)
 * Slider moves smoothly between active tabs with spring animation.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
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
const PILL_HEIGHT = 56;
const PILL_RADIUS = 28;
const CIRCLE_SIZE = 56;
const ICON_SIZE = 24;
const TAB_MIN_TOUCH = 48;
const TAB_BAR_BOTTOM = Platform.OS === 'ios' ? 28 : 16;
const GAP = 10;
const INDICATOR_HEIGHT = 40;
const INDICATOR_RADIUS = 20;

// ─── Props ──────────────────────────────────────────────────────────
interface LiquidGlassTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export function LiquidGlassTabBar({ state, descriptors, navigation }: LiquidGlassTabBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [pillWidth, setPillWidth] = useState(SCREEN_WIDTH * 0.72);
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const slideX = useRef(new Animated.Value(0)).current;

  const routes = state.routes;
  const activeIndex = Math.max(
    0,
    PILL_TABS.findIndex((t) => {
      const idx = routes.findIndex((r: any) => r.name === t.key);
      return idx === state.index;
    })
  );
  const tabWidth = pillWidth / PILL_TABS.length;

  // ── Slide the indicator to the active tab ──
  useEffect(() => {
    const targetX = activeIndex * tabWidth;
    Animated.spring(slideX, {
      toValue: targetX,
      damping: 18,
      stiffness: 200,
      mass: 0.8,
      useNativeDriver: false,
    }).start();
  }, [activeIndex, tabWidth]);

  const animatePill = (toOpacity: number, toScale: number) => {
    Animated.parallel([
      Animated.timing(pillOpacity, {
        toValue: toOpacity,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pillScale, {
        toValue: toScale,
        duration: 250,
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
    [navigation],
  );

  const onPillLayout = (e: LayoutChangeEvent) => {
    setPillWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ─── Pill (dark translucent) ──── */}
      <Animated.View
        style={[
          styles.pillAnimated,
          { opacity: pillOpacity, transform: [{ scale: pillScale }] },
        ]}
        pointerEvents={expanded ? 'none' : 'auto'}
      >
        <View style={styles.pillBackground}>
          {/* ── Sliding highlight indicator ── */}
          <Animated.View
            style={[
              styles.slider,
              {
                width: tabWidth,
                transform: [{ translateX: slideX }],
              },
            ]}
          />

          {/* ── Tab items ── */}
          <View style={styles.pillInner} onLayout={onPillLayout}>
            {PILL_TABS.map((tab) => {
              const routeIndex = routes.findIndex((r: any) => r.name === tab.key);
              const isFocused = state.index === routeIndex;
              const color = isFocused ? '#ffffff' : 'rgba(255,255,255,0.5)';

              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleTabPress(tab.key)}
                  activeOpacity={0.7}
                  style={styles.tabItem}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isFocused }}
                >
                  <tab.icon size={ICON_SIZE} color={color} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Animated.View>

      {/* ─── Circle (camera / back) ──── */}
      <View
        style={[
          styles.circle,
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
      </View>
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
  pillBackground: {
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 22, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    position: 'relative',
  },

  // ── Sliding highlight ──
  slider: {
    position: 'absolute',
    top: (PILL_HEIGHT - INDICATOR_HEIGHT) / 2,
    left: 0,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.15)',
    // Subtle inner glow
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // ── Tab item ──
  tabItem: {
    flex: 1,
    height: TAB_MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  // ── Circle ──
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: 'rgba(20, 20, 22, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  circleDefault: {},
  circleActive: {
    backgroundColor: 'rgba(201, 168, 76, 0.3)',
    borderColor: 'rgba(201, 168, 76, 0.5)',
  },
  circleButton: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
