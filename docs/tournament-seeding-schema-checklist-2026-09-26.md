# Tournament seeding schema evidence

- [x] Scope/plan established; only new private schema and service RPCs.
- [x] New-migration-only isolated SQL behavior, constraints, permissions and rollback checks. `PGLITE_MODULE=<temporary installation>/@electric-sql/pglite/dist/index.js node supabase/tests/tournament_seeding_pglite.mjs`: pass on 2026-09-26. Includes actual service/anon role calls, default PUBLIC ACL denial, typed decimals, source preservation, canonical uniqueness, stale CAS rollback, accepted pointer/run atomicity, idempotency mismatch/replay, rate limits, session revocation and test transaction rollback.
- [x] Linked target `gsiyqhkcgegjrvqcqioc` verified against configured project; all 49 predecessor migrations match. `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run` passed; dry run lists only `20260926010000_tournament_seeding.sql`.
- [x] Scoped PR [#153](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/153) merged as `236fb61ce10a21e465579bc84053bb1e52f0d2ab`. All CI checks passed, including the new migration on disposable PostgreSQL 17. `npx supabase db push --linked --yes` applied only `20260926010000_tournament_seeding.sql` to the verified existing shared project.
- [x] Read-only hosted catalog query confirms version `20260926010000`, ten private tables with RLS and no anon/authenticated table access, and new RPCs denied to browser roles while executable by service_role. All 50 migration records now match; final push dry run is empty.

Application verification belongs in `pumbility-for-tournaments`; no application suites or sibling tests are required for this migration-only change.

Docker was unavailable locally; isolated PGlite SQL plus CI PostgreSQL 17 supplied executable evidence. No full reset/replay, schema-wide lint, sibling tests or unrelated hosted mutation ran.
