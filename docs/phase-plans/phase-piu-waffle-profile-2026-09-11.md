# PIU Trainer: WAFFLE profile

Add the specifically authorized shared profile WAFFLE#1473 with an isolated journal, default warmup 17, Singles push 22, Doubles push 24, and an official Phoenix 2 top-200 goal. The exact official API match is player 7548 with the expected game tag and unsupplemented scores. No personal account is linked without a verified mapping.

Expand only the PIU account/profile/cache allowlists and the profile resolver, daily-session validator, personal-cache validator and official-membership projection. Seed one new account and profile; preserve existing account UUIDs, settings, sessions, revision fences, receipts, grants and shared Supabase Auth configuration. No tournament changes.

Review criteria: unknown profiles must remain rejected; WAFFLE must have a distinct account; rank 200 meets the goal and rank 201 does not; existing HDS/Jonathan behavior remains accepted; 20-chart daily sessions remain valid. A frozen predecessor schema supports focused tests of only this new migration, without older migration replay or unrelated application checks.

Release order: verify the linked project and migration parity; inspect a dry run containing only the new migration; merge and apply the schema change before releasing the consuming web profile. Rollback means reverting the app entry while keeping the additive schema and any newly saved history.

- [x] Scope and plan reviewed.
- [x] Implement the scoped migration and new-migration checks.
- [x] Complete focused verification and one code review.
- [ ] Merge, apply only the verified migration, and confirm parity.
- [ ] Deploy the consuming app with the verified profile and defaults.
