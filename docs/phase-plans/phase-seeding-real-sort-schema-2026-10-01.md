# Real-rating seeding schema compatibility - October 1, 2026

Scope: Pumbility R-REAL-07 only. Accept complete zero-pass runs with version `phoenix2-pro7-real-sort-actual-slots-v2` in the existing commit RPC. Preserve September 30 predicted-reseeding and historical two-pass compatibility, source validation, immutability, CAS/replay and service-only access. No tournament voting application changes or data rewrite.

Plan reviewed: replace only the version condition in the existing RPC and add readiness marker `20261001010000`. Use a frozen minimal pre-change schema plus this migration in an isolated database. Test new complete runs, empty runs, malformed/missing/duplicate decisions, old-version compatibility, source/snapshot immutability, replay/revision checks and ACLs. No full reset, application suites, old migration tests or schema-wide lint.

Deployment: inspect linked target gsiyqhkcgegjrvqcqioc and pending migrations; merge the schema PR after its focused CI passes; push only this migration and verify marker/function/ACLs and history parity. Deploy the consuming app afterwards. Rollback restores the previous app and retains this additive compatibility migration. No session/key material belongs in logs or commits.

Checklist: [x] scope/plan review; [x] isolated focused SQL; [x] single scoped diff review; [ ] CI/merge; [x] target/dry-run; [ ] apply/parity/readiness. Evidence to be recorded here.

PASS: `PGLITE_MODULE=<ignored local module> node supabase/tests/seeding_real_sort_pglite.mjs` verified only the new migration against its frozen baseline. The focused tests cover complete/empty runs, malformed completion, old zero-pass and two-pass writes, source/snapshot immutability, CAS/replay, service-only ACLs and transaction rollback. The single scoped diff review confirmed the RPC differs only in its version condition; no source/tournament behavior changed. Linked history matched all 56 existing versions; dry-run lists only `20261001010000_tournament_seeding_real_sort.sql`. Docker is unavailable; isolated PostgreSQL via PGlite passed. No application checks or unrelated migration tests were run. CI/merge/deployment pending.
