# Manual ninth contribution for tournament seeding

Scope: the consuming Pumbility app now accepts an admin-entered overall rating and ninth contribution instead of all nine scores. Add only `20260926020000_tournament_seeding_manual_ninth.sql`, replacing the existing commit RPC's score validation with an additional explicit `admin_manual` / `ninth_only` format. Preserve legacy full-score imports, manual records, source immutability, CAS, service-only permissions and two-pass atomic saves.

The new format has an empty contributions array and a separately stored ninth value; persist its sole known score at position 9, never invent the first eight scores. Verified fewer-than-nine manual cases require a note and null ninth/prediction. Non-shortfall records require a nonnegative finite ninth and exact prediction. Imports cannot use this format. Keep the old schema-version marker and add the new one for consumer readiness.

Verification checklist:
- [x] New-migration-only isolated SQL tests for normal/shortfall entries, exact prediction, malformed values, wrong source, legacy compatibility, immutable sources, CAS/replay, rollback and RPC permissions.
- [x] Inspect one diff once and fix only proven defects.
- [x] Verify linked target/history; dry run contains only the new migration.
- [ ] PR CI for this migration passes; merge; apply new migration; verify parity and readiness.
- [ ] Deploy the consuming app only after the migration is applied.

Order/rollback: expand database first, then deploy the consumer. Existing code remains compatible. If needed restore the previous app deployment and leave the additive format/schema marker intact; do not delete source records or drop shared tables. No unrelated app tests, older migration tests, reset/replay or schema-wide lint.

Plan review: scope is limited to source representation and numeric validation; no seeding, identity, voting, authentication or existing pool rules change. Empty contribution arrays explicitly mean the first eight values were not entered. The admin-only app route remains the authorization boundary; RPC permissions remain service-only.

Evidence: isolated PGlite passed the new migration and its focused SQL test on September 26. Verified linked target `gsiyqhkcgegjrvqcqioc`, all 50 predecessors match, and dry run names only `20260926020000_tournament_seeding_manual_ninth.sql`. One scoped migration review found no behavioral defect. No unrelated tests or hosted data mutations. PR/production deployment remains pending.
