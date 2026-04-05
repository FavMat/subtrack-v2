-- ============================================================
-- SubTrack v2 – Schema Supabase (aggiornato)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. PROFILES TABLE
create table if not exists profiles (
  id uuid references auth.users not null primary key,
  updated_at timestamp with time zone,
  email text,
  -- Stripe
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  is_pro boolean default false,
  pro_expires_at timestamp with time zone,
  -- Pro manuale (admin può regalare accesso senza Stripe)
  is_pro_manual boolean default false,
  notes text  -- note admin (es. "regalo utente beta")
);

-- Row Level Security
alter table profiles enable row level security;

create policy "Users can view own profile."
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile."
  on profiles for update using (auth.uid() = id);

-- Admin bypass (service_role key bypasses RLS natively)

-- 2. SUBSCRIPTIONS TABLE
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  price numeric(10,2) not null,
  cycle text not null default 'monthly',
  -- Supported cycles: monthly, bimonthly, quarterly, quadrimestral, semiannual, yearly
  next_renewal date not null,
  category text not null default 'other',
  is_shared boolean default false,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

-- Row Level Security
alter table subscriptions enable row level security;

create policy "Users can insert own subscriptions."
  on subscriptions for insert with check (auth.uid() = user_id);

create policy "Users can view own subscriptions."
  on subscriptions for select using (auth.uid() = user_id);

create policy "Users can update own subscriptions."
  on subscriptions for update using (auth.uid() = user_id);

create policy "Users can delete own subscriptions."
  on subscriptions for delete using (auth.uid() = user_id);

-- 3. AUTO-CREATE PROFILE on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. HELPER VIEW – Admin can see all profiles (use service_role key)
-- create view admin_profiles as select * from profiles;

-- ============================================================
-- HOW TO GRANT PRO MANUAL ACCESS (as admin):
-- UPDATE profiles SET is_pro_manual = true, notes = 'Beta tester'
-- WHERE email = 'user@example.com';
-- ============================================================
