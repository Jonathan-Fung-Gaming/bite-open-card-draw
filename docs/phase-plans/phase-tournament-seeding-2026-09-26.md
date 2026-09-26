# Tournament seeding shared schema

Scope: add only the private `tournament_seeding` schema and narrowly named service-only RPCs for the consuming `pumbility-for-tournaments` app. No sibling application, Auth, Storage, roster or existing schema behavior changes.

Contract: immutable source score revisions use numeric columns, event-scoped canonical names, a monotonic receipt sequence, atomic expected-revision commit of accepted state and complete two-pass run, immutable published snapshots, durable opaque sessions, owned import receipts, rate limits and idempotency. The app computes the reviewed pure algorithm; SQL enforces CAS, source preservation, decimal consistency, canonical uniqueness and atomicity. Runtime tables are outside exposed Data API schemas; RPCs use invoker security and explicit service grants. PUBLIC/anon/authenticated receive no execution.

Verification: run only the new migration on an isolated PostgreSQL engine with minimal prerequisite roles, followed by its SQL constraints/ACL/atomicity tests. Docker is unavailable locally; PGlite is the disposable PostgreSQL engine for this focused gate. No full migration replay/reset or sibling application tests. Inspect linked target, history, exact dry run; merge only these scoped files, apply only this reviewed migration, and check parity/read-only readiness. Consuming app remains fixture-only until schema readiness succeeds.

Rollback: disable consumer or restore previous deployment while retaining data; forward migration for defects. Do not drop the shared database or apply unrelated pending migrations.

Plan review: current requirements checked for public RPC inheritance, stale acceptance, duplicate identity race, typed numeric data, no credential fields, revision idempotency and separate deployment ownership. One integrated application review will be performed by the consuming app task; these are focused migration checks.
