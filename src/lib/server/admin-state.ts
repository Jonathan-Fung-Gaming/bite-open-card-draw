import "server-only";
import { HostLockStore } from "@/lib/admin/host-lock";
import { RosterStore } from "@/lib/admin/roster";
import { DrawStateStore } from "@/lib/draw/draw-state";
import { BallotStore } from "@/lib/vote/ballot-store";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: {
    hostLockStore: HostLockStore;
    rosterStore: RosterStore;
    drawStateStore: DrawStateStore;
    ballotStore: BallotStore;
  };
};

export const adminState =
  globalForAdminState.biteOpenAdminState ??
  (globalForAdminState.biteOpenAdminState = {
    hostLockStore: new HostLockStore(),
    rosterStore: new RosterStore(),
    drawStateStore: new DrawStateStore(),
    ballotStore: new BallotStore(),
  });
