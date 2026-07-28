import { useState, useEffect } from 'react';
import { supabase, createClerkSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@clerk/clerk-expo';
import { Session } from '@/types';
import { useDemoMode } from '@/lib/demoMode';

export function useGallery() {
  const auth = useAuth();
  const { isDemoMode, sessions: demoSessions } = useDemoMode();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    // Demo mode — return mock data immediately
    if (isDemoMode) {
      setSessions(demoSessions);
      setLoading(false);
      return;
    }

    if (!auth.isLoaded || !auth.userId) return;

    try {
      setLoading(true);

      // Try supabase template first, fall back to default
      let token: string | null = null;
      try {
        token = await auth.getToken({ template: 'supabase' });
      } catch {
        token = await auth.getToken();
      }

      const client = token ? createClerkSupabaseClient(token) : supabase;

      const { data, error } = await client
        .from('sessions')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[RELICA] Gallery fetch error:', error.code, error.message);
        throw error;
      }

      setSessions(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [auth.userId, auth.isLoaded, isDemoMode]);

  return { sessions, loading, error, refresh: fetchSessions };
}