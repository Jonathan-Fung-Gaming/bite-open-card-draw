# Admin Action Policy Matrix

Status: Phase 0 production-readiness decision lock.

Authoritative implementation matrix: `src/lib/admin/action-policy.ts`.

This document records how `/coolguy69` server actions are classified for password re-entry,
host-lock, and audit requirements. It follows the narrow product policy:

- Explicit dangerous actions require admin password re-entry, an audit reason, active host control
  where applicable, and a dangerous audit row.
- Routine host controls remain active-host-only plus audit.
- Sensitive disclosures are host/admin gated as listed, but do not require password re-entry unless
  separately classified as dangerous.

| Server action | Classification | Active host | Password re-entry | Audit |
| --- | --- | ---: | ---: | ---: |
| `adminLoginAction` | Read-only or sensitive disclosure | No | No | No |
| `adminLogoutAction` | Read-only or sensitive disclosure | No | No | No |
| `refreshAdminSessionAction` | Read-only or sensitive disclosure | No | No | No |
| `takeHostControlAction` | Read-only or sensitive disclosure | No | Conditional for forced takeover | Yes |
| `refreshHostLockAction` | Read-only or sensitive disclosure | No | No | No |
| `releaseHostControlAction` | Read-only or sensitive disclosure | No | No | Yes |
| `addPlayerAction` | Active-host-only tournament action | Yes | No | Yes |
| `bulkImportPlayersAction` | Active-host-only tournament action | Yes | No | Yes |
| `setPlayerActiveStatusAction` | Active-host-only tournament action | Yes | No | Yes |
| `editPlayerUsernameAction` | Active-host-only tournament action | Yes | No | Yes |
| `updateChartExclusionAction` | Password-required dangerous action | Yes | Yes | Yes |
| `addInactivePlayerToCurrentRoundAction` | Password-required dangerous action | Yes | Yes | Yes |
| `drawRoundSetAction` | Active-host-only tournament action | Yes | No | Yes |
| `rerollOneChartAction` | Password-required dangerous action | Yes | Yes | Yes |
| `rerollRoundSetAction` | Password-required dangerous action | Yes | Yes | Yes |
| `rerollFullRoundAction` | Password-required dangerous action | Yes | Yes | Yes |
| `openVotingAction` | Active-host-only tournament action | Yes | No | Yes |
| `pauseVotingAction` | Active-host-only tournament action | Yes | No | Yes |
| `resumeVotingAction` | Active-host-only tournament action | Yes | No | Yes |
| `closeVotingAction` | Active-host-only tournament action | Yes | No | Yes |
| `manualBallotAction` | Password-required dangerous action | Yes | Yes | Yes |
| `computeResultsAction` | Active-host-only tournament action | Yes | No | Yes |
| `advanceResultRevealAction` | Active-host-only tournament action | Yes | No | Yes |
| `downloadPrivateCsvAction` | Read-only or sensitive disclosure | Yes | No | Yes |
| `downloadDebugSnapshotAction` | Password-required dangerous action | Yes | Yes | Yes |
| `setCurrentRoundAction` | Active-host-only tournament action | Yes | No | Yes |
| `advanceCurrentRoundAction` | Active-host-only tournament action | Yes | No | Yes |
| `startRehearsalModeAction` | Password-required dangerous action | Yes | Yes | Yes |
| `resetRehearsalModeAction` | Password-required dangerous action | Yes | Yes | Yes |
| `seedRehearsalTiebreakAction` | Password-required dangerous action | Yes | Yes | Yes |
| `reopenVotingAction` | Password-required dangerous action | Yes | Yes | Yes |
| `resetRoundAction` | Password-required dangerous action | Yes | Yes | Yes |
| `overrideResultAction` | Password-required dangerous action | Yes | Yes | Yes |

`takeHostControlAction` is conditional: normal host acquisition does not require password re-entry,
but `forceHostTakeover=true` requires password re-entry, an audit reason, and a dangerous audit row.

## Locked Tie Decision

For 5 or more charts tied for fewest bans, including a true zero-ballot seven-way tie, the backend
commits the selected winner before reveal and the UI uses the simple fallback reveal. The
12-slot rune wheel remains limited to 2-, 3-, and 4-way least-ban ties.
