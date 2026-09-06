# PIU two-player schema checklist

- [x] Scoped plan and pre-implementation review recorded.
- [x] Read-only target, history parity and empty PIU account inventory verified.
- [x] New migration and isolated prerequisite fixture implemented.
- [x] Only the new migration's focused SQL checks pass on disposable PostgreSQL 17.
- [ ] Coordinated final review and any focused repair complete.
- [ ] PR merged; target/parity/dry-run rechecked.
- [ ] Only reviewed migration applied and verified read-only.

App/UI tests run in the consuming repository, not this migration-only change.
