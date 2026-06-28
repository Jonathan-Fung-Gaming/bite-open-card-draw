import "server-only";
import { HostLockStore } from "@/lib/admin/host-lock";
import { RosterStore } from "@/lib/admin/roster";

const globalForAdminState = globalThis as typeof globalThis & {
  biteOpenAdminState?: {
    hostLockStore: HostLockStore;
    rosterStore: RosterStore;
  };
};

export const adminState =
  globalForAdminState.biteOpenAdminState ??
  (globalForAdminState.biteOpenAdminState = {
    hostLockStore: new HostLockStore(),
    rosterStore: new RosterStore(),
  });
