# Total Mundo — Expiry Tracker

Full system: Supabase backend, React Native (Expo) mobile app for scanning/registering
batches, Next.js dashboard for managers, Expo WebView manager app.

## What's here

```
total1/
├── schema.sql                  # Core schema — run this first in SQL Editor
├── rls_policies.sql            # RLS policies — run after schema.sql
├── send-expiry-alerts/
│   └── index.ts                # Supabase Edge Function — push + email alerts (deploy via CLI)
├── mobile/                     # Expo app: staff login → scan → register batch
│   ├── App.tsx
│   ├── package.json
│   ├── app.json
│   ├── lib/supabase.ts
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── BarcodeScanScreen.tsx
│       ├── BatchEntryScreen.tsx
│       └── NewProductScreen.tsx
├── manager-app/                # Expo WebView wrapper — loads dashboard in a native shell
│   ├── App.tsx
│   ├── app.json
│   ├── eas.json
│   └── package.json
└── web/                        # Next.js manager dashboard
    ├── package.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── lib/supabase.ts
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx             (redirects / → /login)
        ├── login/page.tsx       (auth gate)
        └── dashboard/page.tsx
```

## Live URLs

**Manager dashboard:** https://mall-expiry-dashboard.vercel.app

This is the canonical deployment — the one `manager-app/` wraps in its WebView.
Other Vercel URLs exist (`mall-expiry-v2`, and the `-majorsyls-projects` team-suffixed
variant) but are stale or gated by deployment protection. Don't use them.

There is **no web link for scanning.** Barcode scanning needs the device camera, so it
only works in the installed `mobile/` APK — see "Build the apps" below.

## Supabase project (dedicated — Total Mundo only)

**Project ref:** `fnvhevpxpsyyvxqobfmp`
**URL:** `https://fnvhevpxpsyyvxqobfmp.supabase.co`
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmhldnB4cHN5eXZ4cW9iZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIyMTcsImV4cCI6MjEwMDYxODIxN30.L2V7L32IKxLTl6zq6ewm-naPr9NQBjZ49yWs0ijavYA`

Both `web/.env.local` and `mobile/.env` are pre-populated with these values.

---

## First-time setup (one-off, done by admin)

### 1. Run schema in Supabase SQL Editor

Go to `https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/sql` → New query.
Paste the full contents of `schema.sql`, run it.
Then paste the full contents of `rls_policies.sql`, run it.

See `migration_complete.sql` in the project root for a single combined script that includes
all tables, functions, RLS, and seed data (alert thresholds).

### 2. Create the first admin auth account

In Supabase Dashboard → Authentication → Users → Invite user (or Add user):
- Enter the manager's real email + password
- Copy the user ID shown after creation

Then in SQL Editor:
```sql
-- Replace the values below with real ones
insert into stores (name, location)
values ('Total Mundo', 'Tu dirección aquí')
returning id;
-- Copy the store ID from the output, then:

insert into staff (auth_user_id, store_id, full_name, role, email)
values (
  '<auth_user_id from above>',
  '<store_id from above>',
  'Nombre del Gerente',
  'admin',
  'correo@real.com'
);
```

### 3. Deploy the edge function

```bash
# From the project root, using Supabase CLI (supabase.com/docs/guides/cli)
supabase login                          # sign in with your Supabase account
supabase functions deploy send-expiry-alerts \
  --project-ref fnvhevpxpsyyvxqobfmp \
  --no-verify-jwt
```

Then in Dashboard → Edge Functions → `send-expiry-alerts` → Secrets, add:
- `RESEND_API_KEY` — from resend.com (free for low volume)
- `ALERT_FROM_EMAIL` — a verified sender address in your Resend account

### 4. Schedule the daily jobs

In Supabase Dashboard → Database → Extensions → enable `pg_cron`.

Then in SQL Editor:
```sql
-- Run the expiry check at 6:00am daily
select cron.schedule('daily-expiry-check', '0 6 * * *', $$ select check_expiry_thresholds(); $$);
-- Send alerts at 6:05am (after check)
select cron.schedule('daily-alert-send', '5 6 * * *',
  $$ select net.http_post(url := 'https://fnvhevpxpsyyvxqobfmp.supabase.co/functions/v1/send-expiry-alerts',
     headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb) $$);
```

### 5. Update Vercel environment variables

In your Vercel project settings → Environment Variables, update:
- `NEXT_PUBLIC_SUPABASE_URL` → `https://fnvhevpxpsyyvxqobfmp.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → (the anon key above)

Redeploy after updating.

---

## Build the apps

### Staff scanning APK (Expo — mobile/)
```bash
git pull origin claude/mall-expiry-delivery-tfk05w
cd mobile
eas build --platform android --profile preview --non-interactive
```

### Manager admin APK (Expo WebView — manager-app/)
```bash
cd manager-app
eas update:configure    # adds EAS projectId to app.json
eas build --platform android --profile preview --non-interactive
```

Both builds use the `syl-express` Expo account. Supply your current EXPO_TOKEN — do not reuse old tokens.

---

## Run locally

### Web dashboard
```bash
cd web && npm install && npm run dev
```
Visit `http://localhost:3000`.

### Mobile app
```bash
cd mobile && npm install && npx expo start
```
Scan QR with Expo Go on a real device (camera scanning requires a real phone).

---

## Known gaps before production use

- **Push tokens**: staff must open the mobile app at least once to register a push token. Without a token the `send-expiry-alerts` function skips push delivery.
- **Email**: needs Resend key + verified sender domain (see step 3 above).
- **No error monitoring**: Sentry or equivalent not installed.
- **Barcode scanning requires a real device**: camera doesn't work in simulators or browsers.
- **Store/App distribution**: `eas build` produces APKs for sideloading. Play Store / App Store review takes 1–3 days and is separate.
