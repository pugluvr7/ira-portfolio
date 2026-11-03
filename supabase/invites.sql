-- Email invites sent by the site. Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- after schema.sql. Invites are sent by the send-invite Edge Function, which calls
-- record_invite() with the service role to apply limits before any email goes out.

create table if not exists public.invites (
  id         bigint generated always as identity primary key,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  email      text not null,
  status     text not null default 'sent' check (status in ('sent', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists invites_inviter_idx on public.invites (inviter_id, created_at);
create index if not exists invites_email_idx on public.invites (lower(email), created_at);

alter table public.invites enable row level security;

drop policy if exists "Read own invites" on public.invites;
create policy "Read own invites" on public.invites
  for select to authenticated using ((select auth.uid()) = inviter_id);

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;

-- Checks limits and logs the invite. Returns {status, invite_id, inviter_name}.
-- status: ok | invalid | member | rate_limited | duplicate | unknown_inviter
create or replace function public.record_invite(p_inviter uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_name  text;
  v_id    bigint;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select display_name into v_name from public.profiles where id = p_inviter;
  if v_name is null then
    return jsonb_build_object('status', 'unknown_inviter');
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('status', 'member');
  end if;

  -- each person can send 10 invites a day
  if (select count(*) from public.invites
       where inviter_id = p_inviter and status = 'sent'
         and created_at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- and any one address gets at most one invite a day, from anyone
  if exists (select 1 from public.invites
              where lower(email) = v_email and status = 'sent'
                and created_at > now() - interval '24 hours') then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.invites (inviter_id, email) values (p_inviter, v_email) returning id into v_id;
  return jsonb_build_object('status', 'ok', 'invite_id', v_id, 'inviter_name', v_name);
end;
$$;

-- Only the Edge Function (service role) may call this.
revoke execute on function public.record_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.record_invite(uuid, text) to service_role;
