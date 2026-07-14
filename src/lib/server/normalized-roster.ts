import "server-only";

import { z } from "zod";
import type { Database, Json } from "@/lib/db/database.types";
import type { RosterPlayer } from "@/lib/admin/roster";
import { getTournamentEventId } from "@/lib/server/env";
import { getMemoryRosterVersion, getTournamentStateBackend } from "@/lib/server/persistence";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

type RosterReadRpcClient = {
  rpc(
    functionName: "normalized_read_roster_version",
    args: Database["public"]["Functions"]["normalized_read_roster_version"]["Args"],
  ): Promise<{ data: Json | null; error: { message: string } | null }>;
};

type RosterReadDependencies = {
  eventId?: string;
  retries?: number;
  supabase?: RosterReadRpcClient;
};

const rosterPlayerSchema = z
  .object({
    id: z.string().uuid(),
    startggUsername: z.string().trim().min(1),
    normalizedUsername: z.string().trim().min(1),
    active: z.boolean(),
    hasTournamentHistory: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const rosterMutationEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    scope: z.literal("roster"),
    version: z.number().int().nonnegative(),
    changed: z.boolean(),
    activeCount: z.number().int().nonnegative(),
    adminActionId: z.string().uuid(),
  })
  .strict();

const renameRosterPlayerResultSchema = rosterMutationEnvelopeSchema
  .safeExtend({
    player: rosterPlayerSchema,
  })
  .strict();

const setRosterPlayerActiveStatesResultSchema = rosterMutationEnvelopeSchema
  .safeExtend({
    players: z.array(rosterPlayerSchema).max(100),
    changedPlayerIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

const rosterVersionResultSchema = z
  .object({
    eventId: z.string().trim().min(1),
    scope: z.literal("roster"),
    version: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type RosterMutationPlayer = z.infer<typeof rosterPlayerSchema>;
export type RenameRosterPlayerResult = z.infer<typeof renameRosterPlayerResultSchema>;
export type SetRosterPlayerActiveStatesResult = z.infer<
  typeof setRosterPlayerActiveStatesResultSchema
>;
export type RosterInvalidationGeneration = {
  eventScope: string;
  scope: "roster";
  version: number;
};

function createRosterReadClient() {
  return createServiceRoleSupabaseClient() as unknown as RosterReadRpcClient;
}

export async function readNormalizedRosterVersion(
  dependencies: RosterReadDependencies = {},
): Promise<z.infer<typeof rosterVersionResultSchema>> {
  const eventId = dependencies.eventId ?? getTournamentEventId();
  const supabase = dependencies.supabase ?? createRosterReadClient();
  const attempts = Math.max(1, Math.min(3, (dependencies.retries ?? 1) + 1));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.rpc("normalized_read_roster_version", {
      p_event_id: eventId,
    });

    if (error) {
      lastError = new Error(error.message);
      continue;
    }

    const parsed = rosterVersionResultSchema.safeParse(data);

    if (parsed.success && parsed.data.eventId === eventId) {
      return parsed.data;
    }

    lastError = new Error(
      parsed.success
        ? "Roster version RPC returned the wrong event scope."
        : "Roster version RPC returned an invalid response.",
    );
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Could not read the roster invalidation generation${detail}`);
}

export async function readRosterInvalidationGeneration(options?: {
  allowLegacyFallback?: boolean;
}): Promise<RosterInvalidationGeneration> {
  const eventScope = getTournamentEventId();

  if (getTournamentStateBackend() === "memory") {
    return {
      eventScope,
      scope: "roster",
      version: getMemoryRosterVersion(eventScope),
    };
  }

  try {
    const result = await readNormalizedRosterVersion({ eventId: eventScope });

    return {
      eventScope: result.eventId,
      scope: result.scope,
      version: result.version,
    };
  } catch (error) {
    if (!options?.allowLegacyFallback) {
      throw error;
    }

    return { eventScope, scope: "roster", version: 0 };
  }
}

export async function renameNormalizedRosterPlayer(input: {
  requestId: string;
  adminSessionId: string;
  hostTokenHash: string;
  expectedVersion: number;
  playerId: string;
  expectedUpdatedAt: string;
  startggUsername: string;
  startggUsernameNormalized: string;
}): Promise<RenameRosterPlayerResult> {
  const result = await executeNormalizedTransactionalMutation("renameRosterPlayer", input);

  return renameRosterPlayerResultSchema.parse(result);
}

export async function setNormalizedRosterPlayerActiveStates(input: {
  requestId: string;
  adminSessionId: string;
  hostTokenHash: string;
  expectedVersion: number;
  changes: Array<{ playerId: string; active: boolean; expectedUpdatedAt: string }>;
}): Promise<SetRosterPlayerActiveStatesResult> {
  const result = await executeNormalizedTransactionalMutation("setRosterPlayerActiveStates", input);

  return setRosterPlayerActiveStatesResultSchema.parse(result);
}

export function asRosterPlayer(player: RosterMutationPlayer): RosterPlayer {
  return { ...player };
}
