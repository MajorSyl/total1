-- ============================================================
-- Mall Product Expiry Notification System — Core Schema
-- Target: PostgreSQL / Supabase
-- ============================================================

-- Enable useful extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- STORES (multi-branch / multi-tenant ready from day one)
-- ------------------------------------------------------------
create table stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- STAFF / USERS (who gets notified, who registers products)
-- ------------------------------------------------------------
create table staff (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id), -- links to Supabase auth
  store_id uuid references stores(id),
  full_name text not null,
  role text not null check (role in ('staff', 'manager', 'admin')),
  email text,
  phone text,
  push_token text, -- for mobile push notifications
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PRODUCTS (identified by barcode — NOT batch-specific)
-- ------------------------------------------------------------
create table products (
  id uuid primary key default uuid_generate_v4(),
  barcode text not null unique,
  name text not null,
  category text,
  image_url text,
  unit text, -- e.g. 'kg', 'piece', 'box'
  created_at timestamptz not null default now()
);

create index idx_products_barcode on products(barcode);

-- ------------------------------------------------------------
-- BATCHES (this is where expiry actually lives — per lot, not per product)
-- ------------------------------------------------------------
create table batches (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id),
  batch_number text,
  quantity numeric not null default 0,
  received_date date not null default current_date,
  expiry_date date not null,
  registered_by uuid references staff(id),
  status text not null default 'active'
    check (status in ('active', 'expired', 'removed', 'discounted', 'donated', 'disposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_batches_expiry on batches(expiry_date);
create index idx_batches_status on batches(status);
create index idx_batches_store on batches(store_id);

-- ------------------------------------------------------------
-- ALERT THRESHOLDS (configurable per category — fresh produce
-- needs earlier warnings than canned goods)
-- ------------------------------------------------------------
create table alert_thresholds (
  id uuid primary key default uuid_generate_v4(),
  category text not null unique,
  warning_days int[] not null default array[30, 14, 7, 3], -- days before expiry to alert
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ALERTS (one row per batch per threshold crossed — avoids duplicate spam)
-- ------------------------------------------------------------
create table alerts (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid not null references batches(id) on delete cascade,
  threshold_days int not null,
  urgency text not null check (urgency in ('warning', 'urgent', 'expired')),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references staff(id),
  created_at timestamptz not null default now(),
  unique (batch_id, threshold_days) -- one alert per threshold per batch
);

create index idx_alerts_batch on alerts(batch_id);
create index idx_alerts_sent on alerts(sent_at);

-- ============================================================
-- FUNCTION: check for batches crossing an alert threshold
-- and create alert rows (does NOT send notifications directly —
-- that's the job of an Edge Function that reads unsent alerts)
-- ============================================================
create or replace function check_expiry_thresholds()
returns void
language plpgsql
as $$
declare
  r record;
  days_left int;
  threshold int;
  urgency_level text;
begin
  for r in
    select b.id as batch_id, b.expiry_date, coalesce(t.warning_days, array[30,14,7,3]) as warning_days
    from batches b
    join products p on p.id = b.product_id
    left join alert_thresholds t on t.category = p.category
    where b.status = 'active'
  loop
    days_left := r.expiry_date - current_date;

    -- Expired case
    if days_left <= 0 then
      insert into alerts (batch_id, threshold_days, urgency)
      values (r.batch_id, 0, 'expired')
      on conflict (batch_id, threshold_days) do nothing;
      update batches set status = 'expired', updated_at = now() where id = r.batch_id;
      continue;
    end if;

    -- Threshold-based warnings
    foreach threshold in array r.warning_days loop
      if days_left <= threshold then
        urgency_level := case when threshold <= 3 then 'urgent' else 'warning' end;
        insert into alerts (batch_id, threshold_days, urgency)
        values (r.batch_id, threshold, urgency_level)
        on conflict (batch_id, threshold_days) do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- SCHEDULE: run the check once a day at 06:00
-- (Edge Function for actually sending notifications should be
-- scheduled separately, right after this, e.g. 06:05)
-- ============================================================
select cron.schedule(
  'daily-expiry-check',
  '0 6 * * *',
  $$ select check_expiry_thresholds(); $$
);

-- ------------------------------------------------------------
-- Convenience view: what staff dashboards will query most
-- ------------------------------------------------------------
create view v_expiring_batches as
select
  b.id as batch_id,
  p.name as product_name,
  p.barcode,
  p.category,
  s.name as store_name,
  b.batch_number,
  b.quantity,
  b.expiry_date,
  (b.expiry_date - current_date) as days_remaining,
  b.status
from batches b
join products p on p.id = b.product_id
join stores s on s.id = b.store_id
where b.status in ('active', 'expired')
order by b.expiry_date asc;
