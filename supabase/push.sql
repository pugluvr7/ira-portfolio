-- Push notifications. Run in Supabase (SQL Editor -> New query -> paste -> Run), after
-- friends.sql. Safe to re-run.
--
-- Each browser/device that turns on notifications stores a Web Push subscription here.
-- The send-push Edge Function reads them with the service role to deliver alerts for new
-- transfer and friend requests, and stamps pushed_at so each request alerts only once.

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%'),
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Read own push subscriptions" on public.push_subscriptions;
create policy "Read own push subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

-- Save this device's subscription for me. If the same browser was registered by another
-- account (shared computer), it moves to whoever is signed in now.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if p_endpoint not like 'https://%' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'That push subscription looks invalid.';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300));
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Which requests have already been announced by push.
alter table public.transfers add column if not exists pushed_at timestamptz;
alter table public.friendships add column if not exists pushed_at timestamptz;

-- The send-push Edge Function uses the service role to read subscriptions and stamp pushed_at.
-- Newer Supabase projects don't always grant it new tables automatically, so grant explicitly.
grant select, delete on public.push_subscriptions to service_role;
grant select, update on public.transfers, public.friendships to service_role;
grant select on public.profiles to service_role;
grant select, update on public.invites to service_role;
