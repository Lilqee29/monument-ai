import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  StatusBar,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useLanguage } from '@/lib/languageContext';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, RadialGradient, Stop, G } from 'react-native-svg';
import { Camera, Compass, BookOpen, ChevronRight, Star, Send } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

const SCENES = [
  {
    id: 0,
    eyebrow: 'DISCOVER',
    icon: Camera,
    accentColor: '#c9a84c',
    bgFrom: '#0a101f',
    bgTo: '#000000',
  },
  {
    id: 1,
    eyebrow: 'ASK ANYTHING',
    icon: Compass,
    accentColor: '#c9a84c',
    bgFrom: '#0e1c0d',
    bgTo: '#000000',
  },
  {
    id: 2,
    eyebrow: 'COLLECT',
    icon: BookOpen,
    accentColor: '#c9a84c',
    bgFrom: '#1c110e',
    bgTo: '#000000',
  },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);

function PaperPlaneScene({ accentColor, index }: { accentColor: string, index: number }) {
  const progress = useSharedValue(0);
  const planeRotate = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(300, withTiming(1, { duration: 2500, easing: Easing.bezier(0.4, 0, 0.2, 1) }));
  }, [index, progress]);

  const pathData = "M 40,150 Q 150,50 300,150 T 560,150";
  
  const planeStyle = useAnimatedStyle(() => {
    // Simplified fly-along logic for React Native
    const translateX = progress.value * (width - 100);
    const translateY = Math.sin(progress.value * Math.PI * 2) * 50;
    return {
      transform: [
        { translateX: 40 + translateX },
        { translateY: 100 + translateY },
        { rotate: `${Math.sin(progress.value * Math.PI * 2) * 30}deg` }
      ],
      opacity: withTiming(progress.value > 0 ? 1 : 0, { duration: 500 })
    };
  });

  return (
    <View style={styles.planeSceneContainer}>
      <Svg width={width} height={300} viewBox={`0 0 ${width} 300`}>
        <Path
          d={`M 40,150 Q ${width/2},50 ${width-40},150`}
          fill="none"
          stroke={accentColor}
          strokeWidth="1.5"
          strokeDasharray="6 6"
          opacity={0.2}
        />
        <AnimatedPath
          d={`M 40,150 Q ${width/2},50 ${width-40},150`}
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
          strokeDasharray="1000"
          strokeDashoffset={1000} // Set static to avoid hook error
          opacity={0.4}
        />
      </Svg>
      <Animated.View style={[styles.planeWrapper, planeStyle]}>
        <Send size={32} color={accentColor} style={{ transform: [{ rotate: '45deg' }] }} />
      </Animated.View>
    </View>
  );
}

function FloatingParticle({ emoji, x, y, delay, duration, size }: any) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(0.25, { duration: 600 }));
    translateY.value = withDelay(delay, withRepeat(withSequence(withTiming(-20, { duration, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })), -1, true));
    rotate.value = withDelay(delay, withRepeat(withSequence(withTiming(-10, { duration: duration * 1.2, easing: Easing.inOut(Easing.sin) }), withTiming(10, { duration: duration * 1.2, easing: Easing.inOut(Easing.sin) })), -1, true));
  }, [delay, duration, opacity, rotate, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[{ position: 'absolute', left: x, top: y, fontSize: size }, style]}>
      {emoji}
    </Animated.Text>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current;
        return (
          <View 
            key={i} 
            style={[
              styles.dot, 
              { 
                backgroundColor: '#c9a84c', 
                width: isActive ? 28 : 8, 
                opacity: isActive ? 1 : 0.2 
              }
            ]} 
          />
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const scene = SCENES[index];
  const IconComponent = scene.icon;

  const handleNext = useCallback(async () => {
    if (isTransitioning) return;
    if (index < SCENES.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setIndex((i) => i + 1);
        setIsTransitioning(false);
      }, 150);
    } else {
      if (user) {
        await user.update({ 
          unsafeMetadata: { 
            ...user.unsafeMetadata, 
            onboardingCompleted: true 
          } 
        });
      }
      router.replace('/(tabs)');
    }
  }, [index, isTransitioning, user, router]);

  const handleSkip = useCallback(async () => {
    if (user) {
      await user.update({ 
        unsafeMetadata: { 
          ...user.unsafeMetadata, 
          onboardingCompleted: true 
        } 
      });
    }
    router.replace('/(tabs)');
  }, [user, router]);

  const particles = [
    { emoji: '🏛️', x: 30, y: height * 0.1, delay: 0, duration: 3000, size: 24 },
    { emoji: '✨', x: width - 50, y: height * 0.15, delay: 500, duration: 2500, size: 20 },
    { emoji: '🌍', x: width * 0.4, y: height * 0.05, delay: 200, duration: 3500, size: 22 },
    { emoji: '📜', x: 40, y: height * 0.6, delay: 800, duration: 2800, size: 18 },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient 
        colors={[scene.bgFrom, scene.bgTo]} 
        style={StyleSheet.absoluteFill} 
      />
      
      {particles.map((p, i) => (
        <FloatingParticle key={`p-${index}-${i}`} {...p} />
      ))}

      <View style={styles.topSection}>
        <PaperPlaneScene accentColor={scene.accentColor} index={index} />
        <View style={styles.iconBadge}>
          <View style={[styles.iconRingOuter, { borderColor: `${scene.accentColor}30` }]}>
            <View style={[styles.iconRingInner, { borderColor: `${scene.accentColor}60` }]}>
              <View style={[styles.iconCore, { backgroundColor: `${scene.accentColor}20` }]}>
                <IconComponent size={32} color={scene.accentColor} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <Animated.View 
        key={`content-${index}`}
        style={styles.contentCard}
      >
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowLine, { backgroundColor: scene.accentColor }]} />
          <Text style={[styles.eyebrow, { color: scene.accentColor }]}>
            {t(`onboardingEyebrow${index + 1}` as any)}
          </Text>
          <View style={[styles.eyebrowLine, { backgroundColor: scene.accentColor }]} />
        </View>
        
        <Text style={styles.title}>{t(`onboardingTitle${index + 1}` as any)}</Text>
        <Text style={styles.sub}>{t(`onboardingDesc${index + 1}` as any)}</Text>
        
        <View style={styles.starsRow}>
          {[0, 1, 2, 3, 4].map((s) => (
            <Star key={s} size={12} color={scene.accentColor} fill={scene.accentColor} />
          ))}
          <Text style={[styles.starsLabel, { color: scene.accentColor }]}>OFFICIAL GUIDE</Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <ProgressDots total={SCENES.length} current={index} />
        
        <View style={styles.footerActions}>
          <TouchableOpacity 
            onPress={handleSkip} 
            style={styles.skipBtn}
            disabled={index === SCENES.length - 1}
          >
            {index < SCENES.length - 1 && (
              <Text style={styles.skipText}>{t('skip')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleNext} 
            style={[styles.nextBtn, { backgroundColor: scene.accentColor }]}
            activeOpacity={0.8}
          >
            <Text style={styles.nextBtnText}>
              {index === SCENES.length - 1 ? t('getStarted').split(' ')[0] : t('next')}
            </Text>
            <View style={styles.nextBtnIcon}>
              <ChevronRight size={18} color="#000" strokeWidth={3} />
            </View>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.counter}>
          {index + 1} / {SCENES.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topSection: {
    height: height * 0.45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planeSceneContainer: {
    position: 'absolute',
    width: '100%',
    height: 300,
    top: height * 0.05,
  },
  planeWrapper: {
    position: 'absolute',
  },
  iconBadge: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRingOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRingInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCard: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 20,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  eyebrowLine: {
    flex: 1,
    height: 1,
    opacity: 0.3,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    marginHorizontal: 15,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 36,
    color: '#fff',
    fontFamily: 'PlayfairDisplay_700Bold',
    lineHeight: 44,
    marginBottom: 15,
  },
  sub: {
    fontSize: 16,
    color: '#a1a1a1',
    lineHeight: 24,
    marginBottom: 25,
    fontFamily: 'Inter_400Regular',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 8,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 50,
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: 25,
  },
  dot: {
    height: 4,
    borderRadius: 2,
    marginRight: 6,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: {
    paddingVertical: 10,
    minWidth: 60,
  },
  skipText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 25,
    paddingRight: 15,
    borderRadius: 30,
  },
  nextBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nextBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  counter: {
    textAlign: 'center',
    marginTop: 20,
    color: '#333',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
});