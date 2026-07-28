import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;
const TOAST_DURATION = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
    });
    // Auto-dismiss after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast overlay */}
      <View style={styles.overlay} pointerEvents="none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ─── Individual Toast ─────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: ToastMessage }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const hideTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start();
    }, TOAST_DURATION - 200);

    return () => clearTimeout(hideTimer);
  }, []);

  const borderColor =
    toast.type === 'success' ? '#c9a84c' :
    toast.type === 'error' ? '#ff4444' :
    '#4a9eff';

  const icon =
    toast.type === 'success' ? '✓' :
    toast.type === 'error' ? '✕' :
    'ℹ';

  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }], borderColor }]}>
      <Text style={[styles.icon, { color: borderColor }]}>{icon}</Text>
      <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 99999,
    gap: 8,
    alignItems: 'center',
  },
  toast: {
    width: width - 32,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  icon: {
    fontSize: 16,
    fontWeight: '900',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  message: {
    flex: 1,
    color: '#f0ece0',
    fontSize: 13,
    lineHeight: 18,
  },
});
