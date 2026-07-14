"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { RosterPlayer } from "@/lib/admin/roster";
import { createClientRequestId } from "@/lib/admin/request-id";
import {
  SerializedRosterStatusBatcher,
  type RosterMutationResult,
} from "@/lib/admin/roster-client-state";
import {
  ROSTER_SNAPSHOT_EVENT,
  editRosterUsername,
  rosterSnapshotSchema,
  setRosterActiveStatus,
} from "@/lib/admin/roster-mutation-transport";
import { addPlayerAction, bulkImportPlayersAction } from "../actions";

type AdminRosterPanelProps = {
  activeCount: number;
  canControl: boolean;
  initialVersion: number;
  players: RosterPlayer[];
};

const NEUTRAL_ROSTER_BUTTON_CLASS =
  "rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 hover:border-ember-300/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

function usernameStateClass(active: boolean) {
  return active ? "text-green-200" : "text-red-300";
}

function normalizeUsername(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function AdminRosterPanel({
  activeCount: initialActiveCount,
  canControl,
  initialVersion,
  players: initialPlayers,
}: AdminRosterPanelProps) {
  const batcherRef = useRef<SerializedRosterStatusBatcher | null>(null);

  if (!batcherRef.current) {
    batcherRef.current = new SerializedRosterStatusBatcher({
      initialPlayers,
      initialVersion,
      mutate: setRosterActiveStatus,
    });
  }

  const batcher = batcherRef.current;
  const roster = useSyncExternalStore(batcher.subscribe, batcher.getSnapshot, batcher.getSnapshot);
  const [draftUsername, setDraftUsername] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, setRenamePending] = useState(false);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const usernameTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    batcher.mergeCanonical(initialVersion, initialPlayers);
  }, [batcher, initialPlayers, initialVersion]);

  useEffect(() => {
    function handleRosterSnapshot(event: Event) {
      const parsed = rosterSnapshotSchema.safeParse((event as CustomEvent<unknown>).detail);

      if (parsed.success) {
        batcher.mergeCanonical(parsed.data.version, parsed.data.players);
      }
    }

    window.addEventListener(ROSTER_SNAPSHOT_EVENT, handleRosterSnapshot);

    return () => window.removeEventListener(ROSTER_SNAPSHOT_EVENT, handleRosterSnapshot);
  }, [batcher]);

  useEffect(() => {
    if (!canControl && editingPlayerId) {
      setEditingPlayerId(null);
      setDraftUsername("");
      setEditingUsername("");
      setRenameError(null);
    }
  }, [canControl, editingPlayerId]);

  function restoreUsernameFocus(playerId: string) {
    window.requestAnimationFrame(() => usernameTriggerRefs.current.get(playerId)?.focus());
  }

  function beginEditing(player: RosterPlayer) {
    if (!canControl || player.hasTournamentHistory || renamePending) {
      return;
    }

    setEditingPlayerId(player.id);
    setEditingUsername(player.startggUsername);
    setDraftUsername(player.startggUsername);
    setRenameError(null);

    window.requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  }

  function cancelEditing() {
    if (!editingPlayerId || renamePending) {
      return;
    }

    const playerId = editingPlayerId;
    setEditingPlayerId(null);
    setDraftUsername("");
    setEditingUsername("");
    setRenameError(null);
    restoreUsernameFocus(playerId);
  }

  function handleUsernameTriggerKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    player: RosterPlayer,
  ) {
    if (event.key !== "Enter" && event.key !== "F2") {
      return;
    }

    event.preventDefault();
    beginEditing(player);
  }

  function handleUsernameTriggerPointerUp(
    event: PointerEvent<HTMLButtonElement>,
    player: RosterPlayer,
  ) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    event.preventDefault();
    beginEditing(player);
  }

  async function saveUsername(player: RosterPlayer) {
    const nextUsername = draftUsername.trim();

    if (!nextUsername) {
      setRenameError("start.gg username is required.");
      window.requestAnimationFrame(() => editInputRef.current?.focus());
      return;
    }

    const normalized = normalizeUsername(nextUsername);
    const duplicateActive =
      player.active &&
      roster.players.some(
        (candidate) =>
          candidate.id !== player.id &&
          candidate.active &&
          normalizeUsername(candidate.startggUsername) === normalized,
      );

    if (duplicateActive) {
      setRenameError(`Active start.gg username already exists: ${nextUsername}`);
      window.requestAnimationFrame(() => editInputRef.current?.focus());
      return;
    }

    if (nextUsername === player.startggUsername) {
      cancelEditing();
      return;
    }

    const requestId = createClientRequestId();
    setRenameError(null);
    setRenamePending(true);

    let result: RosterMutationResult;

    try {
      result = await editRosterUsername({
        expectedUpdatedAt: player.updatedAt,
        expectedVersion: roster.version,
        playerId: player.id,
        requestId,
        startggUsername: nextUsername,
      });
    } catch (error) {
      result = {
        message: error instanceof Error ? error.message : "Could not edit start.gg username.",
        ok: false,
        players: [],
        requestId,
        retryable: false,
        version: roster.version,
      };
    }

    batcher.mergeCanonical(result.version, result.players);
    setRenamePending(false);

    if (result.requestId !== requestId) {
      setRenameError("Could not confirm this username change.");
      window.requestAnimationFrame(() => editInputRef.current?.focus());
      return;
    }

    if (!result.ok) {
      setRenameError(result.message);
      window.requestAnimationFrame(() => editInputRef.current?.focus());
      return;
    }

    setEditingPlayerId(null);
    setDraftUsername("");
    setEditingUsername("");
    setRenameError(null);
    restoreUsernameFocus(player.id);
  }

  return (
    <section className="metal-panel rounded-lg p-4" data-testid="admin-roster-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Roster</p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">Players</h2>
        </div>
        <p
          aria-live="polite"
          className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm text-metal-300"
          data-canonical-count={initialActiveCount}
          data-count={roster.activeCount}
          data-testid="admin-active-player-count"
        >
          Active {roster.activeCount}
        </p>
      </div>
      {!canControl ? (
        <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
          Take host control to edit the roster.
        </p>
      ) : null}
      <form action={addPlayerAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          name="startggUsername"
          required
          maxLength={100}
          disabled={!canControl}
          placeholder="start.gg username"
          className="min-w-0 flex-1 rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
        />
        <button
          className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Add Player
        </button>
      </form>
      <form action={bulkImportPlayersAction} className="mt-4 grid gap-2">
        <textarea
          name="startggUsernames"
          rows={4}
          disabled={!canControl}
          placeholder="Bulk import start.gg usernames"
          className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
        />
        <button
          className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Bulk Import
        </button>
      </form>
      <div className="mt-4 overflow-hidden rounded border border-metal-700 text-sm">
        <table className="w-full table-fixed border-collapse" data-testid="admin-roster-table">
          <colgroup>
            <col className="w-[58%] sm:w-[64%]" />
            <col className="w-[42%] sm:w-[36%]" />
          </colgroup>
          <thead className="bg-black/40 text-left text-xs uppercase tracking-[0.16em] text-ember-300">
            <tr>
              <th className="px-3 py-3" scope="col">
                Username
              </th>
              <th className="px-3 py-3" scope="col">
                Active Control
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metal-700">
            {roster.players.map((player) => {
              const editing = editingPlayerId === player.id;
              const pending = roster.pendingPlayerIds.has(player.id);
              const statusError = roster.errors.get(player.id);
              const historyExplanationId = `roster-history-lock-${player.id}`;

              return (
                <tr
                  key={player.id}
                  className="bg-black/20 align-top"
                  data-active={player.active ? "true" : "false"}
                  data-pending={pending ? "true" : "false"}
                  data-player-id={player.id}
                  data-player-username={player.startggUsername}
                  data-testid="admin-roster-row"
                >
                  <td className="min-w-0 px-3 py-3">
                    {editing ? (
                      <form
                        className="grid min-w-0 gap-2"
                        data-admin-dirty={draftUsername !== editingUsername ? "true" : "false"}
                        data-admin-live-refresh-blocking="true"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveUsername(player);
                        }}
                      >
                        <label className="sr-only" htmlFor={`roster-username-${player.id}`}>
                          Edit start.gg username for {editingUsername}
                        </label>
                        <input
                          ref={editInputRef}
                          id={`roster-username-${player.id}`}
                          name="startggUsername"
                          aria-required="true"
                          maxLength={100}
                          value={draftUsername}
                          aria-invalid={renameError ? "true" : undefined}
                          disabled={renamePending}
                          className="min-w-0 max-w-full rounded border border-metal-700 bg-black/30 px-2 py-2 text-white [overflow-wrap:anywhere] disabled:opacity-60"
                          onChange={(event) => {
                            setDraftUsername(event.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelEditing();
                            }
                          }}
                        />
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <button
                            className={NEUTRAL_ROSTER_BUTTON_CLASS}
                            disabled={renamePending}
                            type="submit"
                          >
                            {renamePending ? "Saving" : "Save Name"}
                          </button>
                          <button
                            className={NEUTRAL_ROSTER_BUTTON_CLASS}
                            disabled={renamePending}
                            type="button"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </button>
                        </div>
                        {renameError ? (
                          <p className="break-words text-xs text-red-300" role="alert">
                            {renameError}
                          </p>
                        ) : null}
                      </form>
                    ) : player.hasTournamentHistory ? (
                      <div
                        className="min-w-0"
                        aria-describedby={historyExplanationId}
                        data-testid="admin-roster-username-locked"
                      >
                        <p
                          className={`font-semibold ${usernameStateClass(player.active)} [overflow-wrap:anywhere]`}
                          data-testid="admin-roster-username"
                        >
                          {player.startggUsername}
                        </p>
                        <p
                          id={historyExplanationId}
                          className="mt-1 text-xs text-metal-400 [overflow-wrap:anywhere]"
                        >
                          Username cannot be edited because this player has tournament history.
                        </p>
                      </div>
                    ) : canControl ? (
                      <button
                        ref={(element) => {
                          if (element) {
                            usernameTriggerRefs.current.set(player.id, element);
                          } else {
                            usernameTriggerRefs.current.delete(player.id);
                          }
                        }}
                        aria-label={`Edit username ${player.startggUsername}`}
                        className={`block min-h-11 max-w-full cursor-text touch-manipulation text-left font-semibold ${usernameStateClass(player.active)} [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-300`}
                        data-testid="admin-roster-username"
                        type="button"
                        onDoubleClick={() => beginEditing(player)}
                        onKeyDown={(event) => handleUsernameTriggerKeyDown(event, player)}
                        onPointerUp={(event) => handleUsernameTriggerPointerUp(event, player)}
                      >
                        {player.startggUsername}
                      </button>
                    ) : (
                      <p
                        className={`font-semibold ${usernameStateClass(player.active)} [overflow-wrap:anywhere]`}
                        data-testid="admin-roster-username"
                      >
                        {player.startggUsername}
                      </p>
                    )}
                  </td>
                  <td className="min-w-0 px-3 py-3">
                    <button
                      aria-busy={pending ? "true" : undefined}
                      aria-label={`${player.active ? "Mark inactive" : "Reactivate"} ${player.startggUsername}`}
                      className={`${NEUTRAL_ROSTER_BUTTON_CLASS} min-h-11 w-full min-w-0 whitespace-normal [overflow-wrap:anywhere]`}
                      disabled={!canControl}
                      type="button"
                      onClick={() => batcher.setDesiredActive(player.id, !player.active)}
                    >
                      {player.active ? "Mark Inactive" : "Reactivate"}
                    </button>
                    {statusError ? (
                      <p
                        className="mt-2 break-words text-xs text-red-300"
                        data-testid="admin-roster-row-error"
                        role="alert"
                      >
                        {statusError}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {roster.players.length === 0 ? (
              <tr className="bg-black/20">
                <td className="px-3 py-4 text-metal-400" colSpan={2}>
                  No players have been added yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
