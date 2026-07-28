import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Animated,
  RefreshControl,
  StyleSheet,
  StatusBar,
  Linking,
  Platform,
  Alert
} from 'react-native';
import { useGallery } from '@/hooks/useGallery';
import { useRouter, useFocusEffect } from 'expo-router';
import { MapPin, MessageCircle, Layers, Grid3x3 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Session } from '@/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/lib/languageContext';
import { useColorScheme } from 'nativewind';
import { useToast } from '@/components/Toast';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const SIDE_PAD = 16;
const COL_WIDTH = (width - SIDE_PAD * 2 - CARD_GAP) / 2;

const LEFT_HEIGHTS =  [220, 160, 200, 180, 240, 160, 200, 220, 160, 200];
const RIGHT_HEIGHTS = [160, 220, 170, 230, 160, 210, 170, 160, 230, 180];

type ViewMode = 'masonry' | 'grid';

export default function GalleryScreen() {
  const { sessions, loading, refresh } = useGallery();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>('masonry');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { t } = useLanguage();
  const { colorScheme } = useColorScheme();
  const { showToast } = useToast();

  const openNativeMap = (item: Session) => {
    const { lat, lng } = item.coordinates as { lat: number; lng: number };
    const label = encodeURIComponent(item.monument_name);
    const url = Platform.select({
       ios: `maps://?q=${label}&ll=${lat},${lng}`,
       android: `geo:${lat},${lng}?q=${label}`
    }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    Linking.openURL(url).catch(() => {
      showToast('Could not open map app.', 'error');
    });
  };

  const countries = useMemo(() => {
    return Array.from(new Set(sessions.map(s => s.location_country)));
  }, [sessions]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [])
  );

  const filteredSessions = useMemo(() => {
    if (!selectedCountry) return sessions;
    return sessions.filter(s => s.location_country === selectedCountry);
  }, [sessions, selectedCountry]);

  // Header opacity on scroll
  const headerBg = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [
      colorScheme === 'dark' ? 'rgba(14,14,14,0)' : 'rgba(255,255,255,0)', 
      colorScheme === 'dark' ? 'rgba(14,14,14,0.98)' : 'rgba(255,255,255,0.98)'
    ],
    extrapolate: 'clamp',
  });

  // Masonry layout logic
  const leftCol: Session[] = [];
  const rightCol: Session[] = [];
  const masonrySessions = filteredSessions.length > 1 ? filteredSessions.slice(1) : [];
  masonrySessions.forEach((s, i) => {
    if (i % 2 === 0) leftCol.push(s);
    else rightCol.push(s);
  });

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="light-content" />

      {/* Floating sticky header */}
      <Animated.View
        style={[styles.stickyHeader, { paddingTop: insets.top + 12, backgroundColor: headerBg }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>{t('collection')}</Text>
            <Text style={styles.headerSub}>
              {filteredSessions.length === 1 ? t('siteCount') : t('sitesCount', { count: filteredSessions.length.toString() })} · {selectedCountry || t('allNations')}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setViewMode(viewMode === 'masonry' ? 'grid' : 'masonry')}
              style={styles.headerIconBtn}
            >
              {viewMode === 'masonry' ? (
                <Grid3x3 size={18} color="#c9a84c" />
              ) : (
                <Layers size={18} color="#c9a84c" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Country Filter Scroll */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16 }}
          contentContainerStyle={{ paddingBottom: 8, gap: 8 }}
        >
          <TouchableOpacity 
            onPress={() => setSelectedCountry(null)}
            style={[
              styles.filterTab, 
              !selectedCountry && styles.filterTabActive
            ]}
          >
            <Text style={[styles.filterTabText, !selectedCountry && styles.filterTabTextActive]}>{t('allFilter')}</Text>
          </TouchableOpacity>
          {countries.sort().map(country => (
            <TouchableOpacity 
              key={country}
              onPress={() => setSelectedCountry(country)}
              style={[
                styles.filterTab, 
                selectedCountry === country && styles.filterTabActive
              ]}
            >
              <Text style={[styles.filterTabText, selectedCountry === country && styles.filterTabTextActive]}>{country}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 130 },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#c9a84c" />
        }
      >
        {filteredSessions.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Hero Card */}
            {filteredSessions.length > 0 && (
              <HeroCard
                item={filteredSessions[0]}
                onPress={() => router.push(`/session/${filteredSessions[0].id}`)}
                onMapPress={() => openNativeMap(filteredSessions[0])}
              />
            )}

            {/* Masonry / Grid */}
            {viewMode === 'masonry' ? (
              <View style={styles.masonryRow}>
                <View style={styles.masonryCol}>
                  {leftCol.map((item, i) => (
                    <MonumentCard
                      key={item.id}
                      item={item}
                      imageHeight={LEFT_HEIGHTS[i % LEFT_HEIGHTS.length]}
                      onPress={() => router.push(`/session/${item.id}`)}
                      onMapPress={() => openNativeMap(item)}
                      delay={i * 80}
                    />
                  ))}
                </View>
                <View style={[styles.masonryCol, { marginTop: 40 }]}>
                  {rightCol.map((item, i) => (
                    <MonumentCard
                      key={item.id}
                      item={item}
                      imageHeight={RIGHT_HEIGHTS[i % RIGHT_HEIGHTS.length]}
                      onPress={() => router.push(`/session/${item.id}`)}
                      onMapPress={() => openNativeMap(item)}
                      delay={i * 80 + 40}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.gridContainer}>
                {masonrySessions.map((item, i) => (
                  <MonumentCard
                    key={item.id}
                    item={item}
                    imageHeight={160}
                    onPress={() => router.push(`/session/${item.id}`)}
                    onMapPress={() => openNativeMap(item)}
                    delay={i * 60}
                  />
                ))}
              </View>
            )}

            <View style={{ height: 120 }} />
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Sub-Components (Cards, Empty State) ──────────────────────────────────────

function MonumentCard({ item, imageHeight, onPress, onMapPress, delay = 0 }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    // Fade in with a safety fallback — if animation doesn't start, card is still visible
    opacity.setValue(0);
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, delay || 0);
    return () => clearTimeout(timer);
  }, []);

  const qaCount = item.qa_thread ? Math.floor(item.qa_thread.length / 2) : 0;

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        style={styles.card}
      >
        <View style={[styles.cardImageWrapper, { height: imageHeight }]}>
          <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />
          <View style={styles.countryBadge}><Text style={styles.countryBadgeText}>{item.location_country}</Text></View>
          {qaCount > 0 && (
            <View style={styles.qaBadge}>
              <MessageCircle size={8} color="#000" />
              <Text style={styles.qaCount}>{qaCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.monument_name}</Text>
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              onMapPress();
            }}
            style={styles.cardMeta}
          >
            <MapPin size={9} color="#c9a84c" />
            <Text style={styles.cardCity} numberOfLines={1}>{item.location_city}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function HeroCard({ item, onPress, onMapPress }: any) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.heroCard}>
      <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
      <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{t('latestDiscovery')}</Text></View>
      <View style={styles.heroContent}>
        <Text style={styles.heroName}>{item.monument_name}</Text>
        <TouchableOpacity 
          onPress={(e) => {
            e.stopPropagation();
            onMapPress?.();
          }}
          style={styles.heroMeta}
        >
          <MapPin size={12} color="#c9a84c" />
          <Text style={styles.heroCity}>{item.location_city}, {item.location_country}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🏛️</Text>
      <Text style={styles.emptyTitle}>{t('noMonuments')}</Text>
      <Text style={styles.emptySubtitle}>{t('startExpeditionDesc')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e' },
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, paddingHorizontal: SIDE_PAD, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTitle: { color: '#f0ece0', fontSize: 26, fontFamily: 'Georgia' },
  headerSub: { color: '#9a9483', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e', alignItems: 'center', justifyContent: 'center' },
  
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e' },
  filterTabActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  filterTabText: { color: '#9a9483', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  filterTabTextActive: { color: '#0e0e0e' },

  scrollContent: { paddingHorizontal: SIDE_PAD },
  heroCard: { width: '100%', height: 260, borderRadius: 20, overflow: 'hidden', marginBottom: 16, elevation: 10 },
  heroBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: '#c9a84c', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroBadgeText: { color: '#0e0e0e', fontSize: 9, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  heroContent: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  heroName: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia', marginBottom: 6 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroCity: { color: '#c9a84c', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  masonryRow: { flexDirection: 'row', gap: CARD_GAP },
  masonryCol: { width: COL_WIDTH, gap: CARD_GAP },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },

  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e' },
  cardImageWrapper: { position: 'relative' },
  countryBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(201,168,76,0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  countryBadgeText: { color: '#000', fontSize: 7, fontWeight: '900' },
  qaBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#c9a84c', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  qaCount: { color: '#000', fontSize: 8, fontWeight: '900' },
  cardInfo: { padding: 10 },
  cardName: { color: '#f0ece0', fontSize: 13, fontFamily: 'Georgia', marginBottom: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardCity: { color: '#9a9483', fontSize: 9, fontWeight: '600' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { color: '#f0ece0', fontSize: 20, fontFamily: 'Georgia' },
  emptySubtitle: { color: '#9a9483', fontSize: 13, textAlign: 'center' },
});