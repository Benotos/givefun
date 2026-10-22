-- Give.fun schema. Run once in the Supabase SQL editor (Trencher's paid project).
-- RLS: public read on everything. Writes only via service role (server and worker). No anon writes, ever.

create table if not exists charities (
  slug text primary key,
  name text not null,
  cause text not null default '',
  site_url text not null default '',
  wallet text not null default '',
  wallet_source_url text not null default '',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists coins (
  mint text primary key,
  name text not null,
  symbol text not null,
  image_url text,
  description text,
  creator_wallet text not null,
  charity_slug text not null references charities(slug),
  charity_wallet text not null,
  charity_bps int not null check (charity_bps between 5000 and 10000),
  platform_bps int not null default 0,
  status text not null default 'pending' check (status in ('pending','verified','failed','revoked')),
  fail_reason text,
  total_donated_lamports bigint not null default 0,
  launch_signature text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists coins_status_created_idx on coins (status, created_at desc);
create index if not exists coins_charity_idx on coins (charity_slug);

create table if not exists payouts (
  signature text primary key,
  mint text not null references coins(mint),
  charity_wallet text not null,
  lamports bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists payouts_mint_idx on payouts (mint, created_at desc);

alter table charities enable row level security;
alter table coins enable row level security;
alter table payouts enable row level security;

drop policy if exists "public read charities" on charities;
drop policy if exists "public read coins" on coins;
drop policy if exists "public read payouts" on payouts;
create policy "public read charities" on charities for select using (true);
create policy "public read coins" on coins for select using (true);
create policy "public read payouts" on payouts for select using (true);

-- Atomic increment used by the worker after a confirmed payout.
create or replace function add_donation(p_mint text, p_lamports bigint)
returns void language sql security definer as $$
  update coins set total_donated_lamports = total_donated_lamports + p_lamports where mint = p_mint;
$$;
revoke all on function add_donation(text, bigint) from public, anon, authenticated;
