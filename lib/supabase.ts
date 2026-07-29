import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { recordModuleError } from '@/components/CrashReporter';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Safe module-scope initialization — never throw, log errors to CrashReporter
let _supabase: SupabaseClient;
try {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch (e) {
  recordModuleError('SUPABASE_INIT', e);
  // Create a dummy client so downstream code doesn't crash on import
  _supabase = createClient('https://placeholder.supabase.co', 'placeholder');
}

export const supabase = _supabase;

/**
 * Creates a Supabase client with the Clerk JWT.
 * This is used to bypass RLS policies that require a specific user.
 */
export const createClerkSupabaseClient = (clerkToken: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${clerkToken}`,
      },
    },
  });
};
