import "server-only";
import { HostLockStore } from "@/lib/admin/host-lock";
import { RosterStore } from "@/lib/admin/roster";
import { DrawStateStore } from "@/lib/draw/draw-state";
import { ResultStore } from "@/lib/results/result-store";
import { BallotStore } from "@/lib/vote/ballot-store";
import { VotingWindowStore } from "@/lib/vote/voting-window";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: {
    hostLockStore: HostLockStore;
    rosterStore: RosterStore;
    drawStateStore: DrawStateStore;
    ballotStore: BallotStore;
    votingWindowStore: VotingWindowStore;
    resultStore: ResultStore;
  };
};

export const adminState =
  globalForAdminState.biteOpenAdminState ??
  (globalForAdminState.biteOpenAdminState = {
    hostLockStore: new HostLockStore(),
    rosterStore: new RosterStore(),
    drawStateStore: new DrawStateStore(),
    ballotStore: new BallotStore(),
    votingWindowStore: new VotingWindowStore(),
    resultStore: new ResultStore(),
  });
