# Mall Product Expiry Tracker

Full system: Supabase backend, React Native (Expo) mobile app for scanning/registering
batches, Next.js dashboard for managers.

## What's here

```
mall-expiry-system/
├── schema.sql                  # Run first — creates all tables + pg_cron job
├── rls_policies.sql            # Run second — locks data access down by store/role
├── send-expiry-alerts/
│   └── index.ts                # Supabase Edge Function — sends daily digest emails
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
        └── dashboard/page.tsx
```

## Setup — in order

### 1. Supabase project
1. Create a project at supabase.com
2. Open the SQL Editor, run `schema.sql`, then run `rls_policies.sql`
3. In Authentication → Users, create your first staff login (email/password)
4. In the SQL Editor, insert a matching row so that login can actually get in:
   ```sql
   insert into stores (name) values ('Main Branch');
   insert into staff (auth_user_id, store_id, full_name, role, email)
   values ('<the auth user's UUID from Authentication tab>', '<store id from above>', 'Your Name', 'admin', 'you@mall.com');
   ```
5. Copy your Project URL and anon key from Settings → API — you'll need these next.

### 2. Edge Function (daily alerts)
```bash
supabase functions deploy send-expiry-alerts
supabase secrets set RESEND_API_KEY=your_resend_key
```
Then schedule it to run daily (a few minutes after the 6am `pg_cron` check) via
Supabase Dashboard → Edge Functions → your function → Cron, or by having
`pg_cron` call the function's URL directly with the service role key.
You'll need a free Resend account for the email sending — swap in Twilio/SendGrid
if you'd rather use SMS or a different provider.

### 3. Mobile app
```bash
cd mobile
npm install
```
Create `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```
```bash
npx expo start
```
Scan the QR with Expo Go on your phone, or press `i`/`a` for simulator.
To ship to real app stores later: `eas build` (Expo's build service) — that's a
separate step from local testing, budget a day or two for store review once you're
ready for that, it isn't same-day.

### 4. Web dashboard
```bash
cd web
npm install
```
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```
```bash
npm run dev
```
Visit `http://localhost:3000/dashboard`. Deploy to Vercel when ready
(`vercel deploy`) — takes minutes since it's already a Next.js app.

## Honest gaps to know about before calling this "done"

These are real and worth telling the client about, not corners to quietly hope no one notices:

- **No dashboard login yet.** The dashboard page has no auth gate — right now anyone
  with the URL sees the data. Needs a login page (same pattern as mobile) or route
  middleware checking the session before this goes to a real client.
- **No automated tests.** Everything here is hand-verifiable logic, not covered by
  a test suite. Fine for an initial delivery, worth adding once real usage starts.
- **GS1 batch-barcodes not handled.** If a supplier's barcode already encodes batch +
  expiry (GS1-128 with AI 17), this app treats it as a plain product barcode and still
  asks staff to type the expiry manually. Worth a follow-up if that's common with this
  mall's suppliers.
- **Push notifications are stubbed, not wired.** The Edge Function has the Expo push
  code commented out — turning it on needs each staff member's push token saved to
  their `staff` row, which happens automatically once the app requests notification
  permissions (not yet added to the mobile app).
- **Not load-tested.** Fine for one mall's inventory; if this scales to many branches,
  the `check_expiry_thresholds()` function should be checked for performance at that
  volume.

## Realistic timeline note

Everything above is real, working code — schema, RLS, Edge Function, both apps — and
you can have it running locally today. But "deliver tomorrow" should mean *demo-ready
locally or on a shared Expo/Vercel link*, not "in production app stores" — Apple/Google
review alone can take 1-3 days and isn't something to promise past your control. Set
that expectation with the client now rather than after they've heard "tomorrow" and
assumed App Store availability.
