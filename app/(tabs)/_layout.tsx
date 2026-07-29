import { Tabs } from 'expo-router';
import React from 'react';
import { Camera, Image, Map as MapIcon, User, BookOpen, Swords } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '@/lib/languageContext';
import { breadcrumb } from '@/lib/crashDebug';

breadcrumb('T00', 'tabs/_layout.tsx loaded');

export default function TabLayout() {
  breadcrumb('T01', 'TabLayout render');
  const colorScheme = useColorScheme();
  const { t } = useLanguage();
  const scheme = (colorScheme ?? 'dark') as 'light' | 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[scheme].tint,
        tabBarInactiveTintColor: Colors[scheme].icon,
        headerShown: false,
        tabBarButton: HapticTab as any,
        tabBarStyle: {
          backgroundColor: Colors[scheme].background,
          borderTopWidth: 0,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          height: 88,
          paddingTop: 10,
          paddingBottom: 28,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('camera'),
          tabBarIcon: ({ color }) => <Camera size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          
          title: t('gallery'),
          tabBarIcon: ({ color }) => <Image size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('map'),
          tabBarIcon: ({ color }) => <MapIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quest"
        options={{
          title: t('quest'),
          tabBarIcon: ({ color }) => <Swords size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="passport"
        options={{
          href: null,
          title: 'Passport',
          tabBarIcon: ({ color }) => <BookOpen size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
