// lib/supabase.ts
// Shared Supabase client for the mobile app.
// Install: npx expo install @supabase/supabase-js @react-native-async-storage/async-storage

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://fnvhevpxpsyyvxqobfmp.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmhldnB4cHN5eXZ4cW9iZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIyMTcsImV4cCI6MjEwMDYxODIxN30.L2V7L32IKxLTl6zq6ewm-naPr9NQBjZ49yWs0ijavYA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
