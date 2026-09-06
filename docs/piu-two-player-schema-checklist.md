# PIU two-player schema checklist

- [x] Scoped plan and pre-implementation review recorded.
- [x] Read-only target, history parity and empty PIU account inventory verified.
- [x] New migration and isolated prerequisite fixture implemented.
- [x] Only the new migration's focused SQL checks pass on disposable PostgreSQL 17.
- [x] Coordinated final review complete; no SQL findings. Consuming-app findings were repaired in its repository.
- [x] [PR #147](https://github.com/Jonathan-Fung-Gaming/bite-open-card-draw/pull/147) merged as `447d614f91b6558d82f9fb7f23f56f89ce1d1ae8` after migration-only CI passed; target/parity/dry-run rechecked.
- [x] Only `20260906020000_piu_trainer_two_players.sql` applied to `gsiyqhkcgegjrvqcqioc`; all 46 migration records match and the final dry-run is empty.
- [x] Hosted read-only verification confirms distinct HDS/JONATHAN journal mappings, service access/browser denial on all three new tables, and all six new/changed RPCs present.

App/UI tests run in the consuming repository, not this migration-only change.
