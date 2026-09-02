-- ============================================================
-- Total Mundo — Worker onboarding + scheduling helpers
-- Run once in the SQL Editor of the NEW project (fnvhevpxpsyyvxqobfmp)
-- https://supabase.com/dashboard/project/fnvhevpxpsyyvxqobfmp/sql
-- ============================================================


-- ============================================================
-- 1. link_staff() — one-command worker onboarding
-- ============================================================
-- Creating an auth user still happens in the Dashboard (Authentication →
-- Users → Add user), because password hashing should not be done by hand in
-- SQL. This function does everything after that: finds the new auth user by
-- email, attaches them to the store, and creates the staff row.
--
-- Usage after creating the auth user in the Dashboard:
--     select link_staff('trabajador@ejemplo.com', 'Juan Pérez');
--     select link_staff('gerente@ejemplo.com', 'Ana Gómez', 'manager');
--
-- Re-running it for the same person updates their name/role instead of
-- creating a duplicate, so it is safe to run twice.

create or replace function link_staff(
  p_email     text,
  p_full_name text,
  p_role      text default 'staff'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_store_id uuid;
  v_existing uuid;
begin
  if p_role not in ('staff', 'manager', 'admin') then
    return 'ERROR: el rol debe ser staff, manager o admin.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    return format(
      'ERROR: no existe una cuenta con el correo %s. '
      'Créala primero en Authentication → Users → Add user.',
      p_email
    );
  end if;

  -- Attach to the store. With a single store this picks it automatically.
  select id into v_store_id from stores order by created_at limit 1;

  if v_store_id is null then
    return 'ERROR: no hay ninguna tienda registrada. Crea una en la tabla stores primero.';
  end if;

  select id into v_existing from staff where auth_user_id = v_user_id;

  if v_existing is not null then
    update staff
       set full_name = p_full_name,
           role      = p_role,
           email     = lower(trim(p_email)),
           store_id  = v_store_id
     where id = v_existing;
    return format('OK: %s actualizado como %s.', p_full_name, p_role);
  end if;

  insert into staff (auth_user_id, store_id, full_name, role, email)
  values (v_user_id, v_store_id, p_full_name, p_role, lower(trim(p_email)));

  return format('OK: %s agregado como %s. Ya puede iniciar sesión y escanear.', p_full_name, p_role);
end;
$$;


-- ============================================================
-- 2. Who currently has access?
-- ============================================================
-- Run this any time to see every account and whether it can actually log in.
-- "SIN PERFIL" means the auth user exists but has no staff row, so the app
-- will reject them at login.

create or replace view v_staff_access as
select
  u.email,
  coalesce(s.full_name, '—')          as full_name,
  coalesce(s.role, 'SIN PERFIL')      as role,
  coalesce(st.name, '—')              as store,
  (s.push_token is not null)          as push_ready,
  u.last_sign_in_at
from auth.users u
left join staff  s  on s.auth_user_id = u.id
left join stores st on st.id = s.store_id
order by s.role nulls last, u.email;


-- ============================================================
-- 3. Remove the test batches created during setup
-- ============================================================
-- Review before running. This clears alerts and batches for the test
-- products, then removes the products themselves.

-- delete from alerts where batch_id in (
--   select b.id from batches b
--   join products p on p.id = b.product_id
--   where p.barcode = '9999999999999' or p.name ilike 'prueba%' or p.name = 'Tam'
-- );
-- delete from batches where product_id in (
--   select id from products
--   where barcode = '9999999999999' or name ilike 'prueba%' or name = 'Tam'
-- );
-- delete from products
--  where barcode = '9999999999999' or name ilike 'prueba%' or name = 'Tam';


-- ============================================================
-- 4. Daily automation (pg_cron)
-- ============================================================
-- First enable the extensions: Dashboard → Database → Extensions →
-- enable "pg_cron" and "pg_net". Then uncomment and run the block below.
--
-- Replace <SERVICE_ROLE_KEY> with the service role key from
-- Dashboard → Settings → API. Do not commit that key anywhere.
--
-- Times are UTC. Venezuela is UTC-4, so 10:00 UTC = 6:00am local.

-- select cron.schedule(
--   'daily-expiry-check',
--   '0 10 * * *',
--   $cron$ select check_expiry_thresholds(); $cron$
-- );
--
-- select cron.schedule(
--   'daily-alert-send',
--   '5 10 * * *',
--   $cron$
--     select net.http_post(
--       url     := 'https://fnvhevpxpsyyvxqobfmp.supabase.co/functions/v1/send-expiry-alerts',
--       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb
--     );
--   $cron$
-- );

-- Verify the schedule afterwards:
--   select jobname, schedule, active from cron.job;
