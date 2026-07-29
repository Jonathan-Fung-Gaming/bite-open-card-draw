# Karaoke Party manual and environment blockers

Date: 2026-07-29

The local and hosted database release gates are complete. Application deployment, provider setup,
feature enablement, and production operation remain owned by `jfung9021/karaoke-party`.

## Local database execution — resolved

Docker Desktop's Linux engine was restored on 2026-07-29. The canonical stack was verified at
`127.0.0.1:54321`/`127.0.0.1:54322` before every destructive action. Full reset, clean local
database lint, the SQL/security/queue harness, duplicate-completion and cleanup/add lock races,
tournament tests, all Protein Tracker database suites, the guarded rollback rehearsal, and the
required post-rollback reset/suite/lint proof passed. Native `psql` remains absent, so the canonical
runner now has a loopback- and project-guarded fallback to the running local Supabase database
container. This environment issue no longer blocks the local gate.

## Hosted and repository mutations

Completed on 2026-07-29 with explicit authorization. Schema PR #133 and focused ACL repair PR #134
passed CI and merged. The linked `bite-open-card-draw` project was verified before each write; dry
runs named only `20260729010000` and then `20260729020000`. Both migrations applied once, exact
local/remote parity and zero-finding linked lint passed, and hosted catalog verification confirmed
the reviewed RLS/search-path/grant inventory. Read-only REST probes passed for representative
tournament, Protein Tracker, and Karaoke Party tables, while anonymous Karaoke table access was
denied.

The first hosted dump exposed project default privileges that gave `service_role` more direct access
than the reviewed table-SELECT/public-RPC contract. The single focused repair revoked those inherited
grants, restored seven table `SELECT` grants and 23 public RPC grants, added an executable regression
assertion, passed local reset/lint/schema-concurrency validation, and was then merged and applied.

## Application-owned work

The canonical database repository does not own Karaoke Party application code, Vercel setup,
secrets, YouTube credentials, preview-write flags, or browser end-to-end tests. Fresh database types
were generated from the verified local stack into the consuming repository as part of this gate.
Linked regeneration was reviewed after the hosted push and added only PostgREST version metadata;
all deployment and provider work remains in `jfung9021/karaoke-party`.
