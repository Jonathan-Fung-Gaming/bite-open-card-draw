import "server-only";
import { isProductionDeploymentEnv } from "@/lib/server/env";
import { getTournamentStateBackend, type TournamentStateBackend } from "@/lib/server/persistence";

const DISPOSABLE_REHEARSAL_EVENT_ID = /^(e2e|phase9|load|rehearsal)-[a-z0-9-]+$/i;

export type DeploymentSafetySnapshot = {
  backend: TournamentStateBackend;
  nodeEnv: string;
  eventId: string | null;
  rehearsalAdminControlsAllowed: boolean;
  rehearsalControlBlockReason: string | null;
  operationalDataDescription: string;
};

function getEventId() {
  return process.env.TOURNAMENT_EVENT_ID?.trim() || null;
}

export function getDeploymentSafetySnapshot(): DeploymentSafetySnapshot {
  const backend = getTournamentStateBackend();
  const nodeEnv = process.env.NODE_ENV || "development";
  const eventId = getEventId();
  const explicitRehearsalControls =
    process.env.TOURNAMENT_ALLOW_REHEARSAL_ADMIN_CONTROLS === "true";
  const disposableEventId = eventId ? DISPOSABLE_REHEARSAL_EVENT_ID.test(eventId) : false;
  const localMemoryMode = backend === "memory" && !isProductionDeploymentEnv();
  const explicitDisposableRehearsal = explicitRehearsalControls && disposableEventId;
  const rehearsalAdminControlsAllowed = localMemoryMode || explicitDisposableRehearsal;

  let rehearsalControlBlockReason: string | null = null;

  if (!rehearsalAdminControlsAllowed) {
    rehearsalControlBlockReason =
      explicitRehearsalControls && !disposableEventId
        ? "Rehearsal reset and seed controls require a disposable event id beginning with e2e-, phase9-, load-, or rehearsal-."
        : "Rehearsal reset and seed controls are disabled for event deployments unless explicitly enabled for a disposable rehearsal event.";
  }

  return {
    backend,
    nodeEnv,
    eventId,
    rehearsalAdminControlsAllowed,
    rehearsalControlBlockReason,
    operationalDataDescription:
      backend === "supabase"
        ? `persistent Supabase event data${eventId ? ` for ${eventId}` : ""}`
        : "memory-only local process data",
  };
}

export function requireRehearsalAdminControlsAllowed(actionLabel: string) {
  const snapshot = getDeploymentSafetySnapshot();

  if (!snapshot.rehearsalAdminControlsAllowed) {
    throw new Error(
      `${actionLabel} is disabled in this deployment. ${snapshot.rehearsalControlBlockReason}`,
    );
  }

  return snapshot;
}
