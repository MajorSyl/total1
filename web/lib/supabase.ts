// lib/supabase.ts
// Web/Next.js Supabase client (separate from the mobile client — different env var prefix)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://fnvhevpxpsyyvxqobfmp.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmhldnB4cHN5eXZ4cW9iZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIyMTcsImV4cCI6MjEwMDYxODIxN30.L2V7L32IKxLTl6zq6ewm-naPr9NQBjZ49yWs0ijavYA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
