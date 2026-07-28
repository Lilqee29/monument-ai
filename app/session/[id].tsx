import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share, Platform, Linking, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@clerk/clerk-expo';
import { ChevronLeft, Info, History, Calendar, MapPin, Share2, Trash2 } from 'lucide-react-native';
import { Session } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

type Tab = 'history' | 'details';

export default function SessionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const { getToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchSession();
  }, [id]);

  const fetchSession = async () => {
    if (!id) return;
    try {
      let token: string | null = null;
      try { token = await getToken({ template: 'supabase' }); } catch { token = await getToken(); }
      const client = token ? createClerkSupabaseClient(token) : supabase;

      const { data, error } = await client
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (data && !error) {
        setSession(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openNativeMap = () => {
    if (!session || !session.coordinates) return;
    const { lat, lng } = session.coordinates as { lat: number; lng: number };
    const label = encodeURIComponent(session.monument_name);
    
    // For iOS we can use maps:// it's smoother, for others https://
    const url = Platform.select({
       ios: `maps://?q=${label}&ll=${lat},${lng}`,
       android: `geo:${lat},${lng}?q=${label}`
    }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Could not open map app.");
    });
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Record",
      "Are you sure you want to permanently erase this discovery from your archive?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Erase", 
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              let token: string | null = null;
              try { token = await getToken({ template: 'supabase' }); } catch { token = await getToken(); }
              const client = token ? createClerkSupabaseClient(token) : supabase;
              const { error } = await client.from('sessions').delete().eq('id', id);
              if (error) throw error;
              router.back(); // Return to gallery/passport
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete record.");
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShare = async () => {
    if (!session) return;
    try {
      const mapLink = session.coordinates 
        ? `https://maps.google.com/maps?q=${session.coordinates.lat},${session.coordinates.lng}`
        : '';
      const text = [
        `🏛️ ${session.monument_name}`,
        ``,
        `📍 ${session.location_city}, ${session.location_country}`,
        `📅 ${new Date(session.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`,
        ``,
        session.details?.built ? `🏗️ Built: ${session.details.built}` : '',
        session.details?.architect ? `👷 Architect: ${session.details.architect}` : '',
        session.details?.style ? `🎨 Style: ${session.details.style}` : '',
        ``,
        `📜 History:`,
        session.history_text?.slice(0, 300) + (session.history_text?.length > 300 ? '...' : ''),
        ``,
        session.details?.fun_fact ? `💡 ${session.details.fun_fact}` : '',
        mapLink ? `\n🗺️ ${mapLink}` : '',
        ``,
        `— Archived via RELICA 🌍`,
      ].filter(Boolean).join('\n');

      await Share.share({ message: text, title: session.monument_name });
    } catch (error: any) {
      console.error("Share failed", error);
    }
  };

  if (loading) return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator size="large" color="#c9a84c" />
    </View>
  );

  if (!session) return null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1">
        {/* Photo */}
        <View className="h-[50vh] relative">
          <Image source={{ uri: session.photo_url }} className="w-full h-full" resizeMode="cover" />
          <View className="absolute top-12 left-6 right-6 flex-row justify-between">
            <TouchableOpacity 
              onPress={() => router.back()}
              className="w-12 h-12 bg-black/40 rounded-full items-center justify-center backdrop-blur-md"
            >
              <ChevronLeft color="#c9a84c" size={28} />
            </TouchableOpacity>
            
            <View className="flex-row gap-3">
              <TouchableOpacity 
                onPress={handleDelete}
                className="w-12 h-12 bg-black/40 rounded-full items-center justify-center backdrop-blur-md"
              >
                <Trash2 color="#ff4444" size={22} />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleShare}
                className="w-12 h-12 bg-black/40 rounded-full items-center justify-center backdrop-blur-md"
              >
                <Share2 color="#c9a84c" size={22} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Content */}
        <View className="px-8 pt-8">
           <Text className="text-gold text-4xl font-serif mb-2 leading-tight">{session.monument_name}</Text>
           <TouchableOpacity 
             onPress={openNativeMap}
             className="flex-row items-center mb-6"
           >
              <MapPin size={16} color="#c9a84c" />
              <Text className="text-textSecondary ml-2 text-xs uppercase tracking-widest font-sans font-bold">
                {session.location_city}, {session.location_country}
              </Text>
           </TouchableOpacity>

           <View className="flex-row items-center mb-8 opacity-60">
              <Calendar size={14} color="#9a9483" />
              <Text className="text-[#9a9483] ml-2 text-xs font-sans">
                Archived {new Date(session.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
           </View>

           {/* Tabs */}
           <View style={sessionTabStyles.tabRow}>
              <TouchableOpacity 
                onPress={() => setActiveTab('history')}
                style={[sessionTabStyles.tab, activeTab === 'history' && sessionTabStyles.tabActive]}
              >
                 <Text style={[sessionTabStyles.tabText, activeTab === 'history' && sessionTabStyles.tabTextActive]}>Chronicle</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setActiveTab('details')}
                style={[sessionTabStyles.tab, activeTab === 'details' && sessionTabStyles.tabActive]}
              >
                 <Text style={[sessionTabStyles.tabText, activeTab === 'details' && sessionTabStyles.tabTextActive]}>Architectural Log</Text>
              </TouchableOpacity>
           </View>

           {activeTab === 'history' ? (
              <View>
                <Text className="text-textPrimary leading-8 text-lg font-serif opacity-90 pb-4">
                  {session.history_text}
                </Text>
                {/* AI Sources Disclaimer */}
                <View className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a] mb-20">
                  <Text className="text-[#9a9483] text-[10px] font-bold uppercase tracking-widest mb-2">Sources</Text>
                  <Text className="text-[#666] text-xs leading-5">
                    Generated by AI (Gemini 2.5 Flash + OpenRouter). Content is for educational purposes and may contain inaccuracies.
                    Cross-reference with local sources before citing.
                  </Text>
                </View>
              </View>
           ) : (
              <View className="pb-20">
                 {Object.entries(session.details || {})
                    .filter(([key]) => key !== 'fun_fact')
                    .map(([key, value]) => (
                    <View key={key} className="flex-row justify-between py-4 border-b border-border/10">
                       <Text className="text-textSecondary capitalize font-sans text-sm">{key.replace('_', ' ')}</Text>
                       <Text className="text-gold font-sans font-bold text-sm text-right flex-1 ml-4">{String(value)}</Text>
                    </View>
                 ))}

                 {session.details?.fun_fact && (
                   <View className="mt-8 mb-4 bg-[#c9a84c]/10 p-6 rounded-[24px] border border-[#c9a84c]/30">
                     <View className="flex-row items-center mb-3">
                       <Info size={18} color="#c9a84c" />
                       <Text className="text-[#c9a84c] font-black uppercase tracking-widest text-[10px] ml-2">Did You Know?</Text>
                     </View>
                     <Text className="text-textPrimary leading-7 text-lg font-serif italic opacity-90">
                       "{session.details.fun_fact}"
                     </Text>
                   </View>
                 )}
              </View>
           )}
        </View>
      </ScrollView>
    </View>
  );
}

const sessionTabStyles = StyleSheet.create({
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', marginBottom: 28 },
  tab: { paddingVertical: 14, marginRight: 28, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#c9a84c' },
  tabText: { color: '#9a9483', fontWeight: '900' as const, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  tabTextActive: { color: '#c9a84c' },
});
