// lib/supabase.ts
// Shared Supabase client for the mobile app.
// Install: npx expo install @supabase/supabase-js @react-native-async-storage/async-storage

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://axeprqcffgwgocglijst.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZXBycWNmZmd3Z29jZ2xpanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODQ2ODcsImV4cCI6MjEwMDE2MDY4N30.2xb3Fam5IKNwHCbVTsIWpea7fWXVYcUJP6YzcseddOY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
