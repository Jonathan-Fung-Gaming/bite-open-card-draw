# Ninth-best Pumbility model from 300-chart accounts

Latest user instruction: update the formula, skip tests and checks, push, merge and deploy. This explicitly waives the usual local/CI verification and review gates for this scoped release.

Scope: additive v3 formula support, 49.43741445 * ninth contribution + 48.79026599. New normal sources retain all nine real contributions; a verified smaller list retains actual Pumbility with no prediction. Preserve v1/v2 source records, immutable publications, numeric validation, and RPC access restrictions. The 300-chart minimum describes the regression training data, not entrant eligibility.

Implementation: extend the version-specific constraint and commit RPC; add readiness 20260927020000. Deploy this migration before the consuming app. Rollback restores the prior app and retains additive schema/history. Existing full-nine and legacy known-ninth sources can be recalculated by the consumer; partial top-three sources have no current prediction until corrected.

Tests, lint, typecheck, build-as-a-check, review, migration dry run and post-deploy smoke: NOT RUN at explicit user request. GitHub CI skipped for these commits. Vercel still needs its deployment build. Apply only this migration to the already established linked project gsiyqhkcgegjrvqcqioc. No reset, unrelated migrations or data rewrite.
