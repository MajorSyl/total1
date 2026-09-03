# Total Mundo — Expiry Tracker

Product expiry tracking for a retail shop. Staff scan barcodes on a phone to
register batches; managers watch a web dashboard; the system emails and pushes
alerts as products approach their expiry date.

Four parts: a Supabase backend, a React Native (Expo) scanning app, a Next.js
manager dashboard, and an Expo WebView wrapper around that dashboard.

---

## Live URLs

**Manager dashboard:** https://mall-expiry-dashboard.vercel.app

This is the canonical deployment — the one `manager-app/` wraps in its WebView.
Other Vercel URLs exist (`mall-expiry-v2.vercel.app`, and the
`-majorsyls-projects` team-suffixed variant) but are stale or gated by
deployment protection. Don't use them.

**There is no web link for scanning.** Barcode scanning needs the device
camera, so it only works in the installed `mobile/` APK. The web app has
exactly three routes — `/`, `/login`, `/dashboard` — and none of them scan.
The link you give workers is the EAS install page produced by a build; see
[Building the apps](#building-the-apps).

---

## Which project, which login

Two Supabase projects are in play. Most confusion so far has come from mixing
them up, so check this table before debugging a login.

| Surface | Talks to | Log in with |
|---|---|---|
| Installed APK (built before the migration) | **old** | `admin@malltest.com` / `Mall@2026!` |
| `mall-expiry-dashboard.vercel.app` | unconfirmed — see below | see below |
| New APK (after rebuilding) | **new** | `fannah2026@gmail.com` (the only staff account on the new project) |
| Supabase dashboard pages | either | your Supabase account |

**Telling the dashboard's two builds apart on sight** — the login page itself
tells you which project it's hitting, no digging required:

- **Dark background, Spanish** ("Total Mundo" / "Acceso de gerente") → current
  code, **new** project → log in with `fannah2026@gmail.com`
- **Light blue, English** ("MALL EXPIRY TRACKER" / "Manager sign in") → old
  build, **old** project → log in with `admin@malltest.com` / `Mall@2026!`

As of this writing `mall-expiry-dashboard.vercel.app` has not been redeployed
since the migration, so it's most likely still the old build — but check the
page rather than assume.

**New project (dedicated — Total Mundo only)**

- Ref: `fnvhevpxpsyyvxqobfmp`
- URL: `https://fnvhevpxpsyyvxqobfmp.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmhldnB4cHN5eXZ4cW9iZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDIyMTcsImV4cCI6MjEwMDYxODIxN30.L2V7L32IKxLTl6zq6ewm-naPr9NQBjZ49yWs0ijavYA`

`web/.env.local` and `mobile/.env` already hold these values, and both
`lib/supabase.ts` files fall back to them.

**Old project** — `axeprqcffgwgocglijst` ("Easyfen"). Shared with an unrelated
hotel/listings app; that mixing is why we migrated. It holds 8 auth users but
only one has a Total Mundo staff row (`admin@malltest.com`). Kept alive only so
the pre-migration APK keeps working during the transition.

> Anything scanned with the old APK lands in the old project. It will **not**
> raise alerts and will **not** appear on the new dashboard. Fine for testing
> that scanning works; not for real inventory.

---

## Status

Done:

- Schema, RLS, functions, and views migrated to the new project — verified
  directly against the live database, not just assumed from the migration file
- `current_staff()` confirmed `security definer`; RLS confirmed enabled on all
  7 tables with the expected policy counts
- `send-expiry-alerts` edge function deployed to the new project
- Email alerts confirmed working end to end (Resend)
- Web and mobile source both point at the new project
- `worker_setup.sql` applied — `link_staff()` and `v_staff_access` exist and
  work
- `pg_cron` and `pg_net` enabled; both daily jobs scheduled and confirmed
  active (`daily-expiry-check` at 0 10 UTC, `daily-alert-send` at 5 10 UTC —
  6:00/6:05am Venezuela time)
- Test data cleaned up — the `Prueba Push` product/batch/alert (barcode
  `9999999999999`) deleted. The `Tam` batch was deliberately left alone: its
  barcode and category look like a real product, not obvious test data —
  worth a manual look before assuming it's junk

Pending — each needs someone with access to do it:

1. **Redeploy the Vercel dashboard against the new project** — blocked from
   this environment; see [Known gaps](#known-gaps)
2. **Build the scanning APK** — also blocked from this environment; same
   reason
3. **Create worker accounts** in the new project — see
   [Adding workers](#adding-workers). Only one staff account exists so far
   (`fannah2026@gmail.com`, admin)

Push notifications are unverified. They need a build carrying a valid EAS
projectId, and a staff member to open the app once so a token gets registered.

---

## What's here

```
total1/
├── schema.sql                  # Core schema
├── rls_policies.sql            # RLS policies — run after schema.sql
├── migration_complete.sql      # Both of the above, combined, plus seed data
├── worker_setup.sql            # link_staff(), access view, cron, cleanup
├── supabase/functions/send-expiry-alerts/
│   └── index.ts                # Edge Function — push + email digests
│                                # (this is the path `supabase functions deploy`
│                                #  actually reads by convention — don't add a
│                                #  second copy elsewhere, it will silently drift)
├── mobile/                     # Expo app: login → scan → register batch
│   ├── App.tsx
│   ├── lib/supabase.ts
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── BarcodeScanScreen.tsx
│       ├── BatchEntryScreen.tsx
│       ├── NewProductScreen.tsx
│       └── StoreInventoryScreen.tsx
├── manager-app/                # Expo WebView wrapper around the dashboard
│   ├── App.tsx                 # DASHBOARD_URL lives here
│   └── eas.json
└── web/                        # Next.js manager dashboard
    ├── lib/supabase.ts
    └── app/
        ├── page.tsx            # redirects / → /login
        ├── login/page.tsx
        └── dashboard/page.tsx
```

---

## First-time setup

Already done on the current project. Repeat only when standing up a fresh one.

### 1. Run the schema

Open the [SQL Editor](https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/sql/new),
paste all of `migration_complete.sql`, run it. It creates every table, index,
function, view, and RLS policy, and seeds the alert thresholds.

> `current_staff()` must keep its `security definer`. Without it, RLS on
> `staff` calls the function, which queries `staff`, which triggers RLS again —
> the app fails with `stack depth limit exceeded`.

### 2. Create the store and first admin

In [Authentication → Users](https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/auth/users),
add a user with the manager's real email and a password. Then in the SQL Editor:

```sql
insert into stores (name, location)
values ('Total Mundo', 'Tu dirección aquí');

-- then, once worker_setup.sql has been run:
select link_staff('correo@real.com', 'Nombre del Gerente', 'admin');
```

### 3. Deploy the edge function

```bash
export SUPABASE_ACCESS_TOKEN=<token from supabase.com/dashboard/account/tokens>
supabase functions deploy send-expiry-alerts \
  --project-ref fnvhevpxpsyyvxqobfmp \
  --no-verify-jwt
```

`supabase login` can't open a browser in a remote/Codespaces shell, which is
why the token is exported directly.

Then under Edge Functions → Secrets, set:

- `RESEND_API_KEY` — from resend.com
- `ALERT_FROM_EMAIL` — a verified sender in your Resend account

### 4. Schedule the daily jobs

Enable `pg_cron` and `pg_net` under
[Database → Extensions](https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/database/extensions),
then uncomment and run §4 of `worker_setup.sql`. Times there are UTC;
Venezuela is UTC-4, so `0 10 * * *` fires at 6:00am local.

### 5. Update Vercel environment variables

In the Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL` → `https://fnvhevpxpsyyvxqobfmp.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the anon key above

Redeploy afterwards — env var changes don't apply to existing deployments.

Note: `web/lib/supabase.ts` already falls back to the new project's URL/key if
these env vars are unset, so if Vercel has never had them explicitly set to
the *old* project, a plain redeploy of current code is enough on its own —
skip straight to redeploying and check the result before assuming you need to
touch env vars at all.

---

## Adding workers

Run `worker_setup.sql` once first; it defines the helper.

1. [Authentication → Users](https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/auth/users)
   → Add user → their email and a password
2. In the SQL Editor:

```sql
select link_staff('trabajador@ejemplo.com', 'Juan Pérez');            -- staff
select link_staff('gerente@ejemplo.com',    'Ana Gómez', 'manager');  -- manager
```

It resolves the user by email, attaches the store, and creates the staff row,
returning `OK: …` or an error saying what's missing. Re-running it updates
rather than duplicating.

Both steps are required. An auth user with no staff row can authenticate but
gets turned away at the app's second check.

To see everyone and spot incomplete accounts:

```sql
select * from v_staff_access;
```

`SIN PERFIL` in the role column means an auth user with no staff row.

---

## Building the apps

Always pull first — builds run from the working tree, so stale code ships
silently.

```bash
git pull origin claude/mall-expiry-delivery-tfk05w
```

### Scanning app (mobile/)

```bash
cd mobile
npm install
export EXPO_TOKEN=<your current EXPO_TOKEN>
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile sets `distribution: internal`, so EAS returns a
**shareable install page**. That URL is what you send to workers — they open
it on an Android phone, tap install, and allow "install from unknown sources".
It's also listed under expo.dev → `syl-express` → project `total` → Builds.

### Manager app (manager-app/)

```bash
cd manager-app
eas update:configure    # only if app.json has no EAS projectId yet
npx eas-cli@latest build --platform android --profile preview
```

Both build under the `syl-express` Expo account. Supply your current
`EXPO_TOKEN` at build time; don't reuse old tokens.

---

## Running locally

```bash
cd web && npm install && npm run dev        # http://localhost:3000
cd mobile && npm install && npx expo start  # scan the QR with Expo Go
```

Camera scanning needs a real device — it does not work in a simulator or a
browser.

---

## Troubleshooting

**`Network request failed` at login (mobile)**
The device can't reach `supabase.co`. The project itself is usually fine —
check its status in the dashboard before assuming an outage. Test with WiFi
off, on mobile data; if that works, the WiFi network is blocking Supabase. A
VPN is the workaround. Both projects share the `supabase.co` domain, so
rebuilding the APK does not avoid this.

**`Invalid login credentials`**
The request reached Supabase and the email/password didn't match. Usually the
account belongs to the *other* project — check the table at the top.

**"Cuenta no configurada" / no staff profile**
Auth succeeded but there's no staff row. Fix with `link_staff()`.

**`stack depth limit exceeded` when saving a batch**
`current_staff()` lost its `security definer`. Re-run that function definition
from `migration_complete.sql`.

**Edge function reports no pending alerts when alerts exist**
PostgREST silently returns zero rows for three-level nested joins on fresh
projects. `supabase/functions/send-expiry-alerts/index.ts` splits the query in
two to avoid this —
don't recombine them.

---

## Known gaps

- **Push notifications unverified** — needs a build with a valid EAS projectId
  and a staff member to open the app once so a token registers
- **No error monitoring** — no Sentry or equivalent
- **Single store assumed** — `link_staff()` picks the oldest store; it needs a
  store argument before a second location is added
- **Distribution is sideloading** — `eas build` produces APKs installed by
  link. Play Store review is a separate 1–3 day process.
- **`eas build` and `vercel deploy` cannot run from a Claude Code remote
  session** — that environment's network egress proxy rejects direct
  connections to `api.expo.dev` and `api.vercel.com` outright ("organization
  policy"), independent of any token or account. `npx eas-cli` and `npx
  vercel` both install and run fine there, so this looks like an auth problem
  but isn't — it fails before authentication is even checked. MCP-based tools
  (Supabase, and Vercel's *read* tools) work in that environment because they
  route through a different, allowed channel; there's no equivalent for Expo.
  Run both commands from a machine with normal internet access instead —
  don't waste time troubleshooting tokens.
