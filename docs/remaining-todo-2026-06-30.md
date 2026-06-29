# Remaining To-Do - 2026-06-30

## Current Baseline

- `main` is merged through Normalized Runtime Persistence Phase 7.
- Local gates passed after Phase 7: lint, typecheck, unit/integration tests, production build, and
  Playwright e2e.
- Runtime authority is now normalized Supabase persistence when
  `TOURNAMENT_STATE_BACKEND=supabase`; debug snapshots are backup/debug exports only.

## Remaining Work

### 1. Phase 8 Automated Coverage Audit

- [ ] Map existing tests against every Phase 8 required automated gate in
  `docs/normalized-runtime-persistence-plan-2026-06-29.md`.
- [ ] Add or tighten coverage for concurrent ballot submissions so all ballots survive.
- [ ] Add or tighten coverage that persistence failure keeps the previous confirmed ballot valid.
- [ ] Add or tighten coverage that post-vote reroll invalidates affected ballots and cannot silently
  produce zero-count results.
- [ ] Add or tighten coverage that timer expiry, 75% extension, final-30 warning, pause, and close
  survive fresh repository reads.
- [ ] Confirm production rejects unsafe backend/event configuration.
- [ ] Confirm admin sessions refresh to a sliding 10-hour expiry and logout revokes server-side
  session rows.
- [ ] Confirm generated Supabase types include every runtime table.
- [ ] Confirm normalized ballot/result persistence keeps static `round_set_id` separate from active
  `draw_id`.
- [ ] Confirm runtime cutover cannot persist active draw ids into static round-set FK columns.

### 2. Hosted Supabase Rehearsal

Do not run this against a real event namespace or production data.

- [ ] Get explicit approval before writing to any hosted Supabase project.
- [ ] Choose a non-production `TOURNAMENT_EVENT_ID` for rehearsal.
- [ ] Apply all migrations through the latest normalized runtime migration.
- [ ] Configure rehearsal env with `TOURNAMENT_STATE_BACKEND=supabase`.
- [ ] Run a complete four-round hosted rehearsal.
- [ ] Verify refresh/redeploy survival for draws, voting windows, ballots, results, tiebreak reveals,
  admin sessions, and host locks.
- [ ] Verify private CSV auto-download and manual download after each final reveal.
- [ ] Verify debug snapshot download works and remains labeled non-authoritative.
- [ ] Verify QR scans from event phones to the public `/room` URL.

### 3. Release Documentation Reconciliation

- [ ] Update stale release-status wording that still describes the old fixed `primary` snapshot row
  as the hosted rehearsal blocker.
- [ ] Record Phase 8 evidence in `docs/phase-status.md`.
- [ ] Record hosted rehearsal evidence in `docs/remediation-issue-checklist.md`.
- [ ] Update `docs/release-checklist.md` with the final hosted rehearsal result.
- [ ] Update event-day/runbook notes if the hosted rehearsal exposes any operational changes.

### 4. Final Release Gate

- [ ] Run all available checks after Phase 8 changes:
  - `rtk npm run lint`
  - `rtk npm run typecheck`
  - `rtk npm run test`
  - `rtk npm run build`
  - `rtk npm run test:e2e`
- [ ] Confirm no secrets, service-role keys, password hashes, session secrets, Vercel tokens, or
  plaintext admin passwords are committed.
- [ ] Confirm the repository is clean and `main` is current after the final PR merge.
