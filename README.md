# Mall Product Expiry Tracker

Full system: Supabase backend, React Native (Expo) mobile app for scanning/registering
batches, Next.js dashboard for managers.

## What's here

```
total1/
├── schema.sql                  # Applied — creates all tables + pg_cron job
├── rls_policies.sql            # Applied — locks data access down by store/role
├── send-expiry-alerts/
│   └── index.ts                # Supabase Edge Function — sends daily digest emails (deployed)
├── mobile/                     # Expo app: login → scan → register batch
│   ├── App.tsx
│   ├── package.json
│   ├── app.json
│   ├── lib/supabase.ts
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── BarcodeScanScreen.tsx
│       ├── BatchEntryScreen.tsx
│       └── NewProductScreen.tsx
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

## Live demo credentials (already wired up)

**Supabase project:** `axeprqcffgwgocglijst`  
**URL:** `https://axeprqcffgwgocglijst.supabase.co`  
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZXBycWNmZmd3Z29jZ2xpanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODQ2ODcsImV4cCI6MjEwMDE2MDY4N30.2xb3Fam5IKNwHCbVTsIWpea7fWXVYcUJP6YzcseddOY`

**Test login:**
- Email: `admin@malltest.com`
- Password: `Mall@2026!`
- Role: admin, Store: Test Mall – Main Branch

**Seeded demo data (7 batches):**

| Product | Barcode | Expiry | Status |
|---------|---------|--------|--------|
| Fresh Milk 1L | 6001234000001 | 2026-07-22 | **EXPIRED** |
| Yoghurt 500ml | 6001234000002 | 2026-07-21 | **EXPIRED** |
| Orange Juice 2L | 6001234000003 | 2026-07-25 | Urgent (1d) |
| Bread Loaf | 6001234000004 | 2026-07-26 | Urgent (2d) |
| Cheddar Cheese 500g | 6001234000005 | 2026-07-31 | 7d |
| Butter 250g | 6001234000006 | 2026-08-23 | 30d |
| Pasta 500g | 6001234000007 | 2027-07-24 | 365d |

Both `.env.local` (web) and `.env` (mobile) are pre-populated with the above credentials.

---

## Run it locally right now

### Web dashboard
```bash
cd web
npm install        # already done; re-run if you get module errors
npm run dev
```
Visit `http://localhost:3000` — it redirects to `/login`, sign in with the test credentials above.

### Mobile app
```bash
cd mobile
npm install        # already done
npx expo start
```
Scan the QR with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android.

---

## Deploy the web dashboard to Vercel (2-minute manual step)

The automated deploy hit a permissions issue. Here's the manual path:

1. Go to **[vercel.com](https://vercel.com)** → **Add New → Project**
2. Import the **`MajorSyl/total1`** repository from GitHub
3. Set **Root Directory** to `web`
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://axeprqcffgwgocglijst.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZXBycWNmZmd3Z29jZ2xpanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODQ2ODcsImV4cCI6MjEwMDE2MDY4N30.2xb3Fam5IKNwHCbVTsIWpea7fWXVYcUJP6YzcseddOY`
5. Click **Deploy** — done in ~90 seconds

The Next.js build already passes cleanly (4 routes, 0 errors), so the deploy will succeed on the first try.

---

## Edge Function (daily expiry alerts) — already deployed

The `send-expiry-alerts` function is live on Supabase and fires when called. To wire up email sending:

1. Get a free API key at [resend.com](https://resend.com)
2. In Supabase Dashboard → Edge Functions → `send-expiry-alerts` → Secrets, add:
   - `RESEND_API_KEY` = your key
3. Update `from: "alerts@yourdomain.com"` in `send-expiry-alerts/index.ts` to your verified sender domain in Resend
4. Schedule: Dashboard → Edge Functions → `send-expiry-alerts` → Cron → set to `10 6 * * *` (runs at 6:10am daily, after the DB job at 6:00am)

Without the Resend key set, the function runs safely and returns success — it just won't send emails.

---

## Honest gaps — tell the client these

- **Vercel deploy is manual** (see steps above). Once done, the link is live forever and future pushes deploy automatically via GitHub.
- **Mobile barcode scanning needs a real device.** `expo-camera` doesn't work in web browser or most simulators. Expo Go on any Android or iOS phone works fine.
- **Email alerts need a Resend account.** Edge Function is deployed and functional; email delivery requires the Resend key above (~5 minutes to set up).
- **Push notifications are stubbed, not wired.** The code is in the Edge Function but commented out. Turning it on needs push tokens saved per staff member — a follow-up sprint item.
- **App Store / Play Store distribution is not same-day.** Expo Go works immediately on any device. Native store builds via `eas build` + Apple/Google review take 1–3 days minimum. Don't promise that to the client.
- **No automated test suite.** Everything is hand-verifiable; tests are a follow-up.
- **Not load-tested.** Fine for one mall's inventory. If it scales to dozens of branches, benchmark `check_expiry_thresholds()` at that volume first.
