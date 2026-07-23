# Protein Tracker Gemini consent schema plan

Date: 2026-07-24
Status: implemented, reviewed, and validated locally; PR and deployment pending
Scope: additive consent fields on the existing user-owned Protein Tracker preferences row

## Objective

Persist the user's versioned consent to Google Gemini free-tier food-photo processing so the
consumer application can enforce consent before sending a photo and can revoke consent from
Settings. Consent is a durable preference and therefore remains after tracking-data erasure.

## Contract

- Add nullable `food_ai_consent_version text` and `food_ai_consented_at timestamptz` columns to
  `public.protein_preferences`.
- Require the fields to be null together or populated together.
- Require a populated version to be trimmed, nonblank, and no longer than 128 characters.
- Preserve the existing row-level ownership policies. Authenticated users may select, insert, and
  update their own consent fields; no cross-user access is added.
- Preserve the existing tracking-data erase function unchanged so the preferences row and consent
  remain durable.
- Add no provider credentials, food images, model responses, or nutrition estimates to Supabase.

## Validation

- Reset the complete local migration history and run the focused Phase 8 Data API suite.
- Prove owner write/read/revoke, paired-field constraints, cross-user isolation, and consent
  survival through tracking-data erase.
- Run database lint plus repository lint, typecheck, unit tests, and build.
- Perform one bounded diff review against this contract and the repository security notes.

## Migration order and rollback

The migration follows `20260723060000_protein_tracker_phase8_settings_notifications_erase.sql`
and is additive. The consumer app must not require the fields until this migration is merged and
deployed. Before app activation, rollback may explicitly drop the constraint and two columns. Once
consent data is in use, rollback must be an additive correction or an app feature disablement.

## Plan review

Reviewed before implementation. The preference table already owns durable per-user settings and
is deliberately preserved by tracking-data erase. The two-field invariant distinguishes never
consented/revoked state from an accepted version without adding a new table or server-only
mutation. Existing RLS policies remain the correct authorization boundary.
