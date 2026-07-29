import { Tabs } from 'expo-router';
import React from 'react';
import { LiquidGlassTabBar } from '@/components/LiquidGlassTabBar';
import { useLanguage } from '@/lib/languageContext';
import { breadcrumb } from '@/lib/crashDebug';

export default function TabLayout() {
  breadcrumb('T01', 'TabLayout render');
  const { t } = useLanguage();

  return (
    <Tabs
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      {/* Order here doesn't determine visual order — LiquidGlassTabBar handles that */}
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
          title: t('profile'),
        }}
      />
    </Tabs>
  );
}
