import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

// ── Global module-scope error collector ──────────────────────────────
// Any module-scope try/catch can push errors here before React mounts.
type ModuleError = { phase: string; message: string; stack?: string };

declare global {
  var __CRASH_REPORTER_ERRORS__: ModuleError[] | undefined;
}

if (!global.__CRASH_REPORTER_ERRORS__) {
  global.__CRASH_REPORTER_ERRORS__ = [];
}

export function recordModuleError(phase: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  global.__CRASH_REPORTER_ERRORS__?.push({ phase, message: msg, stack });
}

// ── Env-var snapshot (built at import time) ──────────────────────────
const ENV_SNAPSHOT = {
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '(undefined)',
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '(undefined)',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    ? `${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.substring(0, 8)}...`
    : '(undefined)',
  EXPO_PUBLIC_OPENROUTER_API_KEY: process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
    ? `${process.env.EXPO_PUBLIC_OPENROUTER_API_KEY.substring(0, 8)}...`
    : '(undefined)',
};

// ── ErrorBoundary ───────────────────────────────────────────────────
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class CrashReporter extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>CRASH REPORT</Text>

            <Text style={styles.section}>ENV VARS (build-time):</Text>
            {Object.entries(ENV_SNAPSHOT).map(([k, v]) => (
              <Text key={k} style={styles.envLine}>
                {k}: {v}
              </Text>
            ))}

            <Text style={styles.section}>MODULE-SCOPE ERRORS:</Text>
            {global.__CRASH_REPORTER_ERRORS__?.length ? (
              global.__CRASH_REPORTER_ERRORS__.map((e, i) => (
                <Text key={i} style={styles.errorLine}>
                  [{e.phase}] {e.message}
                  {e.stack ? `\n${e.stack}` : ''}
                </Text>
              ))
            ) : (
              <Text style={styles.errorLine}>(none)</Text>
            )}

            <Text style={styles.section}>RENDER ERROR:</Text>
            <Text style={styles.errorLine} selectable>
              {this.state.error?.message}
            </Text>
            <Text style={styles.errorLine} selectable>
              {this.state.error?.stack}
            </Text>

            {this.state.componentStack ? (
              <>
                <Text style={styles.section}>COMPONENT STACK:</Text>
                <Text style={styles.errorLine} selectable>
                  {this.state.componentStack}
                </Text>
              </>
            ) : null}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    color: '#ff4444',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  section: {
    color: '#ffcc00',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 4,
  },
  envLine: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Courier',
    marginLeft: 8,
    marginBottom: 2,
  },
  errorLine: {
    color: '#ff8888',
    fontSize: 11,
    fontFamily: 'Courier',
    marginLeft: 8,
    marginBottom: 4,
  },
});
