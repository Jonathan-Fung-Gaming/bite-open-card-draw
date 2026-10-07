# Crossplay turn-time migration release

Completed October 8, 2026. [PR 169](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/169) merged as `3d6bba2` after Classify Changes, Quality Gates and New Migration Tests passed. Focused local SQL assertions also passed in isolated `crossplay_turn_time_20261008`.

The established linked target and consumer connection both identify `gsiyqhkcgegjrvqcqioc`. Migration history matched except for the new reviewed `20261008020000_crossplay_turn_time.sql`; dry run listed exactly that file. Post-merge push applied it alone and local/remote histories now match. No seed, role or unrelated migration was pushed.

Read-only hosted verification at `2026-10-07T22:48:49.198Z` confirms `clock_read` contains the new projection and remains a restricted security-definer function with an empty search path. The renamed helper is inaccessible to the runtime; both functions deny browser roles. Evidence is retained in the consumer repository's ignored `.local/turn-time-production-verification.json`. No production tournament data was mutated by verification.

One coordinated review completed, with no SQL blocker. The consuming app repaired and tested old-client journal metadata compatibility. Its four phone/tablet Chromium/WebKit scenarios and five related clock/layout scenarios pass. No sibling application suite, old migration test suite, shared reset or schema-wide lint ran. No unresolved database blocker remains. App rollback retains this additive read.
