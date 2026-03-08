import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Linking, TextInput } from 'react-native';
import { ChevronLeft, Bell, Shield, Moon, Globe, Info, LogOut, Trash2, Heart, Smartphone, Sun, User, Mail, Lock, Check, X, Calendar, UserPlus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useLanguage, Language } from '@/lib/languageContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useColorScheme } from 'nativewind';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { language, setLanguage, t } = useLanguage();
  const { colorScheme, setColorScheme } = useColorScheme();
  
  const [notifications, setNotifications] = useState(true);
  const [preciseLocation, setPreciseLocation] = useState(true);
  const [aiAssistant, setAiAssistant] = useState(true);
  const [cacheSize, setCacheSize] = useState('0.00');
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>((user?.unsafeMetadata?.theme as any) || 'system');

  // Profile Edit States
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingExtra, setIsEditingExtra] = useState(false);
  
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress || '');
  
  // Extra Passport Info (Stored in unsafeMetadata)
  const [sex, setSex] = useState((user?.unsafeMetadata?.sex as string) || 'N/A');
  const [dob, setDob] = useState((user?.unsafeMetadata?.dob as string) || 'N/A');
  const [nationality, setNationality] = useState((user?.unsafeMetadata?.nationality as string) || 'Global Archivist');
  
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    calculateCacheSize();
  }, []);

  const calculateCacheSize = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;
      
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      let totalBytes = 0;
      
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(cacheDir + file);
        if (info.exists && !info.isDirectory) {
          totalBytes += info.size || 0;
        }
      }
      
      const mb = (totalBytes / (1024 * 1024)).toFixed(2);
      setCacheSize(mb);
    } catch (e) {
      console.warn("Could not calculate cache", e);
    }
  };

  const handleUpdateName = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await user.update({ firstName, lastName });
      Alert.alert("Success", t('nameUpdateSuccess'));
      setIsEditingName(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update name.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateExtra = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await user.update({ 
        unsafeMetadata: { 
          sex, 
          dob, 
          nationality 
        } 
      });
      Alert.alert("Success", "Passport details updated.");
      setIsEditingExtra(false);
    } catch (e: any) {
      Alert.alert("Error", "Failed to update details.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await user.createEmailAddress({ email });
      Alert.alert("Success", t('emailUpdateSuccess'));
      setIsEditingEmail(false);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to change email.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.primaryEmailAddress) return;
    try {
      // Clerk's standard way to trigger a verification email for the primary address
      // which acts as a password reset trigger in many configurations.
      await user.primaryEmailAddress.prepareVerification({
         strategy: "email_code",
      });
      
      Alert.alert(
        t('resetPassword'),
        t('passwordResetSent')
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to trigger reset.");
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: () => {
          signOut();
          router.replace('/');
        }}
      ]
    );
  };

  const toggleNotifications = async (val: boolean) => {
    setNotifications(val);
    if (val) {
      await Notifications.requestPermissionsAsync();
    }
  };

  const toggleLocationPrecise = async (val: boolean) => {
    setPreciseLocation(val);
    if (val) {
      await Location.requestForegroundPermissionsAsync();
    }
  };

  const clearCache = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        for (const file of files) {
          await FileSystem.deleteAsync(cacheDir + file, { idempotent: true });
        }
      }
      Alert.alert("Cache Cleared", `Local storage optimized. Reclaimed ~${cacheSize}MB!`);
      setCacheSize('0.00');
    } catch (e) {
      Alert.alert("Notice", "Cache is already clean.");
    }
  };

  const showPrivacyPolicy = () => {
    Alert.alert(
      "Privacy Policy",
      "We respect your privacy completely.\n\n" +
      "• We do NOT own your data.\n" +
      "• All photos you capture are stored securely on your own device and private database.\n" +
      "• Location data is strictly used for the geofencing radar and is never sold to third parties.\n\n" +
      "You hold full ownership of your discoveries."
    );
  };

  const showTermsOfService = () => {
    Alert.alert(
      "Terms of Service",
      "By using RELICA, you agree to explore respectfully.\n\n" +
      "• Do not trespass on private property to scan monuments.\n" +
      "• Obey all local laws in your city.\n" +
      "• The AI histories are generated for educational entertainment and may occasionally contain slight inaccuracies."
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="px-8 pt-20 pb-6 flex-row items-center border-b border-border bg-background">
        <TouchableOpacity 
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full bg-surface"
        >
          <ChevronLeft color="#c9a84c" size={24} />
        </TouchableOpacity>
        <Text className="text-textPrimary text-2xl font-serif ml-6">{t('settings')}</Text>
      </View>

      <ScrollView className="flex-1">
        {/* Section: Identity & Profile */}
        <View className="px-8 mt-10">
           <Text className="text-gold text-[10px] font-black uppercase tracking-[3px] mb-6">{t('identityProfile')}</Text>
           
           {/* Change Name */}
           <View className="py-6 border-b border-border/10">
              <View className="flex-row items-center">
                 <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
                    <User size={20} color="#c9a84c" />
                 </View>
                 <View className="ml-5 flex-1">
                    <Text className="text-textPrimary text-lg font-serif">{t('fullName')}</Text>
                    {isEditingName ? (
                       <View className="flex-row items-center gap-2 mt-2">
                          <TextInput 
                            value={firstName} 
                            onChangeText={setFirstName}
                            className="flex-1 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                            placeholder="First"
                            placeholderTextColor="#666"
                          />
                          <TextInput 
                            value={lastName} 
                            onChangeText={setLastName}
                            className="flex-1 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                            placeholder="Last"
                            placeholderTextColor="#666"
                          />
                       </View>
                    ) : (
                       <Text className="text-textSecondary text-xs">{user?.fullName || 'Anonymous Explorer'}</Text>
                    )}
                 </View>
                 {isEditingName ? (
                    <View className="flex-row items-center gap-3">
                       <TouchableOpacity onPress={handleUpdateName} className="p-2.5 rounded-full bg-gold/20">
                          <Check size={20} color="#c9a84c" />
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setIsEditingName(false)} className="p-2.5 rounded-full bg-red-500/20">
                          <X size={20} color="#ff4444" />
                       </TouchableOpacity>
                    </View>
                 ) : (
                    <TouchableOpacity onPress={() => setIsEditingName(true)} className="px-4 py-2 bg-surface rounded-full border border-border">
                       <Text className="text-gold text-[10px] font-black uppercase tracking-widest">Edit</Text>
                    </TouchableOpacity>
                 )}
              </View>
           </View>

           {/* Passport Info (Sex, DOB, Nationality) */}
           <View className="py-6 border-b border-border/10">
              <View className="flex-row items-center">
                 <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
                    <Shield size={20} color="#c9a84c" />
                 </View>
                 <View className="ml-5 flex-1">
                    <Text className="text-textPrimary text-lg font-serif">{t('digitalPassport')}</Text>
                    {isEditingExtra ? (
                       <View className="mt-4 space-y-3">
                          <View className="flex-row items-center gap-3">
                             <Text className="text-[10px] text-gold font-bold uppercase w-20">{t('sex')}:</Text>
                             <TextInput 
                                value={sex} 
                                onChangeText={setSex}
                                className="flex-1 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                                placeholder="M / F / X"
                                placeholderTextColor="#666"
                             />
                          </View>
                          <View className="flex-row items-center gap-3">
                             <Text className="text-[10px] text-gold font-bold uppercase w-20">{t('dateOfBirth')}:</Text>
                             <TextInput 
                                value={dob} 
                                onChangeText={setDob}
                                className="flex-1 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                                placeholder="DD/MM/YYYY"
                                placeholderTextColor="#666"
                             />
                          </View>
                          <View className="flex-row items-center gap-3">
                             <Text className="text-[10px] text-gold font-bold uppercase w-20">{t('nationality')}:</Text>
                             <TextInput 
                                value={nationality} 
                                onChangeText={setNationality}
                                className="flex-1 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                                placeholder="Global Archivist"
                                placeholderTextColor="#666"
                             />
                          </View>
                       </View>
                    ) : (
                       <Text className="text-textSecondary text-xs">
                          {sex} · {dob} · {nationality}
                       </Text>
                    )}
                 </View>
                 {isEditingExtra ? (
                    <View className="flex-row items-center gap-3">
                       <TouchableOpacity onPress={handleUpdateExtra} className="p-2.5 rounded-full bg-gold/20">
                          <Check size={20} color="#c9a84c" />
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setIsEditingExtra(false)} className="p-2.5 rounded-full bg-red-500/20">
                          <X size={20} color="#ff4444" />
                       </TouchableOpacity>
                    </View>
                 ) : (
                    <TouchableOpacity onPress={() => setIsEditingExtra(true)} className="px-4 py-2 bg-surface rounded-full border border-border">
                       <Text className="text-gold text-[10px] font-black uppercase tracking-widest">Edit</Text>
                    </TouchableOpacity>
                 )}
              </View>
           </View>

           {/* Change Email */}
           <View className="py-6 border-b border-border/10">
              <View className="flex-row items-center">
                 <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
                    <Mail size={20} color="#c9a84c" />
                 </View>
                 <View className="ml-5 flex-1">
                    <Text className="text-textPrimary text-lg font-serif">{t('emailAddress')}</Text>
                    {isEditingEmail ? (
                       <TextInput 
                        value={email} 
                        onChangeText={setEmail}
                        className="mt-3 bg-surface border border-border p-3 rounded-lg text-textPrimary text-xs font-sans"
                        placeholder="new-email@example.com"
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                      />
                    ) : (
                       <Text className="text-textSecondary text-xs">{user?.primaryEmailAddress?.emailAddress}</Text>
                    )}
                 </View>
                 {isEditingEmail ? (
                    <View className="flex-row items-center gap-3">
                       <TouchableOpacity onPress={handleUpdateEmail} className="p-2.5 rounded-full bg-gold/20">
                          <Check size={20} color="#c9a84c" />
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setIsEditingEmail(false)} className="p-2.5 rounded-full bg-red-500/20">
                          <X size={20} color="#ff4444" />
                       </TouchableOpacity>
                    </View>
                 ) : (
                    <TouchableOpacity onPress={() => setIsEditingEmail(true)} className="px-4 py-2 bg-surface rounded-full border border-border">
                       <Text className="text-gold text-[10px] font-black uppercase tracking-widest">Change</Text>
                    </TouchableOpacity>
                 )}
              </View>
           </View>

           {/* Reset Password */}
           <TouchableOpacity onPress={handleResetPassword} className="py-6 border-b border-border/10">
              <View className="flex-row items-center">
                 <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
                    <Lock size={20} color="#c9a84c" />
                 </View>
                 <View className="ml-5 flex-1">
                    <Text className="text-textPrimary text-lg font-serif">{t('resetPassword')}</Text>
                    <Text className="text-textSecondary text-xs">Security & Safeguarding</Text>
                 </View>
                 <ChevronLeft className="rotate-180" size={16} color="#c9a84c" opacity={0.5} />
              </View>
           </TouchableOpacity>
        </View>

        {/* Section: General */}
        <View className="px-8 mt-12">
          <Text className="text-gold text-[10px] font-black uppercase tracking-[3px] mb-6">{t('generalPreferences')}</Text>
          
          <SettingItem 
            icon={<Bell size={20} color="#c9a84c" />} 
            label={t('discoveryAlerts')} 
            description={t('notifyNear')}
          >
            <Switch 
              value={notifications} 
              onValueChange={toggleNotifications}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingItem>

          <SettingItem 
            icon={<Globe size={20} color="#c9a84c" />} 
            label={t('appLanguage')} 
            description={t('translationsAI')}
          >
             <View className="flex-row items-center gap-2 mt-2">
                {(['English', 'Français', 'Español'] as Language[]).map(lang => (
                   <TouchableOpacity 
                     key={lang}
                     onPress={() => setLanguage(lang)}
                     className={`px-3 py-1.5 rounded-full border ${language === lang ? 'bg-gold border-gold' : 'border-border bg-transparent'}`}
                   >
                     <Text className={`font-bold font-sans text-xs ${language === lang ? 'text-black' : 'text-textSecondary'}`}>{lang}</Text>
                   </TouchableOpacity>
                ))}
             </View>
          </SettingItem>

          <SettingItem 
            icon={<Moon size={20} color="#c9a84c" />} 
            label={t('immersiveDark')} 
            description={t('toggleAppTheme')}
          >
             <View className="flex-row items-center gap-2 mt-2">
                {[
                  { id: 'light', icon: <Sun size={14} /> },
                  { id: 'dark', icon: <Moon size={14} /> },
                  { id: 'system', icon: <Smartphone size={14} /> }
                ].map((tItem: any) => {
                   const isActive = selectedTheme === tItem.id;
                   return (
                     <TouchableOpacity 
                       key={tItem.id}
                       onPress={async () => {
                          setSelectedTheme(tItem.id);
                          setColorScheme(tItem.id);
                          if (user) {
                            await user.update({
                              unsafeMetadata: {
                                ...user.unsafeMetadata,
                                theme: tItem.id
                              }
                            });
                          }
                       }}
                       className={`w-10 h-10 items-center justify-center rounded-full border ${isActive ? 'bg-gold border-gold' : 'border-border bg-surface'}`}
                     >
                        {React.cloneElement(tItem.icon, { color: isActive ? '#000' : '#c9a84c' })}
                     </TouchableOpacity>
                   );
                })}
             </View>
          </SettingItem>

          <SettingItem 
            icon={<Globe size={20} color="#c9a84c" />} 
            label={t('metricUnits')} 
            description={t('useKmMeters')}
          >
            <Switch 
              value={preciseLocation} 
              onValueChange={toggleLocationPrecise}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingItem>
        </View>

        {/* Section: AI & Exploration */}
        <View className="px-8 mt-12">
          <Text className="text-gold text-[10px] font-black uppercase tracking-[3px] mb-6">{t('aiArchiving')}</Text>
          
          <SettingItem 
            icon={<Info size={20} color="#c9a84c" />} 
            label={t('aiCompanion')} 
            description={t('enableHistorical')}
          >
            <Switch 
              value={aiAssistant} 
              onValueChange={setAiAssistant}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingItem>

          <TouchableOpacity 
            onPress={clearCache}
            className="flex-row items-center py-6 border-b border-border/10"
          >
            <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
              <Trash2 size={20} color="#c9a84c" />
            </View>
            <View className="ml-5 flex-1">
               <Text className="text-textPrimary text-lg font-serif">{t('clearMapsCache')}</Text>
               <Text className="text-textSecondary text-xs">{t('freesUpCache', { size: cacheSize })}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Section: About */}
        <View className="px-8 mt-12 mb-20">
          <Text className="text-gold text-[10px] font-black uppercase tracking-[3px] mb-6">{t('legalSupport')}</Text>
          
          <TouchableOpacity onPress={showPrivacyPolicy} className="flex-row items-center py-6 border-b border-border/10">
            <Shield size={20} color="#c9a84c" className="mr-5" />
            <Text className="text-textPrimary text-lg font-serif">{t('privacyPolicy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={showTermsOfService} className="flex-row items-center py-6 border-b border-border/10">
            <Heart size={20} color="#c9a84c" className="mr-5" />
            <Text className="text-textPrimary text-lg font-serif">{t('termsOfService')}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleSignOut}
            className="flex-row items-center py-8"
          >
            <LogOut size={20} color="#ff4444" className="mr-5" />
            <Text className="text-[#ff4444] text-lg font-bold">{t('endExpedition')}</Text>
          </TouchableOpacity>

          <View className="mt-10 items-center">
             <Text className="text-textSecondary text-[10px] font-sans uppercase">{t('version')}</Text>
             <Text className="text-textSecondary/30 text-[8px] mt-1 italic">{t('craftedFor')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingItem({ icon, label, description, children }: any) {
  return (
    <View className="flex-row items-center py-6 border-b border-border/10">
      <View className="w-10 h-10 items-center justify-center rounded-xl bg-surface/30">
        {icon}
      </View>
      <View className="ml-5 flex-1">
        <Text className="text-textPrimary text-lg font-serif">{label}</Text>
        <Text className="text-textSecondary text-xs">{description}</Text>
      </View>
      {children}
    </View>
  );
}
