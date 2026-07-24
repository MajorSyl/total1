-- ============================================================
-- Row Level Security policies
-- Run this AFTER schema.sql. Without this, the anon/public key
-- can read and write everything — not safe to ship without it.
-- ============================================================

alter table stores enable row level security;
alter table staff enable row level security;
alter table products enable row level security;
alter table batches enable row level security;
alter table alert_thresholds enable row level security;
alter table alerts enable row level security;

-- Helper: get the staff row for the currently authenticated user
create or replace function current_staff()
returns table (id uuid, store_id uuid, role text)
language sql stable
as $$
  select id, store_id, role from staff where auth_user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- STAFF: can read colleagues in their own store; admins read all
-- ------------------------------------------------------------
create policy "staff can view own store colleagues"
  on staff for select
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

create policy "staff can update their own profile"
  on staff for update
  using (auth_user_id = auth.uid());

-- ------------------------------------------------------------
-- PRODUCTS: any signed-in staff can read/create (barcode lookup
-- needs to work across the whole catalog, not per-store)
-- ------------------------------------------------------------
create policy "authenticated staff can read products"
  on products for select
  using (auth.uid() is not null);

create policy "authenticated staff can create products"
  on products for insert
  with check (auth.uid() is not null);

-- ------------------------------------------------------------
-- BATCHES: scoped to the staff member's own store
-- ------------------------------------------------------------
create policy "staff can view batches in their store"
  on batches for select
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

create policy "staff can insert batches for their store"
  on batches for insert
  with check (
    store_id in (select store_id from current_staff())
  );

create policy "staff can update batches in their store"
  on batches for update
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

-- ------------------------------------------------------------
-- ALERT THRESHOLDS: readable by all staff, writable by admins only
-- ------------------------------------------------------------
create policy "staff can read alert thresholds"
  on alert_thresholds for select
  using (auth.uid() is not null);

create policy "admins manage alert thresholds"
  on alert_thresholds for all
  using (exists (select 1 from current_staff() where role = 'admin'))
  with check (exists (select 1 from current_staff() where role = 'admin'));

-- ------------------------------------------------------------
-- ALERTS: scoped through the batch's store
-- ------------------------------------------------------------
create policy "staff can view alerts for their store's batches"
  on alerts for select
  using (
    batch_id in (
      select id from batches
      where store_id in (select store_id from current_staff())
    )
    or exists (select 1 from current_staff() where role = 'admin')
  );

create policy "staff can acknowledge alerts for their store"
  on alerts for update
  using (
    batch_id in (
      select id from batches
      where store_id in (select store_id from current_staff())
    )
  );

-- ------------------------------------------------------------
-- STORES: any signed-in staff can read store names (for dropdowns
-- etc); only admins manage store records
-- ------------------------------------------------------------
create policy "staff can read stores"
  on stores for select
  using (auth.uid() is not null);

create policy "admins manage stores"
  on stores for all
  using (exists (select 1 from current_staff() where role = 'admin'))
  with check (exists (select 1 from current_staff() where role = 'admin'));

-- ------------------------------------------------------------
-- Note: the send-expiry-alerts Edge Function and the daily cron
-- job use the SERVICE ROLE key, which bypasses RLS entirely.
-- That's expected — server-side jobs are trusted. RLS above only
-- governs what the mobile app and web dashboard can see via the
-- anon/authenticated key.
-- ------------------------------------------------------------
