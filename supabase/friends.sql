-- Friends. Run once in Supabase (SQL Editor -> New query -> paste -> Run), after transfers.sql.
--
-- A friend request is sent by email; the other person accepts (or declines, which removes it).
-- Accepted friends can send each other transfers by picking from a list instead of typing an email.
-- Browsers have no direct access to the table: everything goes through the functions below.

create table if not exists public.friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- one row per pair, whichever direction it was sent
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- ---------- list_friends: my friends and pending requests, with current names ----------
create or replace function public.list_friends()
returns table (
  friendship_id bigint,
  friend_id     uuid,
  friend_name   text,
  friend_email  text,
  status        text,
  direction     text,   -- 'outgoing' = I sent the request, 'incoming' = they did
  since         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         o.id,
         coalesce(p.display_name, split_part(o.email, '@', 1)),
         o.email::text,
         f.status,
         case when f.requester_id = (select auth.uid()) then 'outgoing' else 'incoming' end,
         coalesce(f.responded_at, f.created_at)
    from public.friendships f
    join auth.users o
      on o.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
    left join public.profiles p on p.id = o.id
   where (select auth.uid()) in (f.requester_id, f.addressee_id)
   order by lower(coalesce(p.display_name, o.email));
$$;

-- ---------- send_friend_request ----------
-- Returns 'requested', or 'accepted' if they had already asked you.
create or replace function public.send_friend_request(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_other uuid;
  f       public.friendships;
begin
  if v_me is null then
    raise exception 'You need to be signed in.';
  end if;
  select u.id into v_other from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_other is null then
    raise exception 'No account found for %.', trim(p_email);
  end if;
  if v_other = v_me then
    raise exception 'You can''t add yourself as a friend.';
  end if;

  select * into f from public.friendships
   where least(requester_id, addressee_id) = least(v_me, v_other)
     and greatest(requester_id, addressee_id) = greatest(v_me, v_other)
   for update;
  if found then
    if f.status = 'accepted' then
      raise exception 'You''re already friends.';
    elsif f.requester_id = v_me then
      raise exception 'You already sent them a request.';
    else
      -- they asked first: sending one back accepts it
      update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
      return 'accepted';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (v_me, v_other);
  return 'requested';
end;
$$;

-- ---------- respond_friend_request: accept, or decline (which deletes it) ----------
create or replace function public.respond_friend_request(p_friendship_id bigint, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
     where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';
  end if;
  if not found then
    raise exception 'That friend request isn''t pending anymore.';
  end if;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

-- ---------- remove_friend: unfriend, or cancel a request you sent ----------
create or replace function public.remove_friend(p_friendship_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
   where id = p_friendship_id and auth.uid() in (requester_id, addressee_id);
  if not found then
    raise exception 'Friend not found.';
  end if;
  return 'removed';
end;
$$;

-- ---------- transfers: shared insert, used by both the email and friend versions ----------
create schema if not exists private;

create or replace function private.insert_transfer(
  p_sender uuid, p_recipient uuid, p_holding_id bigint, p_quantity numeric, p_message text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h       public.holdings;
  v_pending numeric;
  v_id      bigint;
begin
  if p_recipient = p_sender then
    raise exception 'You can''t send assets to yourself.';
  end if;
  select * into v_h from public.holdings where id = p_holding_id and user_id = p_sender;
  if not found then
    raise exception 'That holding wasn''t found in your portfolio.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be more than 0.';
  end if;

  -- don't let the same shares be promised to two people
  select coalesce(sum(quantity), 0) into v_pending
    from public.transfers where holding_id = v_h.id and status = 'pending';
  if p_quantity + v_pending > v_h.shares then
    raise exception 'You only have % % of % available to send (% already in pending transfers).',
      v_h.shares - v_pending, coalesce(nullif(v_h.unit, ''), 'units'), v_h.symbol, v_pending;
  end if;

  insert into public.transfers (
    sender_id, recipient_id, sender_name, recipient_name, holding_id,
    symbol, name, asset_class, picture, unit, price, quantity, message
  )
  values (
    p_sender, p_recipient,
    (select display_name from public.profiles where id = p_sender),
    (select display_name from public.profiles where id = p_recipient),
    v_h.id, v_h.symbol, v_h.name, v_h.asset_class, v_h.picture, v_h.unit, v_h.price,
    p_quantity, left(coalesce(trim(p_message), ''), 200)
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.insert_transfer(uuid, uuid, bigint, numeric, text) from public, anon, authenticated;

-- send by email (replaces the version in transfers.sql; same signature and behavior)
create or replace function public.create_transfer(
  p_recipient_email text, p_holding_id bigint, p_quantity numeric, p_message text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  select u.id into v_recipient from auth.users u where lower(u.email) = lower(trim(p_recipient_email));
  if v_recipient is null then
    raise exception 'No account found for %.', trim(p_recipient_email);
  end if;
  return private.insert_transfer(auth.uid(), v_recipient, p_holding_id, p_quantity, p_message);
end;
$$;

-- send to a friend, picked from your friends list
create or replace function public.create_transfer_to_friend(
  p_friend_id uuid, p_holding_id bigint, p_quantity numeric, p_message text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and least(requester_id, addressee_id) = least(auth.uid(), p_friend_id)
       and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_friend_id)
  ) then
    raise exception 'You can only pick people who are on your friends list.';
  end if;
  return private.insert_transfer(auth.uid(), p_friend_id, p_holding_id, p_quantity, p_message);
end;
$$;

-- ---------- who can call what ----------
revoke execute on function public.list_friends() from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(bigint, boolean) from public, anon;
revoke execute on function public.remove_friend(bigint) from public, anon;
revoke execute on function public.create_transfer(text, bigint, numeric, text) from public, anon;
revoke execute on function public.create_transfer_to_friend(uuid, bigint, numeric, text) from public, anon;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(bigint, boolean) to authenticated;
grant execute on function public.remove_friend(bigint) to authenticated;
grant execute on function public.create_transfer(text, bigint, numeric, text) to authenticated;
grant execute on function public.create_transfer_to_friend(uuid, bigint, numeric, text) to authenticated;
