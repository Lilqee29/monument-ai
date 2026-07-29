/**
 * RELICA Diagnostic Entry Point
 *
 * This entry point does NOT call require.context('./app') on startup.
 * Instead, it boots a pure, lightweight React Native screen and tests loading
 * native modules ONE BY ONE via dynamic import() inside try/catch blocks.
 *
 * If a module crashes, we capture the exact module name on screen BEFORE
 * loading the rest of the application.
 */

import React, { useState } from 'react';
import {
  AppRegistry,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { ExpoRoot } from 'expo-router';

function DiagnosticApp() {
  const [logs, setLogs] = useState<string[]>(['[DIAGNOSTICS] App booted successfully!']);
  const [testing, setTesting] = useState(false);
  const [appReady, setAppReady] = useState(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`]);
  };

  const runModuleTests = async () => {
    setTesting(true);
    addLog('Starting native module audit...');

    const modules = [
      { name: 'expo-secure-store', load: () => import('expo-secure-store') },
      { name: 'expo-location', load: () => import('expo-location') },
      { name: 'expo-camera', load: () => import('expo-camera') },
      { name: 'expo-media-library', load: () => import('expo-media-library') },
      { name: 'expo-notifications', load: () => import('expo-notifications') },
      { name: 'expo-image-picker', load: () => import('expo-image-picker') },
      { name: 'react-native-reanimated', load: () => import('react-native-reanimated') },
      { name: 'react-native-maps', load: () => import('react-native-maps') },
      { name: '@clerk/clerk-expo', load: () => import('@clerk/clerk-expo') },
      { name: '@supabase/supabase-js', load: () => import('@supabase/supabase-js') },
    ];

    for (const mod of modules) {
      try {
        addLog(`Testing import: ${mod.name}...`);
        await mod.load();
        addLog(`✅ ${mod.name}: OK`);
      } catch (e: any) {
        addLog(`❌ ${mod.name} FAILED: ${e?.message ?? String(e)}`);
      }
    }

    addLog('Audit complete! Attempting full Expo Router load...');
    setTesting(false);
  };

  const launchFullApp = () => {
    try {
      addLog('Loading require.context("./app")...');
      setAppReady(true);
    } catch (e: any) {
      addLog(`❌ require.context FAILED: ${e?.message ?? String(e)}`);
    }
  };

  if (appReady) {
    // @ts-ignore require.context is provided by Metro
    const ctx = require.context('./app');
    return <ExpoRoot context={ctx} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#050505' }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ color: '#c9a84c', fontSize: 24, fontWeight: 'bold', fontFamily: 'serif', marginBottom: 4 }}>
          RELICA DIAGNOSTICS
        </Text>
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
          Diagnostic runner to pinpoint startup crash source.
        </Text>

        <ScrollView
          style={{ flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#222' }}
        >
          {logs.map((log, index) => (
            <Text
              key={index}
              style={{
                color: log.includes('❌') ? '#ff5555' : log.includes('✅') ? '#55ff55' : '#cccccc',
                fontSize: 12,
                fontFamily: 'monospace',
                marginBottom: 6,
              }}
            >
              {log}
            </Text>
          ))}
          {testing ? <ActivityIndicator color="#c9a84c" style={{ marginTop: 12 }} /> : null}
        </ScrollView>

        <View style={{ gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            onPress={runModuleTests}
            disabled={testing}
            style={{
              backgroundColor: '#c9a84c',
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: 'center',
              opacity: testing ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>
              Run Native Module Audit
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={launchFullApp}
            disabled={testing}
            style={{
              backgroundColor: '#222',
              borderColor: '#444',
              borderWidth: 1,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              Launch Full App →
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

AppRegistry.registerComponent('main', () => DiagnosticApp);
