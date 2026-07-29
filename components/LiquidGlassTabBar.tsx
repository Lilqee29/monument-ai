/**
 * LiquidGlassTabBar — Custom bottom tab bar matching the liquid glass reference.
 *
 * Layout: [  Gallery | Map | Quest | Leaderboard  ]   (Camera)
 *          └──────── pill (4 tabs) ──────────┘     circle
 *
 * - iOS 26+: native liquid glass via UIBlurEffectStyleSystemChromeMaterial
 * - iOS < 26: expo-blur BlurView with translucent dark background
 * - Android: translucent dark background with slight blur
 */
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  Image as ImageIcon,
  Map,
  Swords,
  Trophy,
  User,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Tab config (order matters — left to right inside pill) ─────────
interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  /** If true, renders as separate circle outside the pill */
  isPrimary?: boolean;
}

const TABS: TabItem[] = [
  { key: 'gallery', label: 'Gallery', icon: ImageIcon },
  { key: 'map', label: 'Map', icon: Map },
  { key: 'quest', label: 'Quest', icon: Swords },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'index', label: 'Camera', icon: Camera, isPrimary: true },
];

// ─── Platform constants ─────────────────────────────────────────────
const PILL_HEIGHT = 64;
const PILL_RADIUS = 32;
const CIRCLE_SIZE = 56;
const TAB_BAR_BOTTOM = Platform.OS === 'ios' ? 28 : 16;
const TAB_GAP = 4;

// ─── Detect iOS 26+ liquid glass availability ───────────────────────
function supportsLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  const majorVersion = typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);
  return majorVersion >= 26;
}

// ─── Props ──────────────────────────────────────────────────────────
interface LiquidGlassTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export function LiquidGlassTabBar({ state, descriptors, navigation }: LiquidGlassTabBarProps) {
  const isLiquidGlass = supportsLiquidGlass();

  // Map expo-router state routes to our tab config
  const routes = state.routes;

  // Separate primary (camera) from pill tabs
  const pillTabs = TABS.filter(t => !t.isPrimary);
  const primaryTab = TABS.find(t => t.isPrimary);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.row}>
        {/* ─── Pill bar (4 tabs) ────────────────────────── */}
        <View style={styles.pillWrapper}>
          <BlurView
            intensity={isLiquidGlass ? 80 : 60}
            tint="dark"
            style={styles.pillBlur}
          >
            <View style={styles.pillInner}>
              {pillTabs.map((tab) => {
                const routeIndex = routes.findIndex((r: any) => r.name === tab.key);
                const isFocused = state.index === routeIndex;
                const color = isFocused ? '#ffffff' : 'rgba(255,255,255,0.5)';

                const onPress = () => {
                  if (process.env.EXPO_OS === 'ios') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  if (!isFocused) {
                    navigation.navigate(tab.key);
                  }
                };

                const IconComponent = tab.icon;

                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={onPress}
                    activeOpacity={0.7}
                    style={[
                      styles.tabItem,
                      isFocused && styles.tabItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected: isFocused }}
                  >
                    <IconComponent size={22} color={color} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>
        </View>

        {/* ─── Camera circle (separate, primary action) ──── */}
        {primaryTab && (() => {
          const routeIndex = routes.findIndex((r: any) => r.name === primaryTab.key);
          const isFocused = state.index === routeIndex;
          const color = isFocused ? '#c9a84c' : '#ffffff';

          const onPress = () => {
            if (process.env.EXPO_OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            if (!isFocused) {
              navigation.navigate(primaryTab.key);
            }
          };

          const IconComponent = primaryTab.icon;

          return (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.7}
              style={[
                styles.circleButton,
                isFocused && styles.circleButtonActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={primaryTab.label}
              accessibilityState={{ selected: isFocused }}
            >
              <IconComponent size={26} color={color} />
            </TouchableOpacity>
          );
        })()}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Pill (4 tabs) ──
  pillWrapper: {
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    // Subtle border for the glass edge
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillBlur: {
    borderRadius: PILL_RADIUS,
    backgroundColor: Platform.OS === 'android' ? 'rgba(20,20,20,0.85)' : undefined,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_HEIGHT,
    paddingHorizontal: 6,
    gap: TAB_GAP,
  },

  // ── Individual tab inside pill ──
  tabItem: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Camera circle (separate) ──
  circleButton: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Glass border
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(30,30,30,0.7)',
  },
  circleButtonActive: {
    backgroundColor: 'rgba(201,168,76,0.2)',
    borderColor: 'rgba(201,168,76,0.4)',
  },
});
