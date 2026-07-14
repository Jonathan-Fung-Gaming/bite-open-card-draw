import { z } from "zod";
import type { RosterActiveStatusMutationInput } from "./roster-client-state";

export const ROSTER_MUTATION_ENDPOINT = "/coolguy69/roster-mutations";
export const ROSTER_MUTATION_REQUEST_HEADER = "x-roster-mutation-request";
export const ROSTER_MUTATION_REQUEST_HEADER_VALUE = "1";
export const ROSTER_SNAPSHOT_EVENT = "bite:roster-snapshot";
export const ROSTER_VERSION_CONFIRMED_EVENT = "bite:roster-version-confirmed";

export const rosterPlayerSchema = z
  .object({
    active: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    hasTournamentHistory: z.boolean(),
    id: z.string().uuid(),
    normalizedUsername: z.string().max(100),
    startggUsername: z.string().min(1).max(100),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const rosterSnapshotSchema = z
  .object({
    activeCount: z.number().int().nonnegative(),
    players: z.array(rosterPlayerSchema).max(1_000),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type RosterSnapshot = z.infer<typeof rosterSnapshotSchema>;

export const rosterMutationResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      activeCount: z.number().int().nonnegative(),
      ok: z.literal(true),
      players: z.array(rosterPlayerSchema).max(100),
      requestId: z.string().uuid(),
      version: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      message: z.string().min(1).max(2_000),
      ok: z.literal(false),
      players: z.array(rosterPlayerSchema).max(100),
      requestId: z.string().uuid(),
      retryable: z.boolean(),
      version: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type RosterMutationTransportResult = z.infer<typeof rosterMutationResultSchema>;

export type RosterUsernameMutationInput = {
  expectedUpdatedAt: string;
  expectedVersion: number;
  playerId: string;
  requestId: string;
  startggUsername: string;
};

type RosterMutationTransportRequest =
  | {
      input: RosterActiveStatusMutationInput;
      mutation: "active-status";
    }
  | {
      input: RosterUsernameMutationInput;
      mutation: "username";
    };

async function sendRosterMutation(
  payload: RosterMutationTransportRequest,
): Promise<RosterMutationTransportResult> {
  let response: Response;

  try {
    response = await fetch(ROSTER_MUTATION_ENDPOINT, {
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
      },
      method: "POST",
    });
  } catch {
    throw new Error("Could not update the roster. Refresh the admin page and try again.");
  }

  if (!response.ok) {
    throw new Error("Could not update the roster. Refresh the admin page and try again.");
  }

  let unsafeResult: unknown;

  try {
    unsafeResult = await response.json();
  } catch {
    throw new Error("Could not confirm the roster update. Refresh the admin page and try again.");
  }

  const parsed = rosterMutationResultSchema.safeParse(unsafeResult);

  if (!parsed.success) {
    throw new Error("Could not confirm the roster update. Refresh the admin page and try again.");
  }

  if (parsed.data.ok && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ROSTER_VERSION_CONFIRMED_EVENT, {
        detail: parsed.data.version,
      }),
    );
  }

  return parsed.data;
}

export function setRosterActiveStatus(input: RosterActiveStatusMutationInput) {
  return sendRosterMutation({ input, mutation: "active-status" });
}

export function editRosterUsername(input: RosterUsernameMutationInput) {
  return sendRosterMutation({ input, mutation: "username" });
}

export async function fetchRosterSnapshot(): Promise<RosterSnapshot> {
  let response: Response;

  try {
    response = await fetch(ROSTER_MUTATION_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        [ROSTER_MUTATION_REQUEST_HEADER]: ROSTER_MUTATION_REQUEST_HEADER_VALUE,
      },
      method: "GET",
    });
  } catch {
    throw new Error("Could not refresh the roster. Try again shortly.");
  }

  if (!response.ok) {
    throw new Error("Could not refresh the roster. Try again shortly.");
  }

  let unsafeSnapshot: unknown;

  try {
    unsafeSnapshot = await response.json();
  } catch {
    throw new Error("Could not confirm the roster refresh. Try again shortly.");
  }

  const parsed = rosterSnapshotSchema.safeParse(unsafeSnapshot);

  if (!parsed.success) {
    throw new Error("Could not confirm the roster refresh. Try again shortly.");
  }

  return parsed.data;
}
