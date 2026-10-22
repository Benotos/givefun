-- Migration 002. Run AFTER schema.sql in the Supabase SQL editor. Safe to run more than once.
-- Adds: editable charities, flags, audit log, hidden coin status, fast aggregate functions.

-- Charities become editable from the admin dashboard
alter table charities add column if not exists blurb text not null default '';
alter table charities add column if not exists active boolean not null default true;
alter table charities add column if not exists updated_at timestamptz not null default now();

-- Allow moderators to hide a coin
alter table coins drop constraint if exists coins_status_check;
alter table coins add constraint coins_status_check
  check (status in ('pending','verified','failed','revoked','hidden'));

-- Site wide flags (launch pause, banner)
create table if not exists flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);
insert into flags (key, value) values ('site', '{"launchPaused": false, "banner": ""}')
  on conflict (key) do nothing;

-- Who changed what in the admin
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default 'admin',
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);

alter table flags enable row level security;
alter table audit_log enable row level security;
-- No public policies on flags or audit_log. Only the service role (server) can read or write them.

-- Aggregates computed in the database, so the app never pulls every row
create or replace function charity_totals()
returns table (charity_slug text, coins bigint, lamports numeric)
language sql stable security definer as $$
  select charity_slug, count(*)::bigint, coalesce(sum(total_donated_lamports),0)::numeric
  from coins where status = 'verified' group by charity_slug;
$$;

create or replace function coin_counts()
returns table (status text, n bigint)
language sql stable security definer as $$
  select status, count(*)::bigint from coins group by status;
$$;

revoke all on function charity_totals() from public, anon, authenticated;
revoke all on function coin_counts() from public, anon, authenticated;

-- Indexes for the leaderboard and activity queries
create index if not exists coins_donated_idx on coins (status, total_donated_lamports desc);
create index if not exists payouts_created_idx on payouts (created_at desc);
