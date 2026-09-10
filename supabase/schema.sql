create extension if not exists pgcrypto;

create type public.user_role as enum ('customer', 'lab', 'admin');
create type public.order_status as enum ('waiting', 'processing', 'completed', 'cancelled');
create type public.topup_status as enum ('pending', 'approved', 'rejected');

create sequence if not exists public.sperm_order_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  nickname text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'customer',
  credit_balance integer not null default 0 check (credit_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sperm_code text not null unique,
  patient_full_name text not null,
  patient_nickname text,
  date_of_birth date not null,
  age integer not null check (age between 1 and 120),
  phone text not null,
  email text not null,
  status public.order_status not null default 'waiting',
  price_credits integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_credits integer not null check (amount_credits > 0),
  transfer_reference text,
  slip_url text,
  status public.topup_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists topups_one_pending_per_user
on public.topups(user_id)
where status = 'pending';

create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sperm_code text not null references public.orders(sperm_code) on delete cascade,
  video_url text,
  metrics jsonb not null,
  clinical_band text not null,
  recommendation text not null,
  report_text text not null,
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists lab_results_order_id_key on public.lab_results(order_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_lab()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('lab', 'admin')
  );
$$;

create or replace function public.create_order(
  p_full_name text,
  p_nickname text,
  p_date_of_birth date,
  p_age integer,
  p_phone text,
  p_email text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set credit_balance = credit_balance - 100
  where id = auth.uid()
    and credit_balance >= 100;

  if not found then
    raise exception 'Insufficient credit';
  end if;

  v_code := 'Sperm_' || lpad(nextval('public.sperm_order_seq')::text, 3, '0');

  insert into public.orders (
    user_id,
    sperm_code,
    patient_full_name,
    patient_nickname,
    date_of_birth,
    age,
    phone,
    email,
    status,
    price_credits
  )
  values (
    auth.uid(),
    v_code,
    p_full_name,
    p_nickname,
    p_date_of_birth,
    p_age,
    p_phone,
    p_email,
    'waiting',
    100
  )
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.approve_topup(p_topup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup public.topups;
begin
  if not public.is_lab() then
    raise exception 'Lab access required';
  end if;

  select * into v_topup
  from public.topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'Top-up request not found';
  end if;

  if v_topup.status <> 'pending' then
    return;
  end if;

  update public.profiles
  set credit_balance = credit_balance + v_topup.amount_credits
  where id = v_topup.user_id;

  update public.topups
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_topup_id;
end;
$$;

create or replace function public.reject_topup(p_topup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lab() then
    raise exception 'Lab access required';
  end if;

  update public.topups
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_topup_id
    and status = 'pending';

  if not found then
    raise exception 'Pending top-up request not found';
  end if;
end;
$$;

create or replace function public.publish_lab_result(
  p_sperm_code text,
  p_video_url text,
  p_metrics jsonb,
  p_clinical_band text,
  p_recommendation text,
  p_report_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_lab() then
    raise exception 'Lab access required';
  end if;

  select * into v_order
  from public.orders
  where sperm_code = p_sperm_code
  for update;

  if not found then
    raise exception 'Order code not found';
  end if;

  insert into public.lab_results (
    order_id,
    sperm_code,
    video_url,
    metrics,
    clinical_band,
    recommendation,
    report_text,
    published_by,
    published_at
  )
  values (
    v_order.id,
    v_order.sperm_code,
    p_video_url,
    p_metrics,
    p_clinical_band,
    p_recommendation,
    p_report_text,
    auth.uid(),
    now()
  )
  on conflict (order_id) do update
  set
    video_url = excluded.video_url,
    metrics = excluded.metrics,
    clinical_band = excluded.clinical_band,
    recommendation = excluded.recommendation,
    report_text = excluded.report_text,
    published_by = excluded.published_by,
    published_at = excluded.published_at;

  update public.orders
  set status = 'completed'
  where id = v_order.id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.topups enable row level security;
alter table public.lab_results enable row level security;

drop policy if exists "profiles read own or lab" on public.profiles;
create policy "profiles read own or lab"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_lab());

drop policy if exists "profiles update own basic fields" on public.profiles;
create policy "profiles update own basic fields"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "orders read own or lab" on public.orders;
create policy "orders read own or lab"
on public.orders for select
to authenticated
using (user_id = auth.uid() or public.is_lab());

drop policy if exists "topups insert own" on public.topups;
create policy "topups insert own"
on public.topups for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "topups read own or lab" on public.topups;
create policy "topups read own or lab"
on public.topups for select
to authenticated
using (user_id = auth.uid() or public.is_lab());

drop policy if exists "lab results read owner or lab" on public.lab_results;
create policy "lab results read owner or lab"
on public.lab_results for select
to authenticated
using (
  public.is_lab()
  or exists (
    select 1
    from public.orders
    where orders.id = lab_results.order_id
      and orders.user_id = auth.uid()
  )
);

revoke update (role, credit_balance, email, created_at) on public.profiles from authenticated;
grant update (full_name, nickname, phone, avatar_url, updated_at) on public.profiles to authenticated;

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('topup-slips', 'topup-slips', true),
  ('lab-videos', 'lab-videos', false)
on conflict (id) do nothing;

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users read avatars" on storage.objects;
create policy "users read avatars"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars');

drop policy if exists "users upload own topup slip" on storage.objects;
create policy "users upload own topup slip"
on storage.objects for insert
to authenticated
with check (bucket_id = 'topup-slips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users and lab read topup slips" on storage.objects;
create policy "users and lab read topup slips"
on storage.objects for select
to authenticated
using (bucket_id = 'topup-slips' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_lab()));

drop policy if exists "lab manages videos" on storage.objects;
create policy "lab manages videos"
on storage.objects for all
to authenticated
using (bucket_id = 'lab-videos' and public.is_lab())
with check (bucket_id = 'lab-videos' and public.is_lab());

-- After creating the first lab user, run:
-- update public.profiles set role = 'lab' where email = 'lab@example.com';
