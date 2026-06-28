import "server-only";
import { AdminAuditStore } from "@/lib/admin/audit";
import { HostLockStore } from "@/lib/admin/host-lock";
import { RosterStore } from "@/lib/admin/roster";
import { DrawStateStore } from "@/lib/draw/draw-state";
import { ResultStore } from "@/lib/results/result-store";
import { RoundStateStore } from "@/lib/round/round-state";
import { BallotStore } from "@/lib/vote/ballot-store";
import { VotingWindowStore } from "@/lib/vote/voting-window";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: {
    auditStore: AdminAuditStore;
    hostLockStore: HostLockStore;
    rosterStore: RosterStore;
    drawStateStore: DrawStateStore;
    ballotStore: BallotStore;
    votingWindowStore: VotingWindowStore;
    resultStore: ResultStore;
    roundStateStore: RoundStateStore;
  };
};

export const adminState =
  globalForAdminState.biteOpenAdminState ??
  (globalForAdminState.biteOpenAdminState = {
    auditStore: new AdminAuditStore(),
    hostLockStore: new HostLockStore(),
    rosterStore: new RosterStore(),
    drawStateStore: new DrawStateStore(),
    ballotStore: new BallotStore(),
    votingWindowStore: new VotingWindowStore(),
    resultStore: new ResultStore(),
    roundStateStore: new RoundStateStore(),
  });

export function resetTournamentOperationalState() {
  adminState.rosterStore = new RosterStore();
  adminState.drawStateStore = new DrawStateStore();
  adminState.ballotStore = new BallotStore();
  adminState.votingWindowStore = new VotingWindowStore();
  adminState.resultStore = new ResultStore();
}
