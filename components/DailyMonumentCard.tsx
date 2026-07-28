/**
 * DailyMonumentCard — shows today's Monument of the Day with a share button.
 * Used on the profile screen and can be placed anywhere in the app.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Share,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Share2, MapPin, Calendar, Sparkles } from 'lucide-react-native';
import { getMonumentOfTheDay, getDailyMonumentShareText } from '@/lib/monumentOfTheDay';
import { useToast } from '@/components/Toast';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export function DailyMonumentCard() {
  const [monument, setMonument] = useState(() => getMonumentOfTheDay());
  const { showToast } = useToast();

  useEffect(() => {
    // Refresh at midnight
    const interval = setInterval(() => {
      setMonument(getMonumentOfTheDay());
    }, 60_000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const handleShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: getDailyMonumentShareText() });
    } catch {
      showToast('Could not share', 'error');
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Sparkles size={12} color="#c9a84c" />
          <Text style={styles.badgeText}>MONUMENT OF THE DAY</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Share2 size={16} color="#c9a84c" />
        </TouchableOpacity>
      </View>

      {/* Image */}
      <Animated.View entering={ZoomIn.delay(200).springify()} style={styles.imageContainer}>
        <Image source={{ uri: monument.image }} style={styles.image} />
        <View style={styles.imageOverlay} />
        <View style={styles.imageOverlayBottom} />
      </Animated.View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name}>{monument.name}</Text>
        <View style={styles.locationRow}>
          <MapPin size={12} color="#9a9483" />
          <Text style={styles.location}>
            {monument.city}, {monument.country}
          </Text>
        </View>
        <View style={styles.dateRow}>
          <Calendar size={12} color="#9a9483" />
          <Text style={styles.date}>{monument.date}</Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity onPress={handleShare} style={styles.cta}>
        <Text style={styles.ctaText}>Challenge Friends</Text>
        <Share2 size={14} color="#000" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
    overflow: 'hidden',
    marginHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(201,168,76,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    color: '#c9a84c',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(201,168,76,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  imageOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  info: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 6,
  },
  name: {
    color: '#f0ece0',
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  location: {
    color: '#9a9483',
    fontSize: 13,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  date: {
    color: '#9a9483',
    fontSize: 11,
    fontWeight: '600',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 16,
    backgroundColor: '#c9a84c',
    paddingVertical: 12,
    borderRadius: 16,
  },
  ctaText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
