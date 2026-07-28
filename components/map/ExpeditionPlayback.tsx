import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage } from '@/lib/languageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpeditionPlaybackProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpeditionPlayback({ onClose }: ExpeditionPlaybackProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.overlay}>
      <Text style={styles.trophy}>🏆</Text>
      <Text style={styles.title}>
        {t('expeditionComplete')}
      </Text>
      <Text style={styles.description}>
        {t('expeditionCompleteDesc')}
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Text style={styles.closeBtnText}>{t('closePlayback')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trophy: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    color: '#c9a84c',
    fontSize: 32,
    fontFamily: 'serif',
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    color: '#f0ece0',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  closeBtn: {
    backgroundColor: '#c9a84c',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
  },
  closeBtnText: {
    color: '#0e0e0e',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
