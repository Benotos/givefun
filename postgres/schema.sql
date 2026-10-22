-- Give.fun schema for plain Postgres (Neon, Railway, Render, or any provider).
-- Run once. Safe to run again. Use this INSTEAD of the Supabase files when using DATABASE_URL.
-- No RLS: the database is only ever reached from our server and worker, never from the browser.

create table if not exists charities (
  slug text primary key,
  name text not null,
  cause text not null default '',
  blurb text not null default '',
  site_url text not null default '',
  wallet text not null default '',
  wallet_source_url text not null default '',
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  status text not null default 'pending' check (status in ('pending','verified','failed','revoked','hidden')),
  fail_reason text,
  total_donated_lamports bigint not null default 0,
  launch_signature text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coins_status_created_idx on coins (status, created_at desc);
create index if not exists coins_charity_idx on coins (charity_slug);
create index if not exists coins_donated_idx on coins (status, total_donated_lamports desc);

create table if not exists payouts (
  signature text primary key,
  mint text not null references coins(mint),
  charity_wallet text not null,
  lamports bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists payouts_mint_idx on payouts (mint, created_at desc);
create index if not exists payouts_created_idx on payouts (created_at desc);

create table if not exists flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);
insert into flags (key, value) values ('site', '{"launchPaused": false, "banner": ""}')
  on conflict (key) do nothing;

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default 'admin',
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);