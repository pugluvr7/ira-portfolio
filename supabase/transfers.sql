-- Transfers between accounts. Run once in Supabase (SQL Editor -> New query -> paste -> Run),
-- after schema.sql.
--
-- Flow: the sender calls create_transfer(); the recipient sees it and calls
-- respond_transfer(accept => true/false); the sender may cancel_transfer() while pending.
-- Assets only move on accept, inside one locked transaction. Browsers can read their own
-- transfers but can only change them through these functions.

create table if not exists public.transfers (
  id             bigint generated always as identity primary key,
  sender_id      uuid not null references auth.users (id) on delete cascade,
  recipient_id   uuid not null references auth.users (id) on delete cascade,
  -- names are copied in because users can't read each other's profiles
  sender_name    text not null,
  recipient_name text not null,
  holding_id     bigint references public.holdings (id) on delete set null,
  -- snapshot of what's being sent, for display
  symbol         text not null,
  name           text not null,
  asset_class    text not null,
  picture        text not null default '',
  unit           text not null default '',
  price          numeric not null default 0,
  quantity       numeric not null check (quantity > 0),
  message        text not null default '' check (char_length(message) <= 200),
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'cancelled', 'failed')),
  failure_reason text not null default '',
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);
create index if not exists transfers_recipient_idx on public.transfers (recipient_id, status);
create index if not exists transfers_sender_idx on public.transfers (sender_id, status);
create index if not exists transfers_holding_idx on public.transfers (holding_id) where status = 'pending';

alter table public.transfers enable row level security;

drop policy if exists "Read own transfers" on public.transfers;
create policy "Read own transfers" on public.transfers
  for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

revoke all on public.transfers from anon, authenticated;
grant select on public.transfers to authenticated;

-- ---------- create_transfer: sender offers part of a holding to another account ----------
create or replace function public.create_transfer(
  p_recipient_email text,
  p_holding_id      bigint,
  p_quantity        numeric,
  p_message         text default ''
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_recipient uuid;
  v_h         public.holdings;
  v_pending   numeric;
  v_id        bigint;
begin
  if v_me is null then
    raise exception 'You need to be signed in.';
  end if;

  select u.id into v_recipient from auth.users u where lower(u.email) = lower(trim(p_recipient_email));
  if v_recipient is null then
    raise exception 'No account found for %.', trim(p_recipient_email);
  end if;
  if v_recipient = v_me then
    raise exception 'You can''t send assets to yourself.';
  end if;

  select * into v_h from public.holdings where id = p_holding_id and user_id = v_me;
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
    v_me, v_recipient,
    (select display_name from public.profiles where id = v_me),
    (select display_name from public.profiles where id = v_recipient),
    v_h.id, v_h.symbol, v_h.name, v_h.asset_class, v_h.picture, v_h.unit, v_h.price,
    p_quantity, left(coalesce(trim(p_message), ''), 200)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- respond_transfer: recipient accepts (assets move) or declines ----------
create or replace function public.respond_transfer(p_transfer_id bigint, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := auth.uid();
  t          public.transfers;
  h          public.holdings;
  v_cost     numeric;
  v_existing bigint;
begin
  select * into t from public.transfers where id = p_transfer_id and recipient_id = v_me for update;
  if not found then
    raise exception 'Transfer not found.';
  end if;
  if t.status <> 'pending' then
    raise exception 'This transfer was already %.', t.status;
  end if;

  if not p_accept then
    update public.transfers set status = 'declined', responded_at = now() where id = t.id;
    return 'declined';
  end if;

  select * into h from public.holdings where id = t.holding_id and user_id = t.sender_id for update;
  if not found or h.shares < t.quantity then
    update public.transfers
       set status = 'failed', responded_at = now(),
           failure_reason = case when h.id is null then 'The sender no longer has this holding.'
                                 else 'The sender no longer has enough to send.' end
     where id = t.id;
    return 'failed';
  end if;

  -- the recipient takes a proportional share of the sender's cost basis
  v_cost := case when h.shares > 0 then h.cost_basis * t.quantity / h.shares else 0 end;

  if h.shares = t.quantity then
    delete from public.holdings where id = h.id;
  else
    update public.holdings
       set shares = shares - t.quantity, cost_basis = greatest(cost_basis - v_cost, 0)
     where id = h.id;
  end if;

  select id into v_existing from public.holdings
   where user_id = v_me and symbol = h.symbol and asset_class = h.asset_class
   order by created_at limit 1 for update;
  if v_existing is not null then
    update public.holdings
       set shares = shares + t.quantity, cost_basis = cost_basis + v_cost
     where id = v_existing;
  else
    insert into public.holdings (user_id, symbol, name, asset_class, shares, price, cost_basis,
                                 day_change_pct, picture, unit, note, image)
    values (v_me, h.symbol, h.name, h.asset_class, t.quantity, h.price, v_cost,
            h.day_change_pct, h.picture, h.unit, h.note, h.image);
  end if;

  update public.transfers set status = 'accepted', responded_at = now() where id = t.id;
  return 'accepted';
end;
$$;

-- ---------- cancel_transfer: sender withdraws a pending offer ----------
create or replace function public.cancel_transfer(p_transfer_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transfers
     set status = 'cancelled', responded_at = now()
   where id = p_transfer_id and sender_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending transfer to cancel.';
  end if;
  return 'cancelled';
end;
$$;

revoke execute on function public.create_transfer(text, bigint, numeric, text) from public, anon;
revoke execute on function public.respond_transfer(bigint, boolean) from public, anon;
revoke execute on function public.cancel_transfer(bigint) from public, anon;
grant execute on function public.create_transfer(text, bigint, numeric, text) to authenticated;
grant execute on function public.respond_transfer(bigint, boolean) to authenticated;
grant execute on function public.cancel_transfer(bigint) to authenticated;
