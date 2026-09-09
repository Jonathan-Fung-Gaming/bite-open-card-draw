# PIU adaptive workouts and account evidence schema

Scope: support the approved `pump-it-up-trainer/docs/ADAPTIVE_WORKOUTS_AND_PIUSCORES_PLAN.md` without changing tournament, authentication, or other application behavior.

- Preserve existing legacy journals, plan snapshots, UUID ownership, receipts, archives, and revision fences.
- Explicitly admit daily runs with 16 snapshot slots, ordered steps, per-step play history and profile-scoped `settings.workout` defaults. Validate relationships and sequences at commit.
- Add one service-only personal-account cache table with separate mapping, committed snapshot, staging, lease and revision fields. No raw account scores or account data enters trainer STATE.
- Stage bounded account sync pages; publish atomically only after complete scores/journal coverage. Mapping changes and revoked sharing cannot reuse another account's cache. Sync never increments journal revision.
- Report daily/personal capabilities in READ; a fresh daily-capable account does not require preset enrollment.
- Scan at most 128 cached official boards and retain validated per-chart goal/top-300/played booleans in a separate service-only table. Raw-board eviction cannot erase known goals or played history. Only newer comparable boards refine complete player coverage; malformed, supplemented, wrong-mix or mismatched-identity boards contribute no replacement evidence. Return at most 30,000 retained chart memberships per allowlisted profile.

Pre-implementation plan review: existing run uniqueness applies only to non-null legacy plan identity; add explicit union validation instead of relying on accidental null acceptance. Preserve all modified RPC signatures and existing receipt-first semantics. Restrict every new table/function to service_role and preserve RLS. Leased sync operations must check mapping version and expiry. Daily payload checks must retain historical legacy snapshots unchanged.

Verification: run ONLY the new migration over a frozen predecessor schema fixture in a newly named disposable database, then its focused constraints/ownership/sequence/receipt/cache/ACL assertions. Do not replay older migration files, reset Supabase, run sibling application suites, or run schema-wide lint. Read-only linked target/history and dry-run checks remain required before application. The integrator owns the single final application/schema review and release.

Release order: new migration, read-only capability/parity verification, then compatible consuming application. Rollback uses the prior compatible application or disables new draws; do not remove stored daily/account history or rewrite migration history.

Checklist:

- [x] Scope and predecessor constraints inspected; no tournament/Auth changes.
- [x] New migration and isolated frozen fixture created.
- [x] Focused new-migration checks pass, including membership projection and service-only ACLs.
- [x] Intended target, parity and pending migration dry-run verified.
- [ ] Coordinated final review and release completed by integrator.

Verification evidence (2026-09-09): linked project `gsiyqhkcgegjrvqcqioc` has 46 matching predecessor migration pairs; `supabase db push --linked --dry-run` lists only `20260909010000_piu_adaptive_workouts.sql`. No production migration was applied. The new migration and later membership RPC addition were applied only to the already running, verified `127.0.0.1` disposable integration backend. Isolated fixture checks executed the frozen schema plus only this new migration and then dropped the named test databases. Fresh integration setup was also checked with the exact baseline slice used by the trainer setup script.

Bounded synthetic history benchmark: 312 daily runs, 5,616 assignments, 6,698 play events; 10,829,784 input bytes and 11,565,376 serialized state bytes. Three separate transactions measured the COMMIT function at 1,097.552 / 2,426.155 / 3,276.729 ms, excluding HTTP/upload, with resulting revisions 1/2/3. The benchmark used its own disposable fixture database, which was removed afterward; it did not mutate shared integration journals or production.

The single final review identified a raw-cache eviction regression in official goal retention. Its focused repair adds durable membership storage and proves retained goals survive eviction, newer authoritative absence releases a goal, and positive played evidence survives subsequent snapshots. The affected API suite passes 34 tests; the new-migration SQL suite and scoped lint pass. Only the required new table/replacement RPC delta was applied to the verified disposable loopback target; no production changes were made.
