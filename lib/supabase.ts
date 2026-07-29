import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { recordModuleError } from '@/components/CrashReporter';
import { breadcrumb } from '@/lib/crashDebug';

breadcrumb('S00', 'supabase.ts loaded — url-polyfill imported');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
breadcrumb('S01', `supabase URL: ${supabaseUrl ? '(set)' : '(MISSING)'}`);

// Safe module-scope initialization — never throw, log errors to CrashReporter
let _supabase: SupabaseClient;
try {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  breadcrumb('S02', 'supabase client created OK');
} catch (e) {
  recordModuleError('SUPABASE_INIT', e);
  breadcrumb('S03', `supabase createClient FAILED: ${e}`);
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
