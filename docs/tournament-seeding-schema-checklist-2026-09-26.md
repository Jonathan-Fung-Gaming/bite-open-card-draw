# Tournament seeding schema evidence

- [x] Scope/plan established; only new private schema and service RPCs.
- [x] New-migration-only isolated SQL behavior, constraints, permissions and rollback checks. `PGLITE_MODULE=<temporary installation>/@electric-sql/pglite/dist/index.js node supabase/tests/tournament_seeding_pglite.mjs`: pass on 2026-09-26. Includes actual service/anon role calls, default PUBLIC ACL denial, typed decimals, source preservation, canonical uniqueness, stale CAS rollback, accepted pointer/run atomicity, idempotency mismatch/replay, rate limits, session revocation and test transaction rollback.
- [x] Linked target `gsiyqhkcgegjrvqcqioc` verified against configured project; all 49 predecessor migrations match. `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run` passed; dry run lists only `20260926010000_tournament_seeding.sql`.
- [ ] Scoped PR merged and only reviewed migration applied.
- [ ] Read-only hosted schema version and migration parity verified.

Application verification belongs in `pumbility-for-tournaments`; no application suites or sibling tests are required for this migration-only change.
