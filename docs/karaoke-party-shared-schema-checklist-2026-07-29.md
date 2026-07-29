# Karaoke Party shared-schema checklist

- [x] Correct stale plan naming to consuming repo `jfung9021/karaoke-party` and app Karaoke Party.
- [x] Read canonical repo instructions, current brief, security notes, phase gates, Protein Tracker
      patterns, and the complete Karaoke Party canonical plan.
- [x] Verify read-only linked migration parity through `20260727010000` and select an unused later
      timestamp.
- [x] Confirm no existing `karaoke_` naming collision.
- [x] Add only prefixed tables, constraints, indexes, functions, and karaoke-specific Realtime sends.
- [x] Implement same-room foreign keys, stable rotation/FIFO counters, and one-current-song invariant.
- [x] Implement room locks, expected version/current/controller fences, idempotency, sanitized actions,
      and exactly-once state-version increments.
- [x] Implement room/session, snapshot, queue, playback, controller, recovery, cache, quota/rate, close,
      and cleanup RPCs.
- [x] Enable RLS, deny browser roles, and add exact explicit `service_role` table/function grants.
- [x] Add runnable catalog/security/behavior and two-session concurrency tests with a remote-target
      refusal guard.
- [x] Add and statically validate an explicit dependency-ordered rollback runbook without `CASCADE`.
- [x] Complete correctness/concurrency review pass and resolve deterministic findings once.
- [x] Complete security/operations review pass and resolve deterministic findings once.
- [x] Run static prefix/search-path/grant/RLS/Realtime/rollback checks.
- [x] Run canonical app lint, typecheck, unit tests, and build.
- [x] Run local Supabase reset, database lint, database/security/concurrency harness, tournament and
      Protein Tracker database regressions, guarded rollback rehearsal, and the required post-rollback
      reset/suite/lint proof against the verified loopback stack.
- [x] Recheck linked migration head before merge and hosted application.
- [x] Commit, push, open PRs, pass required checks, and merge in the authorized release session.
- [x] Verify the exact hosted target; dry-run and apply only the intended schema and ACL migrations;
      then pass parity, hosted lint, catalog/ACL inventory, read-only sibling smokes, and linked types.
