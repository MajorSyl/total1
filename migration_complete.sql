-- ============================================================
-- Total Mundo — Complete Schema Migration
-- Run this in the Supabase SQL Editor (new dedicated project)
-- Paste the full contents and click Run — runs as a single transaction
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  store_id uuid references stores(id),
  full_name text not null,
  role text not null check (role in ('staff', 'manager', 'admin')),
  email text,
  phone text,
  push_token text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  name text not null,
  category text,
  image_url text,
  unit text,
  created_at timestamptz not null default now()
);

create table batches (
  id uuid primary key default gen_random_uuid(),
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

create table alert_thresholds (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  warning_days int[] not null default array[30, 14, 7, 3],
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  threshold_days int not null,
  urgency text not null check (urgency in ('warning', 'urgent', 'expired')),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references staff(id),
  created_at timestamptz not null default now(),
  unique (batch_id, threshold_days)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  performed_by uuid references staff(id),
  performed_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_products_barcode on products(barcode);
create index idx_batches_expiry on batches(expiry_date);
create index idx_batches_status on batches(status);
create index idx_batches_store on batches(store_id);
create index idx_alerts_batch on alerts(batch_id);
create index idx_alerts_sent on alerts(sent_at);
create index idx_staff_auth_user_id on staff(auth_user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function current_staff()
returns table (id uuid, store_id uuid, role text)
language sql stable
security definer
set search_path = public
as $$
  select id, store_id, role from staff where auth_user_id = auth.uid();
$$;

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

    if days_left <= 0 then
      insert into alerts (batch_id, threshold_days, urgency)
      values (r.batch_id, 0, 'expired')
      on conflict (batch_id, threshold_days) do nothing;
      update batches set status = 'expired', updated_at = now() where id = r.batch_id;
      continue;
    end if;

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

create or replace function soft_delete_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_staff_id uuid;
  v_role     text;
  v_old_data jsonb;
begin
  select cs.id, cs.role into v_staff_id, v_role from current_staff() cs limit 1;
  if v_staff_id is null or v_role not in ('manager', 'admin') then
    raise exception 'Solo los gerentes y administradores pueden eliminar lotes.';
  end if;

  select to_jsonb(b) into v_old_data from batches b where b.id = p_batch_id;
  if not found then
    raise exception 'Lote no encontrado.';
  end if;

  update batches set status = 'removed', updated_at = now() where id = p_batch_id;

  insert into audit_log (table_name, row_id, action, old_data, new_data, performed_by)
  values (
    'batches',
    p_batch_id::text,
    'SOFT_DELETE',
    v_old_data,
    jsonb_build_object('status', 'removed'),
    v_staff_id
  );
end;
$$;

-- ============================================================
-- VIEWS
-- ============================================================

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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table stores enable row level security;
alter table staff enable row level security;
alter table products enable row level security;
alter table batches enable row level security;
alter table alert_thresholds enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;

-- Stores
create policy "staff can read stores"
  on stores for select
  using (auth.uid() is not null);

create policy "admins manage stores"
  on stores for all
  using (exists (select 1 from current_staff() where role = 'admin'))
  with check (exists (select 1 from current_staff() where role = 'admin'));

-- Staff
create policy "staff can view own store colleagues"
  on staff for select
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

create policy "staff can update their own profile"
  on staff for update
  using (auth_user_id = auth.uid());

-- Products
create policy "authenticated staff can read products"
  on products for select
  using (auth.uid() is not null);

create policy "authenticated staff can create products"
  on products for insert
  with check (auth.uid() is not null);

create policy "managers can update products"
  on products for update
  using (exists (select 1 from current_staff() cs where cs.role in ('manager', 'admin')));

-- Batches
create policy "staff can view batches in their store"
  on batches for select
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

create policy "staff can insert batches for their store"
  on batches for insert
  with check (store_id in (select store_id from current_staff()));

create policy "staff can update batches in their store"
  on batches for update
  using (
    store_id in (select store_id from current_staff())
    or exists (select 1 from current_staff() where role = 'admin')
  );

-- Alert thresholds
create policy "staff can read alert thresholds"
  on alert_thresholds for select
  using (auth.uid() is not null);

create policy "admins manage alert thresholds"
  on alert_thresholds for all
  using (exists (select 1 from current_staff() where role = 'admin'))
  with check (exists (select 1 from current_staff() where role = 'admin'));

-- Alerts
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

-- Audit log
create policy "managers can read audit log"
  on audit_log for select
  using (exists (select 1 from current_staff() cs where cs.role in ('manager', 'admin')));

create policy "staff can insert audit log"
  on audit_log for insert
  with check (exists (select 1 from current_staff()));

-- ============================================================
-- SEED DATA — alert thresholds only, no test products/batches
-- ============================================================

insert into alert_thresholds (category, warning_days) values
  ('Bakery',    array[7, 3, 1]),
  ('Beverages', array[30, 14, 7]),
  ('Dairy',     array[14, 7, 3, 1]),
  ('Meat',      array[5, 3, 1]),
  ('Produce',   array[5, 3, 1]);
