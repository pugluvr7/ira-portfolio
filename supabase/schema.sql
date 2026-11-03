-- IRA Portfolio schema. Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Every table has row-level security, so each signed-in user can only see and change their own rows.

-- ---------- profiles: one row per user, created automatically on signup ----------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  display_name           text not null default '',
  account_name           text not null default 'Roth IRA',
  custodian              text not null default 'Brokerage',
  contribution_limit     numeric not null default 7500,
  contributed_ytd        numeric not null default 0,
  lifetime_contributions numeric not null default 0,
  -- target allocation by asset class, percent
  targets                jsonb not null default
    '{"Stocks": 35, "Seafood": 20, "Precious Metals": 20, "Real Estate": 15, "Cash": 10}',
  created_at             timestamptz not null default now()
);

-- ---------- holdings: many per user ----------
create table if not exists public.holdings (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol         text not null check (char_length(symbol) between 1 and 8),
  name           text not null default '',
  asset_class    text not null check (asset_class in ('Stocks', 'Seafood', 'Precious Metals', 'Real Estate', 'Cash')),
  shares         numeric not null default 0 check (shares >= 0),
  price          numeric not null default 0 check (price >= 0),
  cost_basis     numeric not null default 0 check (cost_basis >= 0),
  day_change_pct numeric not null default 0,
  picture        text not null default '',
  unit           text not null default '',
  note           text not null default '',
  image          text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists holdings_user_id_idx on public.holdings (user_id);

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.holdings enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Read own holdings" on public.holdings;
create policy "Read own holdings" on public.holdings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own holdings" on public.holdings;
create policy "Insert own holdings" on public.holdings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own holdings" on public.holdings;
create policy "Update own holdings" on public.holdings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own holdings" on public.holdings;
create policy "Delete own holdings" on public.holdings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Table privileges for the API roles (RLS above still limits rows to the owner).
revoke all on public.profiles, public.holdings from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.holdings to authenticated;

-- ---------- create a profile whenever someone signs up ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
