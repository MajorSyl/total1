// lib/supabase.ts
// Web/Next.js Supabase client (separate from the mobile client — different env var prefix)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://axeprqcffgwgocglijst.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZXBycWNmZmd3Z29jZ2xpanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODQ2ODcsImV4cCI6MjEwMDE2MDY4N30.2xb3Fam5IKNwHCbVTsIWpea7fWXVYcUJP6YzcseddOY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
