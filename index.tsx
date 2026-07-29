import './lib/crashDebug';
import React from 'react';
import { AppRegistry } from 'react-native';
import { ExpoRoot } from 'expo-router';

export function App() {
  // @ts-ignore require.context is provided by Metro
  const ctx = require.context('./app');
  return <ExpoRoot context={ctx} />;
}

AppRegistry.registerComponent('main', () => App);
