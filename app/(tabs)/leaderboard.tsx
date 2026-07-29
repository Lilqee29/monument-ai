import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { useLanguage } from '@/lib/languageContext';

export default function LeaderboardScreen() {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <Trophy size={48} color="#c9a84c" opacity={0.5} />
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>
        Compete with explorers worldwide. Coming soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e0e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#f0ece0',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  subtitle: {
    color: '#9a9483',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});
