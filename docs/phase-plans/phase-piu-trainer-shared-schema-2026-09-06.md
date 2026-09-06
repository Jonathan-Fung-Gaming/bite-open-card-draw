# PIU Trainer shared schema

Implement the reviewed online PIU Trainer plan in the consuming `pump-it-up-trainer` repository. This repository remains the sole migration owner for shared project `gsiyqhkcgegjrvqcqioc`.

## Contract

Create only quoted `PIU_TRAINER_` tables and supporting objects. Shared plan/catalog data is server-controlled. Personal history uses composite user/record keys, same-owner foreign keys, and domain constraints. Browser roles have no privileges. Service-only functions explicitly receive the verified actor from the API, use an empty search path, and qualify every table.

Journal writes lock the account row, check replay receipts before revision conflicts, validate the complete replacement, preserve a safety archive for imports/resets, and commit records, revision and receipt together. Reads are revision fenced. Import staging is private, bounded to 25,000,000 bytes and expires after 24 hours. Shared catalog revisions are immutable and never written by an import. Rate limits and catalog refresh leases are PIU-specific.

## Verification and rollout

Use the local Supabase stack for this migration's schema, ownership, rollback, retry and stale-write checks only. Per the user's migration-only rule, do not run sibling/application tests, older migration tests, full resets or whole-project checks. Inspect one diff once. Additive migration first; consuming app only after applied schema. Verify linked target and migration parity; dry-run must contain only PIU migrations. Do not reset the hosted database or change sibling objects, default grants, signup triggers, existing Auth settings or publications. After user data exists, rollback means revert the app and apply additive fixes, never drop data.

## Review

Reviewed against the accepted plan and current shared schema patterns before implementation. No tournament behavior changes are necessary. Google redirects are configured separately and append to existing redirects.
