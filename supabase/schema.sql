-- Shvoong Database Schema
-- Run this in: Supabase Dashboard → SQL Editor

-- User profiles table (extends auth.users)
create table if not exists public.user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text,
  goal          text,
  satisfaction  integer check (satisfaction between 1 and 5),
  role          text,
  years_experience integer,
  annual_earnings  integer,
  employer      text,
  location      text,
  skills        text[],
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-create profile row on new user sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, username)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: users can only read/write their own profile
alter table public.user_profiles enable row level security;

create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);
