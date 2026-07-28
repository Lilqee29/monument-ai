import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { identifyMonument, askQuestion, verifyQuestObjective } from '@/lib/ai';
import { useQuest } from '@/lib/questContext';
import { ChevronLeft, Save, MessageSquare, Info, History, MapPin, CheckCircle, Volume2, Square, Globe, Send, User } from 'lucide-react-native';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@clerk/clerk-expo';
import { uploadMonumentPhoto } from '@/lib/storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { useLanguage, languageCodeMap } from '@/lib/languageContext';
import { recordScan } from '@/lib/streak';
import { sendNotification } from '@/lib/notifications';
import * as Haptics from 'expo-haptics';

type Tab = 'history' | 'details' | 'ask';

export default function ResultScreen() {
  const { uri, userLat, userLng } = useLocalSearchParams<{ uri: string, userLat?: string, userLng?: string }>();
  const [loading, setLoading] = useState(true);
  const [monument, setMonument] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { userId, getToken } = useAuth();
  const router = useRouter();
  
  // Chat state
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [fullBase64, setFullBase64] = useState<string>('');
  const scrollViewRef = useRef<ScrollView>(null);
  const { activeQuest, setActiveQuest } = useQuest();
  const { language, t } = useLanguage();

  useEffect(() => {
    if (uri) {
      handleIdentification();
    }
  }, [uri]);

  const handleIdentification = async () => {
    try {
      setLoading(true);
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      setFullBase64(b64);

      const uncompletedTasks = activeQuest ? activeQuest.tasks.filter(t => !t.completed) : [];

      const locationHintStr = userLat && userLng ? `${userLat},${userLng}` : undefined;

      const [mResult, qResult] = await Promise.all([
        identifyMonument(b64, 'image/jpeg', language, locationHintStr).catch(e => ({ error: e.message })),
        uncompletedTasks.length > 0 
          ? verifyQuestObjective(b64, 'image/jpeg', uncompletedTasks).catch(() => null) 
          : Promise.resolve(null)
      ]);

      let questVindicated = false;

      let earnedXp = 0;
      if (qResult && qResult.matched_task_id) {
        const matchedTask = activeQuest?.tasks.find(t => t.id === qResult.matched_task_id);
        earnedXp = matchedTask?.xp_reward || 0;

        setActiveQuest(prev => {
          if (!prev) return prev;
          const newTasks = prev.tasks.map(t => 
            t.id === qResult.matched_task_id ? { ...t, completed: true } : t
          );
          return { ...prev, tasks: newTasks };
        });
        setShowConfetti(true);
        questVindicated = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t('objectiveReached') + ` ✨ (+${earnedXp} XP)`, qResult.reason);
      }
      
      if ('error' in mResult) {
        if (earnedXp > 0) {
           // Persist quest XP with Clerk Auth
           let qToken: string | null = null;
           try { qToken = await getToken({ template: 'supabase' }); } catch (e) { qToken = await getToken(); }
           const qClient = qToken ? createClerkSupabaseClient(qToken) : supabase;

           const { error: qError } = await qClient.from('sessions').insert({
             user_id: userId,
             monument_name: "Quest Discovery",
             location_city: "Field",
             location_country: "Context",
             photo_url: uri, 
             history_text: qResult?.reason || "Quest task completed",
             details: { xp_reward: earnedXp, is_quest_only: true },
             created_at: new Date().toISOString()
           });

           if (qError) {
             console.warn('[RELICA] Quest save failed (Security check):', qError.message);
             // One-time fallback to anon
             if (qError.code === 'PGRST301' || qError.code === '42501') {
               await supabase.from('sessions').insert({
                 user_id: userId,
                 monument_name: "Quest Discovery",
                 location_city: "Field",
                 location_country: "Context",
                 photo_url: uri, 
                 history_text: qResult?.reason || "Quest task completed",
                 details: { xp_reward: earnedXp, is_quest_only: true },
                 created_at: new Date().toISOString()
               });
             }
           }
           setTimeout(() => router.back(), 3000); 
           return;
        }
        throw new Error(mResult.error as string);
      }
      
      const monumentData = mResult as any;
      setMonument(monumentData);
      
      // confirm location if coords available
      if (userLat && userLng && monumentData.coordinates) {
         const distance = getDistance(
           parseFloat(userLat), 
           parseFloat(userLng), 
           monumentData.coordinates.lat, 
           monumentData.coordinates.lng
         );
         // If within 50km, consider it confirmed (monuments are often identifying from distance)
         if (distance < 50) {
            setIsLocationConfirmed(true);
         }
      } else {
        // If no user location provided (e.g. from gallery), we can't confirm hard but we allow save
        setIsLocationConfirmed(true); 
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Analysis Failed', 'Could not identify this monument. Try a clearer angle.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleSave = async () => {
    if (!userId) {
      Alert.alert('Identity Missing', 'Please sign in to archive your discoveries.');
      return;
    }

    if (!isLocationConfirmed && userLat) {
       Alert.alert(
         "Location Mismatch", 
         "Your current location doesn't seem to match this monument's site. Save anyway?",
         [
           { text: "Cancel", style: "cancel" },
           { text: "Save Anyway", onPress: () => proceedWithSave() }
         ]
       );
       return;
    }

    proceedWithSave();
  };

// Replace your entire proceedWithSave function with this

const proceedWithSave = async () => {
  try {
    setSaving(true);

    // ── 1. Get Clerk token FIRST — used for both storage + db ──────────────
    let token: string | null = null;
    try {
      token = await getToken({ template: 'supabase' });
    } catch {
      token = await getToken();
    }

    if (!token) {
      throw new Error('Authentication token missing. Please sign in again.');
    }

    // ── 2. Always use authed client — never anon for user data ─────────────
    const client = createClerkSupabaseClient(token);

    // ── 3. Upload photo using authed client ────────────────────────────────
    const fileName = `${userId}/${Date.now()}.jpg`;
    const bucketName = 'monument-photos';

    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: 'image/jpeg',
    } as any);

    const { data: uploadData, error: uploadError } = await client.storage
      .from(bucketName)
      .upload(fileName, formData, { upsert: true });

    if (uploadError) {
      console.error('[RELICA] Upload error:', uploadError.message);
      throw new Error(`Photo upload failed: ${uploadError.message}`);
    }

    // ── 4. Get photo URL ───────────────────────────────────────────────────
    let photoUrl = '';

    const { data: signedData } = await client.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10); // 10 years

    if (signedData?.signedUrl) {
      photoUrl = signedData.signedUrl;
    } else {
      const { data: { publicUrl } } = client.storage
        .from(bucketName)
        .getPublicUrl(fileName);
      photoUrl = publicUrl;
    }

    // ── 5. Build session payload ───────────────────────────────────────────
    const sessionData: any = {
      user_id: userId, // text column now, Clerk ID stores fine
      monument_name: monument.name,
      location_city: monument.city,
      location_country: monument.country,
      photo_url: photoUrl,
      history_text: monument.history,
      details: {
        ...monument.details,
        architectural_details: monument.architectural_details,
        cultural_context: monument.cultural_context,
        style_explanation: monument.style_explanation,
      },
      qa_thread: [],
      created_at: new Date().toISOString(),
    };

    if (monument.coordinates?.lat && monument.coordinates?.lng) {
      sessionData.coordinates = monument.coordinates;
    }

    // ── 6. Insert session with authed client ───────────────────────────────
    const { error: insertError } = await client
      .from('sessions')
      .insert(sessionData);

    if (insertError) {
      console.error('[RELICA] Insert error:', insertError.code, insertError.message);
      throw new Error(insertError.message);
    }

    // ── 7. Streak + notifications ──────────────────────────────────────────
    const { streak, isNewDay, xpMultiplier } = await recordScan();

    await sendNotification('new_card_unlocked', {
      cardName: monument.name,
      country: monument.country,
    });

    if (isNewDay) {
      await sendNotification('streak_milestone', {
        streak: streak.currentStreak,
        multiplier: xpMultiplier,
      });
    }

    // ── 8. Done ────────────────────────────────────────────────────────────
    setShowConfetti(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      router.replace('/(tabs)/gallery');
    }, 2500);

  } catch (error: any) {
    console.error('[RELICA] proceedWithSave failed:', error.message);
    Alert.alert('Archive Error', error.message || 'Could not save this discovery.');
  } finally {
    setSaving(false);
  }
};

  const toggleSpeech = async () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      if (monument?.history) {
        setIsSpeaking(true);
        try {
          const voices = await Speech.getAvailableVoicesAsync();
          // Find the best Premium/Enhanced voice for the user's localized language
          const targetLang = languageCodeMap[language];
          let bestVoice = voices.find((v) => 
            v.language.startsWith(targetLang) && 
            (v.name.includes('Premium') || v.name.includes('Enhanced') || v.quality === 'Enhanced')
          );
          
          if (!bestVoice) {
             // Fallback to standard localized voice
             bestVoice = voices.find(v => v.language.startsWith(targetLang));
          }

          Speech.speak(monument.history, {
            voice: bestVoice?.identifier,
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
            rate: 0.95, // slightly faster to sound more natural
            pitch: 1.0,
          });
        } catch (e) {
           // Direct fallback
           Speech.speak(monument.history, {
              onDone: () => setIsSpeaking(false),
              onStopped: () => setIsSpeaking(false),
              onError: () => setIsSpeaking(false),
              rate: 0.95,
              pitch: 1.0,
           });
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handleAsk = async () => {
    if (!chatInput.trim() || !monument) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    const updatedHistory = [...chatHistory, {role: 'user', content: userMsg} as const];
    setChatHistory(updatedHistory);
    setAsking(true);
    
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    
    try {
      const previousHistoryStr = monument.history_text || monument.history; // Fallback for session vs fresh result
      
      const newResponse = await askQuestion(
        monument.monument_name || monument.name, 
        previousHistoryStr, 
        userMsg, 
        updatedHistory,
        language
      );
      setChatHistory(prev => [...prev, {role: 'assistant', content: newResponse}]);
    } catch (e) {
      setChatHistory(prev => [...prev, {role: 'assistant', content: "I seem to have lost my train of thought. Could you ask me again?"}]);
    } finally {
      setAsking(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#c9a84c" />
        <Text className="text-gold mt-6 font-serif text-xl tracking-widest uppercase">Analyzing Monument</Text>
      </View>
    );
  }

  if (!monument) return null;

  return (
    <View className="flex-1 bg-background">
      {showConfetti && (
        <ConfettiCannon 
          count={200} 
          origin={{x: -10, y: 0}} 
          fadeOut={true}
          colors={['#c9a84c', '#8a6f32', '#f0ece0']}
        />
      )}
      
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header Photo */}
        <View className="relative h-96">
          <Image source={{ uri }} className="w-full h-full" resizeMode="cover" />
          <TouchableOpacity 
            onPress={() => router.back()}
            className="absolute top-12 left-6 w-12 h-12 bg-black/40 rounded-full items-center justify-center"
          >
            <ChevronLeft color="#c9a84c" size={28} />
          </TouchableOpacity>
        </View>

        {/* Monument Header */}
        <View className="px-8 py-8 bg-background">
          <Text className="text-gold text-4xl font-serif mb-2 leading-tight">{monument.name}</Text>
          <View className="flex-row items-center justify-between">
            <View className="bg-gold/10 px-3 py-1 rounded-full border border-gold/20 flex-row items-center">
              <Text className="text-gold text-sm font-sans font-bold tracking-wider uppercase">
                {monument.city}, {monument.country}
              </Text>
            </View>
            {isLocationConfirmed && (
               <View className="flex-row items-center">
                  <CheckCircle size={16} color="#c9a84c" />
                  <Text className="text-gold text-[10px] font-bold uppercase ml-2 tracking-widest">{t('siteVerified')}</Text>
               </View>
            )}
          </View>
        </View>

        {/* Tabs Navigation */}
        <View className="flex-row bg-background border-b border-border px-8">
          <TabButton 
            title={t('history')} 
            isActive={activeTab === 'history'} 
            onPress={() => setActiveTab('history')} 
            icon={<History size={20} color={activeTab === 'history' ? '#c9a84c' : '#4b4b4b'} />}
          />
          <TabButton 
            title={t('facts')} 
            isActive={activeTab === 'details'} 
            onPress={() => setActiveTab('details')} 
            icon={<Info size={20} color={activeTab === 'details' ? '#c9a84c' : '#4b4b4b'} />}
          />
          <TabButton 
            title={t('enquire')} 
            isActive={activeTab === 'ask'} 
            onPress={() => setActiveTab('ask')} 
            icon={<MessageSquare size={20} color={activeTab === 'ask' ? '#c9a84c' : '#4b4b4b'} />}
          />
        </View>

        {/* Content Area */}
        <View className="p-8">
          {activeTab === 'history' && (
            <View>
              <TouchableOpacity
                onPress={toggleSpeech}
                className="flex-row items-center bg-gold/10 self-start px-4 py-2 border border-gold/30 rounded-full mb-6"
              >
                {isSpeaking ? (
                  <>
                     <Square size={16} color="#c9a84c" fill="#c9a84c" />
                     <Text className="text-gold font-bold ml-2 uppercase text-xs tracking-widest">{t('stopAudio')}</Text>
                  </>
                ) : (
                  <>
                     <Volume2 size={16} color="#c9a84c" />
                     <Text className="text-gold font-bold ml-2 uppercase text-xs tracking-widest">{t('listenHistory')}</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text className="text-textPrimary leading-8 text-lg font-serif opacity-90">
                {monument.history}
              </Text>
            </View>
          )}

          {activeTab === 'details' && (
            <View className="space-y-2">
              {Object.entries(monument.details || {})
                .filter(([key]) => key !== 'fun_fact')
                .map(([key, value]) => (
                <View key={key} className="flex-row justify-between py-4 border-b border-border/30">
                  <Text className="text-textSecondary capitalize font-sans text-base tracking-wide">{key.replace('_', ' ')}</Text>
                  <Text className="text-gold font-sans text-right flex-1 ml-4 text-base leading-6">{String(value)}</Text>
                </View>
              ))}
              
              {monument.architectural_details && (
                <View className="mt-4 mb-4 bg-blue-900/10 p-6 rounded-[24px] border border-blue-900/30">
                  <View className="flex-row items-center mb-3">
                    <History size={18} color="#74b9ff" />
                    <Text className="text-[#74b9ff] font-black uppercase tracking-widest text-[10px] ml-2">Architectural Logic</Text>
                  </View>
                  <Text className="text-textPrimary leading-7 text-base font-serif opacity-90">
                    {monument.architectural_details}
                  </Text>
                  {monument.style_explanation && (
                    <Text className="text-textSecondary mt-4 leading-6 text-sm font-sans italic">
                      "Why: {monument.style_explanation}"
                    </Text>
                  )}
                </View>
              )}

              {monument.cultural_context && (
                 <View className="mt-4 mb-4 bg-gold/10 p-6 rounded-[24px] border border-gold/30">
                  <View className="flex-row items-center mb-3">
                    <Globe size={18} color="#c9a84c" />
                    <Text className="text-gold font-black uppercase tracking-widest text-[10px] ml-2">Cultural Context</Text>
                  </View>
                  <Text className="text-textPrimary leading-7 text-base font-serif opacity-90">
                    {monument.cultural_context}
                  </Text>
                </View>
              )}

              {monument.details?.fun_fact && (
                <View className="mt-4 mb-4 bg-[#c9a84c]/10 p-6 rounded-[24px] border border-[#c9a84c]/30">
                  <View className="flex-row items-center mb-3">
                    <Info size={18} color="#c9a84c" />
                    <Text className="text-[#c9a84c] font-black uppercase tracking-widest text-[10px] ml-2">{t('didYouKnow')}</Text>
                  </View>
                  <Text className="text-textPrimary leading-7 text-lg font-serif italic opacity-90">
                    "{monument.details.fun_fact}"
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'ask' && (
            <View className="mb-20">
              {chatHistory.length === 0 ? (
                <View className="py-10 items-center justify-center border border-dashed border-gold/20 rounded-3xl mb-6">
                  <MessageSquare size={48} color="#c9a84c" strokeWidth={1} opacity={0.3} />
                  <Text className="text-textSecondary italic text-center mt-4 px-10 font-serif text-lg leading-7">
                    {t('askAI', { name: monument.name })}
                  </Text>
                </View>
              ) : (
                <View className="mb-6">
                  {chatHistory.map((msg, idx) => (
                    <View key={idx} style={[styles.chatRow, msg.role === 'user' ? styles.chatRowUser : styles.chatRowAssistant]}>
                      {msg.role === 'assistant' && (
                        <View style={styles.assistantAvatar}>
                          <Globe size={14} color="#c9a84c" />
                        </View>
                      )}
                      <View 
                        style={[
                          styles.bubble,
                          msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                        ]}
                      >
                        <Text 
                          style={[
                            styles.bubbleText,
                            msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant
                          ]}
                        >
                          {msg.content}
                        </Text>
                      </View>
                      {msg.role === 'user' && (
                        <View style={styles.userAvatar}>
                          <User size={14} color="#c9a84c" />
                        </View>
                      )}
                    </View>
                  ))}
                  {asking && (
                    <View style={styles.chatRowAssistant}>
                      <View style={styles.assistantAvatar}>
                        <Globe size={14} color="#c9a84c" />
                      </View>
                      <View style={[styles.bubble, styles.bubbleAssistant, { padding: 15 }]}>
                        <ActivityIndicator size="small" color="#c9a84c" />
                      </View>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.inputWrapper}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder={t('askQuestion')}
                  placeholderTextColor="#9a9483"
                  style={styles.input}
                  multiline
                />
                <TouchableOpacity 
                  onPress={handleAsk}
                  disabled={asking || !chatInput.trim()}
                  style={[
                    styles.sendButton,
                    chatInput.trim() && !asking ? styles.sendButtonActive : styles.sendButtonDisabled
                  ]}
                >
                  <Send 
                    color={chatInput.trim() && !asking ? '#000' : '#4b4b4b'} 
                    size={22} 
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View className="h-40" />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Save Button */}
      {!showConfetti && (
        <View className="absolute bottom-10 left-8 right-8 shadow-2xl shadow-black">
          <TouchableOpacity 
            onPress={handleSave}
            disabled={saving}
            className="bg-gold h-16 rounded-2xl flex-row items-center justify-center space-x-3 active:opacity-90 active:scale-[0.98]"
          >
            {saving ? (
              <ActivityIndicator color="black" />
            ) : (
              <>
                <Save color="black" size={22} />
                <Text className="text-background font-bold text-xl uppercase tracking-widest">{t('archiveDiscovery')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TabButton({ title, isActive, onPress, icon }: { title: string, isActive: boolean, onPress: () => void, icon: React.ReactNode }) {
  return (
    <TouchableOpacity 
      onPress={onPress}
      className={`flex-row items-center py-5 mr-8 border-b-2 ${isActive ? 'border-gold' : 'border-transparent'}`}
    >
      {icon}
      <Text className={`ml-2 font-sans font-bold tracking-widest uppercase text-xs ${isActive ? 'text-gold' : 'text-[#4b4b4b]'}`}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 160 },
  chatRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'flex-start' },
  chatRowUser: { justifyContent: 'flex-end' },
  chatRowAssistant: { justifyContent: 'flex-start' },
  assistantAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 4 },
  userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', marginLeft: 10, marginTop: 4 },
  bubble: { maxWidth: '75%', padding: 18, borderRadius: 24 },
  bubbleUser: { backgroundColor: '#c9a84c', borderTopRightRadius: 0 },
  bubbleAssistant: { backgroundColor: 'rgba(26,26,26,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderTopLeftRadius: 0 },
  bubbleText: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#0e0e0e', fontWeight: '800' },
  bubbleTextAssistant: { color: '#f0ece0', opacity: 0.95 },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 56,
    maxHeight: 120,
    color: '#f0ece0',
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 12,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#c9a84c',
    shadowColor: '#c9a84c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(26,26,26,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
});
