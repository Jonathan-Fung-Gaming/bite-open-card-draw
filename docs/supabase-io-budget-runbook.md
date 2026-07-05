# Supabase I/O Budget Runbook

Use this when hosted rehearsal, load, or production-flow tests start returning Supabase 503/504/522
responses.

## Stop Conditions

Pause hosted Supabase test traffic when any of these are true:

- Supabase alerts that Disk I/O budget is exhausted.
- `Disk IO % consumed` is at or near 100%.
- PostgREST or edge logs show broad 503/504 failures across many tables.
- The same rehearsal event produces repeated `select=*&event_id=eq.<event>` reads across normalized
  runtime tables.

Do not keep retrying full production-flow tests while the project is I/O-throttled.

## Required Staging Setup

Run rehearsal and production-flow evidence against a disposable staging Supabase project, not the
real tournament event project.

Use an event id that starts with one of:

- `e2e-`
- `phase9-`
- `load-`
- `rehearsal-`

Keep production event data on its own project or event namespace, and do not enable rehearsal admin
controls for the real event.

## Metrics To Watch

In Supabase Dashboard, inspect the same time window as the failing test:

- `Disk IO % consumed`
- Disk IOPS
- Disk throughput
- CPU and I/O wait
- Memory and swap
- Database connections
- PostgREST/API 5xx rates
- Postgres and PostgREST logs for timeouts or broad 503/504s

Broad errors across many tables point to resource saturation. Errors isolated to one query/table
point to query or index work.

## Capacity Plan

For rehearsal day, temporarily use a Supabase compute size with enough disk I/O headroom for the
full 48-player production-flow run. If the dashboard still shows I/O pressure after increasing
compute, provision additional IOPS/throughput where available for the plan.

Cost guardrail: additional disk IOPS/throughput can bypass spend-cap protection, so set a planned
window and downgrade after evidence is captured.

## App-Side Protections

The app includes these I/O protections:

- Public route hydrations use a short server-side read cache controlled by
  `TOURNAMENT_PUBLIC_READ_CACHE_MS`.
- Hosted database time reads use a short monotonic cache controlled by
  `TOURNAMENT_DATABASE_TIME_CACHE_MS`.
- Public auto-refresh components add small client-side jitter so pages opened together do not
  refresh in lockstep.
- Supabase service-role fetch retries transient failures only for safe reads and the read-only
  `normalized_database_time` RPC.

Defaults are intentionally small, currently 1000 ms for both server caches. Set either env var to
`0` only for diagnostics.

## Recovery Sequence

After the I/O budget recovers or the staging project is resized:

1. Run Supabase status/migration checks only.
2. Run the host-lock two-session spec.
3. Run one hosted round.
4. Run the full production-flow rehearsal once.
5. Stop immediately if `Disk IO % consumed` spikes or broad 503/504/522 responses return.
