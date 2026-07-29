# Karaoke Party manual and environment blockers

Date: 2026-07-29

The local database gate is complete. The following hosted and publication work remains intentionally
deferred.

## Local database execution — resolved

Docker Desktop's Linux engine was restored on 2026-07-29. The canonical stack was verified at
`127.0.0.1:54321`/`127.0.0.1:54322` before every destructive action. Full reset, clean local
database lint, the SQL/security/queue harness, duplicate-completion and cleanup/add lock races,
tournament tests, all Protein Tracker database suites, the guarded rollback rehearsal, and the
required post-rollback reset/suite/lint proof passed. Native `psql` remains absent, so the canonical
runner now has a loopback- and project-guarded fallback to the running local Supabase database
container. This environment issue no longer blocks the local gate.

## Hosted and repository mutations

The continuation authorizes an intentional local commit only; pushes, pull requests, merges, hosted
migration application, and all remote resource mutation remain forbidden. A later authorized release must recheck the linked
migration head, confirm the exact Supabase project, dry-run the push, verify only the reviewed
karaoke migration is pending, apply it, confirm parity/lint, and run tournament plus Protein Tracker
smoke checks before enabling `jfung9021/karaoke-party`.

## Application-owned work

The canonical database repository does not own Karaoke Party application code, Vercel setup,
secrets, YouTube credentials, preview-write flags, or browser end-to-end tests. Fresh database types
were generated from the verified local stack into the consuming repository as part of this gate;
all other application-owned work remains in `jfung9021/karaoke-party`.
