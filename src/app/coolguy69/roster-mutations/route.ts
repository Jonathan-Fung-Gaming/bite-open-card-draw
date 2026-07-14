import { z } from "zod";
import { editPlayerUsernameAction, setPlayerActiveStatusAction } from "@/app/coolguy69/actions";
import {
  ROSTER_MUTATION_REQUEST_HEADER,
  ROSTER_MUTATION_REQUEST_HEADER_VALUE,
  rosterMutationResultSchema,
  rosterSnapshotSchema,
} from "@/lib/admin/roster-mutation-transport";
import { getAdminSessionFromCookies } from "@/lib/server/admin-auth";
import { adminState } from "@/lib/server/admin-state";
import { getTournamentEventId } from "@/lib/server/env";
import {
  rosterActiveStatusBatchInputSchema,
  rosterUsernameEditInputSchema,
} from "@/lib/server/mutation-contracts";
import { readNormalizedRosterVersion } from "@/lib/server/normalized-roster";
import {
  getMemoryRosterVersion,
  getTournamentStateBackend,
  hydrateTournamentState,
} from "@/lib/server/persistence";
import { safeRosterMutationMessage } from "@/lib/server/roster-mutation-errors";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROSTER_MUTATION_BODY_BYTES = 32 * 1_024;
const NO_STORE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie, Origin",
};

const rosterMutationRequestSchema = z.discriminatedUnion("mutation", [
  z
    .object({
      input: rosterActiveStatusBatchInputSchema,
      mutation: z.literal("active-status"),
    })
    .strict(),
  z
    .object({
      input: rosterUsernameEditInputSchema,
      mutation: z.literal("username"),
    })
    .strict(),
]);

class BodyTooLargeError extends Error {}

type RosterSnapshotRow = {
  active: boolean;
  created_at: string;
  has_tournament_history: boolean;
  id: string;
  startgg_username: string;
  startgg_username_normalized: string;
  updated_at: string;
};

type RosterSnapshotReadClient = {
  from(table: "players"): {
    select(columns: string): {
      eq(
        column: "event_id",
        eventId: string,
      ): Promise<{
        data: RosterSnapshotRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: NO_STORE_HEADERS,
    status,
  });
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function hasExpectedOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    const requestUrl = new URL(request.url);
    const host =
      firstForwardedValue(request.headers.get("x-forwarded-host")) ??
      request.headers.get("host") ??
      requestUrl.host;
    const protocol =
      firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
      requestUrl.protocol.replace(":", "");
    const expectedOrigin = new URL(`${protocol}://${host}`).origin;

    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isSameOriginMutationRequest(request: Request) {
  if (
    request.headers.get(ROSTER_MUTATION_REQUEST_HEADER) !== ROSTER_MUTATION_REQUEST_HEADER_VALUE
  ) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  return (!fetchSite || fetchSite === "same-origin") && hasExpectedOrigin(request);
}

function isSameOriginSnapshotRequest(request: Request) {
  if (
    request.headers.get(ROSTER_MUTATION_REQUEST_HEADER) !== ROSTER_MUTATION_REQUEST_HEADER_VALUE
  ) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite !== "same-origin") {
    return false;
  }

  return !request.headers.has("origin") || hasExpectedOrigin(request);
}

function hasJsonContentType(request: Request) {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

async function readLimitedJsonBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredLength = Number(contentLength);

    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new SyntaxError("Invalid content length.");
    }

    if (declaredLength > MAX_ROSTER_MUTATION_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
  }

  if (!request.body) {
    throw new SyntaxError("Request body is required.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      body += decoder.decode();
      break;
    }

    byteLength += value.byteLength;

    if (byteLength > MAX_ROSTER_MUTATION_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }

    body += decoder.decode(value, { stream: true });
  }

  return JSON.parse(body) as unknown;
}

export async function GET(request: Request) {
  if (!isSameOriginSnapshotRequest(request)) {
    return jsonResponse({ error: "Request rejected." }, 403);
  }

  let session: Awaited<ReturnType<typeof getAdminSessionFromCookies>>;

  try {
    session = await getAdminSessionFromCookies();
  } catch {
    return jsonResponse({ error: "Roster snapshot could not be loaded." }, 500);
  }

  if (!session) {
    return jsonResponse({ error: "Admin session required." }, 401);
  }

  try {
    const eventId = getTournamentEventId();

    if (getTournamentStateBackend() === "memory") {
      await hydrateTournamentState();

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const versionBefore = getMemoryRosterVersion(eventId);
        const players = adminState.rosterStore.listPlayers();
        const versionAfter = getMemoryRosterVersion(eventId);

        if (versionBefore !== versionAfter) {
          continue;
        }

        return jsonResponse(
          rosterSnapshotSchema.parse({
            activeCount: players.filter((player) => player.active).length,
            players,
            version: versionAfter,
          }),
        );
      }

      throw new Error("Roster changed while its memory snapshot was being read.");
    }

    const supabase = createServiceRoleSupabaseClient() as unknown as RosterSnapshotReadClient;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const versionBefore = await readNormalizedRosterVersion({ eventId });
      const playersResult = await supabase
        .from("players")
        .select(
          "id,startgg_username,startgg_username_normalized,active,has_tournament_history,created_at,updated_at",
        )
        .eq("event_id", eventId);

      if (playersResult.error) {
        throw new Error(playersResult.error.message);
      }

      const versionAfter = await readNormalizedRosterVersion({ eventId });

      if (versionBefore.version !== versionAfter.version) {
        continue;
      }

      const players = (playersResult.data ?? [])
        .map((row) => ({
          active: row.active,
          createdAt: row.created_at,
          hasTournamentHistory: row.has_tournament_history,
          id: row.id,
          normalizedUsername: row.startgg_username_normalized,
          startggUsername: row.startgg_username,
          updatedAt: row.updated_at,
        }))
        .sort((left, right) => left.startggUsername.localeCompare(right.startggUsername));
      const snapshot = rosterSnapshotSchema.parse({
        activeCount: players.filter((player) => player.active).length,
        players,
        version: versionAfter.version,
      });

      return jsonResponse(snapshot);
    }

    throw new Error("Roster changed while its snapshot was being read.");
  } catch {
    return jsonResponse({ error: "Roster snapshot could not be loaded." }, 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return jsonResponse({ error: "Request rejected." }, 403);
  }

  if (!hasJsonContentType(request)) {
    return jsonResponse({ error: "JSON content is required." }, 415);
  }

  let unsafeBody: unknown;

  try {
    unsafeBody = await readLimitedJsonBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonResponse({ error: "Request body is too large." }, 413);
    }

    return jsonResponse({ error: "Invalid roster mutation request." }, 400);
  }

  const requestResult = rosterMutationRequestSchema.safeParse(unsafeBody);

  if (!requestResult.success) {
    return jsonResponse({ error: "Invalid roster mutation request." }, 400);
  }

  try {
    const result =
      requestResult.data.mutation === "active-status"
        ? await setPlayerActiveStatusAction(requestResult.data.input)
        : await editPlayerUsernameAction(requestResult.data.input);
    const validatedResult = rosterMutationResultSchema.safeParse(result);

    if (!validatedResult.success) {
      return jsonResponse({ error: "Roster mutation response was invalid." }, 500);
    }

    return jsonResponse(
      validatedResult.data.ok
        ? validatedResult.data
        : {
            ...validatedResult.data,
            message: safeRosterMutationMessage(
              validatedResult.data.message,
              "Could not update the roster.",
            ),
          },
    );
  } catch {
    return jsonResponse({ error: "Roster mutation request could not be completed." }, 500);
  }
}
