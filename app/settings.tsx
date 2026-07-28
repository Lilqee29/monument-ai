import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch, Alert,
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  ChevronLeft, Bell, Shield, Moon, Globe, Info, LogOut, Trash2,
  Heart, Smartphone, Sun, User, Mail, Lock, Check, X, Eye, EyeOff,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useLanguage, Language } from '@/lib/languageContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useColorScheme } from 'nativewind';

// ─── Password Modal ────────────────────────────────────────────────────────────

type PwStep = 'send' | 'verify' | 'newpw' | 'done';

function PasswordModal({
  visible,
  onClose,
  user,
}: {
  visible: boolean;
  onClose: () => void;
  user: ReturnType<typeof useUser>['user'];
}) {
  const [step, setStep] = useState<PwStep>('send');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  const reset = () => {
    setStep('send');
    setCode('');
    setNewPw('');
    setConfirmPw('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Step 1 — send the code
  const sendCode = async () => {
    if (!user?.primaryEmailAddress) return;
    setError('');
    setLoading(true);
    try {
      await user.primaryEmailAddress.prepareVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (e: any) {
      setError(e.errors?.[0]?.longMessage ?? e.message ?? 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify the code
  const verifyCode = async () => {
    if (!code.trim()) { setError('Please enter the code.'); return; }
    if (!user?.primaryEmailAddress) return;
    setError('');
    setLoading(true);
    try {
      await user.primaryEmailAddress.attemptVerification({ code: code.trim() });
      setStep('newpw');
    } catch (e: any) {
      setError(e.errors?.[0]?.longMessage ?? e.message ?? 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 — set new password
  const updatePassword = async () => {
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setError("Passwords don't match."); return; }
    setError('');
    setLoading(true);
    try {
      await user?.updatePassword({ newPassword: newPw });
      setStep('done');
    } catch (e: any) {
      setError(e.errors?.[0]?.longMessage ?? e.message ?? 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const stepMeta: Record<PwStep, { title: string; sub: string; emoji: string }> = {
    send:   { title: 'Change Password',      sub: `We'll send a verification code to\n${email}`, emoji: '🔐' },
    verify: { title: 'Enter Code',           sub: `Check your inbox at\n${email}`, emoji: '📬' },
    newpw:  { title: 'New Password',         sub: 'Choose a strong password', emoji: '🔑' },
    done:   { title: 'Password Updated!',    sub: 'Your account is now secured with the new password.', emoji: '✅' },
  };

  const meta = stepMeta[step];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={pw.overlay}>
          <TouchableOpacity style={pw.backdrop} onPress={handleClose} />

          <View style={pw.sheet}>
            {/* Handle */}
            <View style={pw.handle} />

            {/* Close button */}
            <TouchableOpacity style={pw.closeBtn} onPress={handleClose}>
              <X size={18} color="#9a9483" />
            </TouchableOpacity>

            {/* Emoji + title */}
            <Text style={pw.emoji}>{meta.emoji}</Text>
            <Text style={pw.title}>{meta.title}</Text>
            <Text style={pw.sub}>{meta.sub}</Text>

            {/* Step indicator */}
            <View style={pw.stepsRow}>
              {(['send', 'verify', 'newpw', 'done'] as PwStep[]).map((s, i) => (
                <View
                  key={s}
                  style={[
                    pw.stepDot,
                    s === step && pw.stepDotActive,
                    (['send', 'verify', 'newpw', 'done'].indexOf(step) > i) && pw.stepDotDone,
                  ]}
                />
              ))}
            </View>

            {/* Error */}
            {!!error && (
              <View style={pw.errorBox}>
                <Text style={pw.errorText}>{error}</Text>
              </View>
            )}

            {/* ── STEP: send ── */}
            {step === 'send' && (
              <TouchableOpacity
                style={[pw.btn, loading && pw.btnDisabled]}
                onPress={sendCode}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={pw.btnText}>Send Verification Code</Text>
                }
              </TouchableOpacity>
            )}

            {/* ── STEP: verify ── */}
            {step === 'verify' && (
              <>
                <View style={pw.inputGroup}>
                  <Text style={pw.label}>Verification Code</Text>
                  <TextInput
                    style={pw.input}
                    value={code}
                    onChangeText={v => { setCode(v); setError(''); }}
                    placeholder="e.g. 482916"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={[pw.btn, loading && pw.btnDisabled]}
                  onPress={verifyCode}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={pw.btnText}>Verify Code</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={pw.ghost} onPress={sendCode}>
                  <Text style={pw.ghostText}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP: newpw ── */}
            {step === 'newpw' && (
              <>
                <View style={pw.inputGroup}>
                  <Text style={pw.label}>New Password</Text>
                  <View style={pw.pwRow}>
                    <TextInput
                      style={[pw.input, { flex: 1, borderWidth: 0 }]}
                      value={newPw}
                      onChangeText={v => { setNewPw(v); setError(''); }}
                      placeholder="Minimum 8 characters"
                      placeholderTextColor="#444"
                      secureTextEntry={!showPw}
                      autoFocus
                    />
                    <TouchableOpacity onPress={() => setShowPw(v => !v)} style={{ padding: 10 }}>
                      {showPw
                        ? <EyeOff size={18} color="#9a9483" />
                        : <Eye size={18} color="#9a9483" />
                      }
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={pw.inputGroup}>
                  <Text style={pw.label}>Confirm Password</Text>
                  <View style={pw.pwRow}>
                    <TextInput
                      style={[pw.input, { flex: 1, borderWidth: 0 }]}
                      value={confirmPw}
                      onChangeText={v => { setConfirmPw(v); setError(''); }}
                      placeholder="Repeat new password"
                      placeholderTextColor="#444"
                      secureTextEntry={!showConfirm}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={{ padding: 10 }}>
                      {showConfirm
                        ? <EyeOff size={18} color="#9a9483" />
                        : <Eye size={18} color="#9a9483" />
                      }
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Strength bar */}
                {newPw.length > 0 && (
                  <View style={pw.strengthRow}>
                    {[1, 2, 3, 4].map(i => {
                      const strength =
                        newPw.length >= 12 && /[!@#$%^&*]/.test(newPw) && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) ? 4 :
                        newPw.length >= 10 && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) ? 3 :
                        newPw.length >= 8 ? 2 : 1;
                      const color = strength === 1 ? '#ff4444' : strength === 2 ? '#f0a500' : strength === 3 ? '#4ecdc4' : '#00c864';
                      return (
                        <View
                          key={i}
                          style={[pw.strengthBar, { backgroundColor: i <= strength ? color : '#2a2a2a' }]}
                        />
                      );
                    })}
                    <Text style={pw.strengthLabel}>
                      {newPw.length < 8 ? 'Too short' : newPw.length < 10 ? 'Fair' : /[!@#$%^&*]/.test(newPw) ? 'Strong 💪' : 'Good'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[pw.btn, loading && pw.btnDisabled]}
                  onPress={updatePassword}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={pw.btnText}>Update Password</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            {/* ── STEP: done ── */}
            {step === 'done' && (
              <TouchableOpacity style={pw.btn} onPress={handleClose}>
                <Text style={pw.btnText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
// Workaround for StyleSheet.absoluteFill in plain object style
const StyleSheet_abs = {
  position: 'absolute' as const,
  top: 0, left: 0, right: 0, bottom: 0,
};

const pw = {
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { ...StyleSheet_abs, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 44,
    gap: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderBottomWidth: 0,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center' as const, marginBottom: 8 },
  closeBtn: {
    position: 'absolute' as const, top: 20, right: 24,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  emoji: { fontSize: 40, textAlign: 'center' as const },
  title: { color: '#f0ece0', fontSize: 22, fontFamily: 'Georgia', textAlign: 'center' as const },
  sub: { color: '#9a9483', fontSize: 13, textAlign: 'center' as const, lineHeight: 20 },
  stepsRow: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 8, marginVertical: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a2a2a' },
  stepDotActive: { backgroundColor: '#c9a84c', width: 20, borderRadius: 4 },
  stepDotDone: { backgroundColor: '#c9a84c44' },
  errorBox: { backgroundColor: 'rgba(255,50,50,0.08)', borderWidth: 1, borderColor: 'rgba(255,50,50,0.3)', borderRadius: 12, padding: 12 },
  errorText: { color: '#ff6b6b', fontSize: 13, fontWeight: '600' as const },
  inputGroup: { gap: 8 },
  label: { color: '#9a9483', fontSize: 10, fontWeight: '900' as const, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 14, padding: 16, color: '#f0ece0', fontSize: 16,
    letterSpacing: 2,
  },
  pwRow: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 14, paddingLeft: 16 },
  strengthRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { color: '#9a9483', fontSize: 10, fontWeight: '700' as const, minWidth: 60 },
  btn: { backgroundColor: '#c9a84c', borderRadius: 16, padding: 18, alignItems: 'center' as const, marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '900' as const, fontSize: 15 },
  ghost: { alignItems: 'center' as const, padding: 10 },
  ghostText: { color: '#9a9483', fontSize: 13, fontWeight: '700' as const, textDecorationLine: 'underline' as const },
};



// ─── Main Settings Screen ──────────────────────────────────────────────────────

import { StyleSheet } from 'react-native';

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
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>(
    (user?.unsafeMetadata?.theme as any) || 'system'
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Profile edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingExtra, setIsEditingExtra] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress || '');
  const [sex, setSex] = useState((user?.unsafeMetadata?.sex as string) || 'N/A');
  const [dob, setDob] = useState((user?.unsafeMetadata?.dob as string) || 'N/A');
  const [nationality, setNationality] = useState((user?.unsafeMetadata?.nationality as string) || 'Global Archivist');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => { calculateCacheSize(); }, []);

  const calculateCacheSize = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return;
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      let total = 0;
      for (const f of files) {
        const info = await FileSystem.getInfoAsync(cacheDir + f);
        if (info.exists && !info.isDirectory) total += (info as any).size || 0;
      }
      setCacheSize((total / 1024 / 1024).toFixed(2));
    } catch { /* silent */ }
  };

  const handleUpdateName = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await user.update({ firstName, lastName });
      setIsEditingName(false);
      Alert.alert('✓ Updated', 'Name saved successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update name.');
    } finally { setLoading(false); }
  };

  const handleUpdateExtra = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, sex, dob, nationality } });
      setIsEditingExtra(false);
      Alert.alert('✓ Updated', 'Passport details saved.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update.');
    } finally { setLoading(false); }
  };

  const handleUpdateEmail = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await user.createEmailAddress({ email });
      setIsEditingEmail(false);
      Alert.alert('✓ Verification Sent', 'Check your new email to confirm the change.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to change email.');
    } finally { setLoading(false); }
  };

  const handleSignOut = () =>
    Alert.alert('End Expedition', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { signOut(); router.replace('/'); } },
    ]);

  const clearCache = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        for (const f of files) await FileSystem.deleteAsync(cacheDir + f, { idempotent: true });
      }
      Alert.alert('Cache Cleared', `Reclaimed ~${cacheSize} MB`);
      setCacheSize('0.00');
    } catch { Alert.alert('Notice', 'Cache is already clean.'); }
  };

  return (
    <View style={st.root}>
      {/* Password modal */}
      <PasswordModal
        visible={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        user={user}
      />

      {/* Header */}
      <View style={st.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <ChevronLeft color="#c9a84c" size={24} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{t('settings')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

        {/* ── IDENTITY ──────────────────────────────────────────────────────── */}
        <Section label={t('identityProfile') ?? 'Identity & Profile'}>

          {/* Name */}
          <SettingRow icon={<User size={20} color="#c9a84c" />} label={t('fullName') ?? 'Full Name'}>
            {isEditingName ? (
              <View style={st.editBlock}>
                <View style={st.nameRow}>
                  <TextInput
                    style={[st.input, { flex: 1 }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                    placeholderTextColor="#444"
                  />
                  <TextInput
                    style={[st.input, { flex: 1 }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                    placeholderTextColor="#444"
                  />
                </View>
                <View style={st.actionRow}>
                  <TouchableOpacity style={st.saveBtn} onPress={handleUpdateName} disabled={loading}>
                    <Check size={15} color="#000" />
                    <Text style={st.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.cancelBtn} onPress={() => setIsEditingName(false)}>
                    <X size={15} color="#9a9483" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={st.rowRight}>
                <Text style={st.valueText}>{user?.fullName || 'Anonymous Explorer'}</Text>
                <TouchableOpacity style={st.editChip} onPress={() => setIsEditingName(true)}>
                  <Text style={st.editChipText}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </SettingRow>

          {/* Passport info */}
          <SettingRow icon={<Shield size={20} color="#c9a84c" />} label={t('digitalPassport') ?? 'Digital Passport'}>
            {isEditingExtra ? (
              <View style={st.editBlock}>
                {[
                  { label: t('sex') ?? 'Sex', val: sex, set: setSex, ph: 'M / F / X' },
                  { label: t('dateOfBirth') ?? 'Date of Birth', val: dob, set: setDob, ph: 'DD/MM/YYYY' },
                  { label: t('nationality') ?? 'Nationality', val: nationality, set: setNationality, ph: 'e.g. French' },
                ].map(f => (
                  <View key={f.label} style={st.extraField}>
                    <Text style={st.extraLabel}>{f.label}</Text>
                    <TextInput
                      style={[st.input, { flex: 1 }]}
                      value={f.val}
                      onChangeText={f.set}
                      placeholder={f.ph}
                      placeholderTextColor="#444"
                    />
                  </View>
                ))}
                <View style={st.actionRow}>
                  <TouchableOpacity style={st.saveBtn} onPress={handleUpdateExtra} disabled={loading}>
                    <Check size={15} color="#000" />
                    <Text style={st.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.cancelBtn} onPress={() => setIsEditingExtra(false)}>
                    <X size={15} color="#9a9483" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={st.rowRight}>
                <Text style={st.valueText}>{sex} · {dob} · {nationality}</Text>
                <TouchableOpacity style={st.editChip} onPress={() => setIsEditingExtra(true)}>
                  <Text style={st.editChipText}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </SettingRow>

          {/* Email */}
          <SettingRow icon={<Mail size={20} color="#c9a84c" />} label={t('emailAddress') ?? 'Email Address'}>
            {isEditingEmail ? (
              <View style={st.editBlock}>
                <TextInput
                  style={st.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="new@example.com"
                  placeholderTextColor="#444"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <View style={st.actionRow}>
                  <TouchableOpacity style={st.saveBtn} onPress={handleUpdateEmail} disabled={loading}>
                    <Check size={15} color="#000" />
                    <Text style={st.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.cancelBtn} onPress={() => setIsEditingEmail(false)}>
                    <X size={15} color="#9a9483" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={st.rowRight}>
                <Text style={st.valueText} numberOfLines={1}>{user?.primaryEmailAddress?.emailAddress}</Text>
                <TouchableOpacity style={st.editChip} onPress={() => setIsEditingEmail(true)}>
                  <Text style={st.editChipText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </SettingRow>

          {/* Password — opens modal */}
          <TouchableOpacity style={st.row} onPress={() => setShowPasswordModal(true)}>
            <View style={st.rowIcon}>
              <Lock size={20} color="#c9a84c" />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={st.rowLabel}>{t('resetPassword') ?? 'Change Password'}</Text>
              <Text style={st.rowSub}>Verify via email then set a new password</Text>
            </View>
            <View style={st.chevronChip}>
              <Text style={st.editChipText}>Change →</Text>
            </View>
          </TouchableOpacity>

        </Section>

        {/* ── GENERAL ───────────────────────────────────────────────────────── */}
        <Section label={t('generalPreferences') ?? 'General'}>

          <SettingRow icon={<Bell size={20} color="#c9a84c" />} label={t('discoveryAlerts') ?? 'Discovery Alerts'} sub={t('notifyNear') ?? 'Notify when near monuments'}>
            <Switch
              value={notifications}
              onValueChange={async v => {
                setNotifications(v);
                if (v) await Notifications.requestPermissionsAsync();
              }}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingRow>

          <SettingRow icon={<Globe size={20} color="#c9a84c" />} label={t('appLanguage') ?? 'Language'} sub={t('translationsAI') ?? 'AI-translated interface'}>
            <View style={st.chipRow}>
              {(['English', 'Français', 'Español'] as Language[]).map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setLanguage(lang)}
                  style={[st.langChip, language === lang && st.langChipActive]}
                >
                  <Text style={[st.langChipText, language === lang && { color: '#000' }]}>{lang}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>

          <SettingRow icon={<Moon size={20} color="#c9a84c" />} label={t('immersiveDark') ?? 'Theme'} sub={t('toggleAppTheme') ?? 'Light, dark, or system'}>
            <View style={st.chipRow}>
              {[
                { id: 'light' as const, icon: <Sun size={13} /> },
                { id: 'dark' as const, icon: <Moon size={13} /> },
                { id: 'system' as const, icon: <Smartphone size={13} /> },
              ].map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={async () => {
                    setSelectedTheme(item.id);
                    setColorScheme(item.id);
                    if (user) await user.update({ unsafeMetadata: { ...user.unsafeMetadata, theme: item.id } });
                  }}
                  style={[st.themeBtn, selectedTheme === item.id && st.themeBtnActive]}
                >
                  {React.cloneElement(item.icon, { color: selectedTheme === item.id ? '#000' : '#c9a84c' })}
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>

          <SettingRow icon={<Globe size={20} color="#c9a84c" />} label={t('metricUnits') ?? 'Metric Units'} sub={t('useKmMeters') ?? 'Distances in km & meters'}>
            <Switch
              value={preciseLocation}
              onValueChange={async v => {
                setPreciseLocation(v);
                if (v) await Location.requestForegroundPermissionsAsync();
              }}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingRow>

        </Section>

        {/* ── AI & ARCHIVING ─────────────────────────────────────────────────── */}
        <Section label={t('aiArchiving') ?? 'AI & Archiving'}>

          <SettingRow icon={<Info size={20} color="#c9a84c" />} label={t('aiCompanion') ?? 'AI Companion'} sub={t('enableHistorical') ?? 'Enable historical narration'}>
            <Switch
              value={aiAssistant}
              onValueChange={setAiAssistant}
              trackColor={{ false: '#1a1a1a', true: '#c9a84c' }}
              thumbColor="#fff"
            />
          </SettingRow>

          <TouchableOpacity style={st.row} onPress={clearCache}>
            <View style={st.rowIcon}><Trash2 size={20} color="#c9a84c" /></View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={st.rowLabel}>{t('clearMapsCache') ?? 'Clear Cache'}</Text>
              <Text style={st.rowSub}>Free up ~{cacheSize} MB of local storage</Text>
            </View>
          </TouchableOpacity>

        </Section>

        {/* ── LEGAL ─────────────────────────────────────────────────────────── */}
        <Section label={t('legalSupport') ?? 'Legal & Support'}>

          <TouchableOpacity
            style={st.row}
            onPress={() => Alert.alert('Privacy Policy',
              "• We do NOT own your data.\n• Photos are stored on your private database.\n• Location is used only for geofencing and never sold."
            )}
          >
            <View style={st.rowIcon}><Shield size={20} color="#c9a84c" /></View>
            <Text style={[st.rowLabel, { marginLeft: 16 }]}>{t('privacyPolicy') ?? 'Privacy Policy'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={st.row}
            onPress={() => Alert.alert('Terms of Service',
              "• Explore respectfully — do not trespass.\n• Obey all local laws.\n• AI histories are for educational purposes and may have inaccuracies."
            )}
          >
            <View style={st.rowIcon}><Heart size={20} color="#c9a84c" /></View>
            <Text style={[st.rowLabel, { marginLeft: 16 }]}>{t('termsOfService') ?? 'Terms of Service'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[st.row, { marginTop: 8 }]} onPress={handleSignOut}>
            <View style={[st.rowIcon, { backgroundColor: 'rgba(255,50,50,0.08)', borderColor: 'rgba(255,50,50,0.15)' }]}>
              <LogOut size={20} color="#ff4444" />
            </View>
            <Text style={[st.rowLabel, { marginLeft: 16, color: '#ff4444' }]}>{t('endExpedition') ?? 'Sign Out'}</Text>
          </TouchableOpacity>

        </Section>

        {/* Version */}
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ color: '#333', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>
            {t('version') ?? 'RELICA v1.0'}
          </Text>
          <Text style={{ color: '#222', fontSize: 9, marginTop: 4, fontStyle: 'italic' }}>
            {t('craftedFor') ?? 'Crafted for explorers'}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionLabel}>{label}</Text>
      <View style={st.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({
  icon, label, sub, children,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={st.settingRow}>
      <View style={st.rowIcon}>{icon}</View>
      <View style={{ flex: 1, marginLeft: 16 }}>
        <Text style={st.rowLabel}>{label}</Text>
        {sub ? <Text style={st.rowSub}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0e0e' },
  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  headerTitle: { color: '#f0ece0', fontSize: 24, fontFamily: 'Georgia' },
  section: { paddingHorizontal: 20, marginTop: 28 },
  sectionLabel: {
    color: '#9a9483', fontSize: 10, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: '#141414', borderRadius: 20,
    borderWidth: 1, borderColor: '#1e1e1e', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { color: '#f0ece0', fontSize: 15, fontFamily: 'Georgia' },
  rowSub: { color: '#9a9483', fontSize: 11, marginTop: 2, marginBottom: 6 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  valueText: { color: '#9a9483', fontSize: 12, flex: 1 },
  editChip: {
    backgroundColor: 'rgba(201,168,76,0.1)', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
  },
  chevronChip: {
    backgroundColor: 'rgba(201,168,76,0.08)', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
  },
  editChipText: { color: '#c9a84c', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  editBlock: { marginTop: 12, gap: 10 },
  nameRow: { flexDirection: 'row', gap: 10 },
  extraField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  extraLabel: { color: '#9a9483', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', width: 70 },
  input: {
    backgroundColor: '#0e0e0e', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#f0ece0', fontSize: 14,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#c9a84c', borderRadius: 12, padding: 12,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtn: {
    width: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12,
  },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  langChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: 'transparent',
  },
  langChipActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  langChipText: { color: '#9a9483', fontSize: 12, fontWeight: '700' },
  themeBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a',
  },
  themeBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
});