# PIU Standard push migration release

[PR #165](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/165) passed its focused migration-only checks and merged as `1bb97a27d02be8802f662021f53b09b584932059`. Only `20261005020000_piu_standard_pushes.sql` was applied to the verified healthy linked project `gsiyqhkcgegjrvqcqioc` after exact predecessor parity and sole-pending-migration dry-run inspection.

All 59 local/remote migration records now match and the final dry run is empty. All three allowlisted profiles advertise `standardPushes: 1` beside their unchanged existing capabilities. Both changed functions retain service-only access; before/after profile revisions and run/assignment/attempt/receipt counts match exactly. The consuming trainer can deploy Standard policy `3.1.0` with all twelve progression-selected push slots, while historical policies remain compatible.

Only the new migration's isolated PostgreSQL mode/lane/version/target/compatibility/capability/ACL/profile/revision/replay checks ran. Root completed one coordinated review with no actionable findings. No older migrations/tests, sibling application gates, shared Auth changes, data rewrite, full reset, schema-wide lint or additional review ran. No blocker remains. The [phase plan](phase-plans/phase-piu-standard-pushes-2026-10-05.md) contains detailed scope and evidence.
