/**
 * Tab Layout — Custom floating pill tab bar with camera expand/collapse.
 */
import React from 'react';
import { Tabs } from 'expo-router';
import { LiquidGlassTabBar } from '@/components/LiquidGlassTabBar';
import { useLanguage } from '@/lib/languageContext';

export default function TabLayout() {
  const { t } = useLanguage();

  return (
    <Tabs
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('camera'),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: t('gallery'),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('map'),
        }}
      />
      <Tabs.Screen
        name="quest"
        options={{
          title: t('quest'),
        }}
      />
      <Tabs.Screen
        name="passport"
        options={{
          href: null,
          title: 'Passport',
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: t('leaderboard'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: t('profile'),
        }}
      />
    </Tabs>
  );
}
