# Give.fun

Charity memecoin launchpad on pump.fun. No custom contract. The creator fee split is locked on chain and payouts go to the charity's own wallet.

## Run
    npm install
    DEMO_MODE=1 REGISTER_SECRET=<32+ chars> npm run dev     # fictional data, no services needed

## Production setup
1. Database, pick one. Neon or any Postgres: run `postgres/schema.sql` and set `DATABASE_URL`. Supabase: run `supabase/schema.sql`, then `supabase/migrations/002_scale_admin.sql`.
2. Set env vars from `.env.example` in Vercel (never in code).
3. Run the worker on a small always on host: `npm run worker`. It verifies coins, pays out and publishes snapshots.
4. Open `/admin`, add charities, verify each wallet against the charity's official page, then verify.

## Scale design
- Public reads come from Redis snapshots plus an in process cache. One caller rebuilds, everyone else gets the stored copy.
- Stale data is served if the database or RPC fails. CDN headers include stale-if-error.
- Circuit breaker on the database. RPC failover across providers. Browser RPC goes through `/api/rpc`.
- Live feed polls one CDN cached endpoint. No websockets.
- Kill switches: `MAINTENANCE=1`, and Pause launches in `/admin/system`. `/api/health` always responds.

## Tests
    npm test            # shares, on chain verify, tx size, infra, postgres (needs DATABASE_URL, else skipped)
    npm run loadtest    # BASE=https://site CONNECTIONS=200 DURATION=20