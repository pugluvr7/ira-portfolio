-- Public profiles, visible to accepted friends. Run in Supabase (SQL Editor -> New query ->
-- paste -> Run), after friends.sql. Safe to re-run.
--
-- People edit these columns on their own profile row (the existing "Update own profile"
-- policy covers it). Friends read them only through get_public_profile(), which checks the
-- friendship and leaves out balance/holdings unless the owner opted in.

alter table public.profiles
  add column if not exists tagline       text    not null default '',
  add column if not exists about         text    not null default '',
  add column if not exists location      text    not null default '',
  add column if not exists spirit_asset  text    not null default '',
  add column if not exists show_balance  boolean not null default false,
  add column if not exists show_holdings boolean not null default false;

alter table public.profiles drop constraint if exists profiles_public_lengths;
alter table public.profiles add constraint profiles_public_lengths check (
  char_length(tagline) <= 80 and char_length(about) <= 400
  and char_length(location) <= 40 and char_length(spirit_asset) <= 8
);

-- ---------- get_public_profile: what a friend (or you) sees ----------
create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := auth.uid();
  p         public.profiles;
  v_since   timestamptz;
  v_result  jsonb;
begin
  if v_me is null then
    raise exception 'You need to be signed in.';
  end if;

  if p_user_id <> v_me then
    select coalesce(f.responded_at, f.created_at) into v_since
      from public.friendships f
     where f.status = 'accepted'
       and least(f.requester_id, f.addressee_id) = least(v_me, p_user_id)
       and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user_id);
    if v_since is null then
      raise exception 'Public profiles are only visible to friends.';
    end if;
  end if;

  select * into p from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Profile not found.';
  end if;

  v_result := jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'tagline', p.tagline,
    'about', p.about,
    'location', p.location,
    'spirit_asset', p.spirit_asset,
    'member_since', p.created_at,
    'friends_since', v_since,
    'is_me', p_user_id = v_me,
    'show_balance', p.show_balance,
    'show_holdings', p.show_holdings
  );

  if p.show_balance then
    v_result := v_result || jsonb_build_object('total_value',
      (select coalesce(sum(h.shares * h.price), 0) from public.holdings h where h.user_id = p_user_id));
  end if;

  if p.show_holdings then
    v_result := v_result || jsonb_build_object('holdings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'symbol', h.symbol, 'name', h.name, 'asset_class', h.asset_class,
               'shares', h.shares, 'unit', h.unit, 'price', h.price,
               'picture', h.picture, 'image', h.image, 'note', h.note)
             order by h.shares * h.price desc)
        from public.holdings h where h.user_id = p_user_id), '[]'::jsonb));
  end if;

  return v_result;
end;
$$;

revoke execute on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- ---------- list_friends now includes each friend's tagline and spirit asset ----------
drop function if exists public.list_friends();
create function public.list_friends()
returns table (
  friendship_id  bigint,
  friend_id      uuid,
  friend_name    text,
  friend_email   text,
  status         text,
  direction      text,   -- 'outgoing' = I sent the request, 'incoming' = they did
  since          timestamptz,
  friend_tagline text,   -- only filled in once you're friends
  friend_spirit  text
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
         coalesce(f.responded_at, f.created_at),
         case when f.status = 'accepted' then coalesce(p.tagline, '') else '' end,
         case when f.status = 'accepted' then coalesce(p.spirit_asset, '') else '' end
    from public.friendships f
    join auth.users o
      on o.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
    left join public.profiles p on p.id = o.id
   where (select auth.uid()) in (f.requester_id, f.addressee_id)
   order by lower(coalesce(p.display_name, o.email));
$$;
revoke execute on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;
