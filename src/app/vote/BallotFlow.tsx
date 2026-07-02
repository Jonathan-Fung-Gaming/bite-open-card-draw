"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { BallotSetChoice, PublicBallotLookup, PublicEditableBallot } from "@/lib/vote/ballot";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import {
  claimVoterPresenceAction,
  getExistingBallotAction,
  getVoteLiveStateAction,
  submitRoundBallotAction,
} from "./actions";

type BallotFlowProps = {
  roundNumber: 1 | 2 | 3 | 4;
  players: EligiblePlayerSnapshot[];
  draws: DrawRecord[];
  statusLabel: string;
  timerText: string;
  turnoutText: string;
  canSubmit: boolean;
};

const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";
const DEVICE_STORAGE_KEY = "bite-open-card-draw:device-id:v1";
const EDIT_TOKEN_STORAGE_KEY = "bite-open-card-draw:ballot-edit-tokens:v1";
const SAVE_FAILURE_REASSURANCE = "Previous server-confirmed ballot remains valid.";

function emptyChoices(draws: DrawRecord[]): BallotSetChoice[] {
  return draws.map((draw) => ({
    drawId: draw.id,
    roundSetId: draw.roundSetId,
    displayLabel: draw.displayLabel,
    noBans: false,
    bannedChartIds: [],
  }));
}

function readRememberedIdentity() {
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      playerId?: unknown;
      startggUsername?: unknown;
    };

    return typeof parsed.playerId === "string" && typeof parsed.startggUsername === "string"
      ? {
          playerId: parsed.playerId,
          startggUsername: parsed.startggUsername,
        }
      : null;
  } catch {
    return null;
  }
}

function rememberIdentity(player: EligiblePlayerSnapshot) {
  window.localStorage.setItem(
    IDENTITY_STORAGE_KEY,
    JSON.stringify({
      playerId: player.id,
      startggUsername: player.startggUsername,
    }),
  );
}

function getDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);

  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }

  return deviceId;
}

function editTokenKey(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return `${roundNumber}:${playerId}`;
}

function readStoredEditTokens() {
  try {
    const raw = window.localStorage.getItem(EDIT_TOKEN_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeStoredEditTokens(tokens: Record<string, string>) {
  window.localStorage.setItem(EDIT_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

function readBallotEditToken(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return readStoredEditTokens()[editTokenKey(roundNumber, playerId)] ?? null;
}

function getBallotEditToken(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  const key = editTokenKey(roundNumber, playerId);
  const tokens = readStoredEditTokens();
  const existing = tokens[key];

  if (existing) {
    return existing;
  }

  const token = window.crypto.randomUUID();
  writeStoredEditTokens({
    ...tokens,
    [key]: token,
  });

  return token;
}

function choicesFromBallot(draws: DrawRecord[], ballot: PublicEditableBallot) {
  return draws.map((draw) => {
    const existing = ballot.choices.find((choice) => choice?.drawId === draw.id);
    const chartIds = new Set(draw.charts.map((chart) => chart.id));
    const bannedChartIds =
      existing?.bannedChartIds.filter((chartId) => chartIds.has(chartId)) ?? [];

    return {
      drawId: draw.id,
      roundSetId: draw.roundSetId,
      displayLabel: draw.displayLabel,
      noBans: Boolean(existing?.noBans) && bannedChartIds.length === 0,
      bannedChartIds,
    };
  });
}

function describeChoice(draw: DrawRecord | undefined, choice: BallotSetChoice) {
  if (choice.noBans) {
    return "No bans for this set";
  }

  if (!draw || choice.bannedChartIds.length === 0) {
    return `${choice.bannedChartIds.length} ban selection(s)`;
  }

  const names = choice.bannedChartIds.map((chartId) => {
    const chart = draw.charts.find((candidate) => candidate.id === chartId);

    return chart ? chart.name : chartId;
  });

  return names.join(", ");
}

function saveFailureMessage(message: string) {
  return message.includes(SAVE_FAILURE_REASSURANCE)
    ? message
    : `${message} ${SAVE_FAILURE_REASSURANCE}`;
}

function feedbackRole(message: string) {
  return /failed|could not|not open|disabled|warning|another active device/i.test(message)
    ? "alert"
    : "status";
}

export function BallotFlow({
  roundNumber,
  players,
  draws,
  statusLabel,
  timerText,
  turnoutText,
  canSubmit: initialCanSubmit,
}: BallotFlowProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => emptyChoices(draws));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(null);
  const [presencePending, setPresencePending] = useState(false);
  const [existingBallot, setExistingBallot] = useState<PublicEditableBallot | null>(null);
  const [existingBallotLookup, setExistingBallotLookup] = useState<PublicBallotLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [liveCanSubmit, setLiveCanSubmit] = useState(initialCanSubmit);
  const [liveStatusLabel, setLiveStatusLabel] = useState(statusLabel);
  const [liveTimerText, setLiveTimerText] = useState(timerText);
  const [liveTurnoutText, setLiveTurnoutText] = useState(turnoutText);
  const [isPending, startTransition] = useTransition();
  const initializedIdentityRef = useRef(false);
  const refreshRequestedRef = useRef(false);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const alreadySubmitted = existingBallotLookup?.exists === true;
  const currentDraw = draws[step];
  const currentChoice = choices[step];
  const canSubmit = choices.every(
    (choice) =>
      (choice.noBans && choice.bannedChartIds.length === 0) ||
      (!choice.noBans && choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2),
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  const loadExistingBallot = useCallback(
    async (
      playerId: string,
      options: { autoConfirmExisting?: boolean; resetWhenMissing?: boolean } = {},
    ) => {
      setLookupPending(true);

      try {
        const lookup = await getExistingBallotAction(
          roundNumber,
          playerId,
          getBallotEditToken(roundNumber, playerId),
        );
        const ballot = lookup.ballot;

        setExistingBallotLookup(lookup);
        setExistingBallot(ballot);

        if (ballot) {
          setChoices(choicesFromBallot(draws, ballot));
          setSavedAt(ballot.submittedAt);
          setMessage(`Loaded saved revision ${ballot.revision}.`);

          if (options.autoConfirmExisting) {
            setConfirmed(true);
          }
        } else if (options.resetWhenMissing || lookup.exists) {
          setChoices(emptyChoices(draws));
          setSavedAt(null);
          setMessage(null);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load saved ballot.");
      } finally {
        setLookupPending(false);
      }
    },
    [draws, roundNumber],
  );

  const claimPresence = useCallback(
    async (player: EligiblePlayerSnapshot) => {
      try {
        const presence = await claimVoterPresenceAction({
          roundNumber,
          playerId: player.id,
          deviceId: getDeviceId(),
        });

        if (presence.hasOtherActiveDevice) {
          setPresenceWarning(
            `Another active device has already claimed ${player.startggUsername}. You can continue, but the latest valid submitted ballot will count.`,
          );
        } else {
          setPresenceWarning(null);
        }

        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not claim voter presence.");
        return false;
      }
    },
    [roundNumber],
  );

  const warning = useMemo(() => {
    if (!selectedPlayer || !alreadySubmitted) {
      return null;
    }

    if (existingBallotLookup?.canEdit && existingBallot) {
      return `A ballot already exists for this start.gg username from ${existingBallot.submittedAt}. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
    }

    return `A ballot already exists for this start.gg username. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
  }, [alreadySubmitted, existingBallot, existingBallotLookup, selectedPlayer]);

  useEffect(() => {
    setLiveCanSubmit(initialCanSubmit);
    setLiveStatusLabel(statusLabel);
    setLiveTimerText(timerText);
    setLiveTurnoutText(turnoutText);
  }, [initialCanSubmit, statusLabel, timerText, turnoutText]);

  useEffect(() => {
    if (initializedIdentityRef.current) {
      return;
    }

    const remembered = readRememberedIdentity();

    if (!remembered) {
      initializedIdentityRef.current = true;
      return;
    }

    const rememberedPlayer =
      players.find((player) => player.id === remembered.playerId) ??
      players.find((player) => player.startggUsername === remembered.startggUsername);

    if (!rememberedPlayer) {
      return;
    }

    initializedIdentityRef.current = true;
    setSelectedPlayerId(rememberedPlayer.id);
    void loadExistingBallot(rememberedPlayer.id, { autoConfirmExisting: true });
  }, [loadExistingBallot, players]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true") {
      return undefined;
    }

    let cancelled = false;

    async function poll() {
      try {
        const state = await getVoteLiveStateAction(
          roundNumber,
          selectedPlayerId || undefined,
          selectedPlayerId
            ? (readBallotEditToken(roundNumber, selectedPlayerId) ?? undefined)
            : undefined,
        );

        if (cancelled) {
          return;
        }

        setLiveCanSubmit(state.canSubmit);
        setLiveStatusLabel(state.statusLabel);
        setLiveTimerText(state.timerText);
        setLiveTurnoutText(state.turnoutText);

        if (state.eligibleCount !== players.length) {
          router.refresh();
        }

        if (state.existingBallotLookup) {
          const ballot = state.existingBallotLookup.ballot;

          setExistingBallotLookup(state.existingBallotLookup);
          setExistingBallot(ballot);

          if (ballot && (savedAt || !confirmed)) {
            setChoices(choicesFromBallot(draws, ballot));
            setSavedAt(ballot.submittedAt);
          }
        }

        if (!state.canSubmit && !refreshRequestedRef.current) {
          refreshRequestedRef.current = true;
          setMessage(
            "Voting state changed. Ballot changes are disabled while this phone refreshes.",
          );
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          setMessage(
            "Could not refresh voting status. Server validation still protects submissions.",
          );
        }
      }
    }

    const interval = window.setInterval(() => {
      void poll();
    }, 1500);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [confirmed, draws, players.length, roundNumber, router, savedAt, selectedPlayerId]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true") {
      return undefined;
    }

    if (!confirmed || !selectedPlayer || !liveCanSubmit) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void claimPresence(selectedPlayer);
    }, 30_000);

    void claimPresence(selectedPlayer);

    return () => window.clearInterval(interval);
  }, [claimPresence, confirmed, liveCanSubmit, selectedPlayer]);

  function updateChoice(nextChoice: BallotSetChoice) {
    setChoices((current) => current.map((choice, index) => (index === step ? nextChoice : choice)));
  }

  function toggleBan(chartId: string) {
    if (!currentChoice) {
      return;
    }

    const exists = currentChoice.bannedChartIds.includes(chartId);

    if (!exists && currentChoice.bannedChartIds.length >= 2) {
      setSelectionMessage(`Only 2 bans can be selected for ${currentChoice.displayLabel}.`);
      return;
    }

    const bannedChartIds = exists
      ? currentChoice.bannedChartIds.filter((id) => id !== chartId)
      : [...currentChoice.bannedChartIds, chartId];

    setSelectionMessage(null);

    updateChoice({
      ...currentChoice,
      noBans: false,
      bannedChartIds,
    });
  }

  function submit() {
    if (!selectedPlayer || !canSubmit || !liveCanSubmit) {
      if (!liveCanSubmit) {
        setMessage("Voting is not open for ballot changes.");
      }

      return;
    }

    startTransition(async () => {
      try {
        const ballot = await submitRoundBallotAction({
          roundNumber,
          playerId: selectedPlayer.id,
          playerStartggUsername: selectedPlayer.startggUsername,
          deviceId: getDeviceId(),
          editToken: getBallotEditToken(roundNumber, selectedPlayer.id),
          choices,
        });

        rememberIdentity(selectedPlayer);
        setExistingBallot(ballot);
        setExistingBallotLookup({
          exists: true,
          revision: ballot.revision,
          canEdit: true,
          warning: null,
          ballot,
        });
        setSavedAt(ballot.submittedAt);
        setMessage(`Saved revision ${ballot.revision}.`);
      } catch (error) {
        if (existingBallot) {
          setChoices(choicesFromBallot(draws, existingBallot));
          setSavedAt(existingBallot.submittedAt);
        }

        setMessage(
          error instanceof Error
            ? saveFailureMessage(error.message)
            : saveFailureMessage("Save failed."),
        );
      }
    });
  }

  const presenceWarningBanner = presenceWarning ? (
    <p
      className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
      role="alert"
    >
      {presenceWarning}
    </p>
  ) : null;

  if (draws.length !== 2) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-lg font-bold text-metal-300">
          Both chart sets must be drawn before voting opens.
        </p>
      </section>
    );
  }

  if (!confirmed) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <div className="mb-5 grid gap-2 rounded border border-metal-700 bg-black/25 p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
              {liveStatusLabel}
            </p>
            <p className="mt-1 text-sm text-metal-300">{liveTurnoutText}</p>
          </div>
          <p className="font-mono text-3xl font-black tabular-nums text-white">{liveTimerText}</p>
        </div>
        {!liveCanSubmit ? (
          <p className="mb-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            Voting is not accepting ballot changes right now.
          </p>
        ) : null}
        <label
          className="text-sm font-bold uppercase tracking-[0.16em] text-ember-300"
          htmlFor="startgg-username"
        >
          Select your start.gg username
        </label>
        <select
          id="startgg-username"
          className="mt-3 w-full rounded border border-metal-700 bg-black/35 px-3 py-3 text-white"
          disabled={!hydrated}
          value={selectedPlayerId}
          onChange={(event) => {
            const playerId = event.target.value;

            setSelectedPlayerId(playerId);
            setConfirmed(false);
            setSavedAt(null);
            setExistingBallot(null);
            setExistingBallotLookup(null);
            setPresenceWarning(null);
            setChoices(emptyChoices(draws));
            setMessage(null);
            setSelectionMessage(null);
            if (playerId) {
              void loadExistingBallot(playerId, { resetWhenMissing: true });
            }
          }}
        >
          <option value="">Choose username</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.startggUsername}
            </option>
          ))}
        </select>
        {selectedPlayer ? (
          <p className="mt-4 rounded border border-ember-300/20 bg-black/25 p-3 text-sm font-semibold text-ember-300">
            Are you sure you are voting as {selectedPlayer.startggUsername}?
          </p>
        ) : null}
        {warning ? (
          <p
            className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300"
            role="alert"
          >
            {warning}
          </p>
        ) : null}
        {presenceWarningBanner}
        <button
          className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={
            !hydrated || !selectedPlayer || lookupPending || presencePending || !liveCanSubmit
          }
          onClick={async () => {
            if (!selectedPlayer) {
              return;
            }

            setPresencePending(true);
            rememberIdentity(selectedPlayer);
            const claimed = await claimPresence(selectedPlayer);
            setPresencePending(false);

            if (!claimed) {
              return;
            }

            setConfirmed(true);
          }}
          type="button"
        >
          {presencePending
            ? "Checking username"
            : lookupPending
              ? "Checking saved ballot"
              : "Confirm"}
        </button>
      </section>
    );
  }

  if (savedAt) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Ballot Saved
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          {selectedPlayer?.startggUsername}
        </h1>
        <p className="mt-3 text-metal-300">Server-confirmed timestamp: {savedAt}</p>
        {presenceWarningBanner}
        <div className="mt-5 grid gap-3">
          {choices.map((choice, index) => {
            const draw = draws.find((candidate) => candidate.id === choice.drawId);

            return (
              <div key={choice.drawId} className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="font-bold text-white">{choice.displayLabel}</p>
                <p className="mt-1 text-sm text-metal-300">{describeChoice(draw, choice)}</p>
                {liveCanSubmit ? (
                  <button
                    className="mt-3 rounded border border-ember-300/35 px-3 py-2 text-xs font-black uppercase text-ember-300"
                    onClick={() => {
                      setSavedAt(null);
                      setStep(index);
                      setSelectionMessage(null);
                    }}
                    type="button"
                  >
                    Edit {choice.displayLabel}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role={feedbackRole(message)}>
            {message}
          </p>
        ) : null}
        {liveCanSubmit ? (
          <button
            className="button-metal mt-5 rounded px-4 py-3 font-black uppercase"
            onClick={() => {
              setSavedAt(null);
              setStep(draws.length);
              setSelectionMessage(null);
            }}
            type="button"
          >
            Change vote
          </button>
        ) : (
          <p className="mt-5 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            Voting is no longer open for changes.
          </p>
        )}
      </section>
    );
  }

  if (step >= draws.length) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Review and Submit
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          Round {roundNumber} Ballot
        </h1>
        {presenceWarningBanner}
        <div className="mt-5 grid gap-3">
          {choices.map((choice, index) => (
            <div key={choice.drawId} className="rounded border border-metal-700 bg-black/25 p-3">
              <p className="font-bold text-white">{choice.displayLabel}</p>
              <p className="mt-1 text-sm text-metal-300">
                {choice.noBans
                  ? "No bans for this set"
                  : describeChoice(
                      draws.find((draw) => draw.id === choice.drawId),
                      choice,
                    )}
              </p>
              <button
                className="mt-3 rounded border border-ember-300/35 px-3 py-2 text-xs font-black uppercase text-ember-300"
                onClick={() => {
                  setStep(index);
                  setSelectionMessage(null);
                }}
                type="button"
              >
                Edit {choice.displayLabel}
              </button>
            </div>
          ))}
        </div>
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role={feedbackRole(message)}>
            {message}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300"
            onClick={() => setStep(1)}
          >
            Back
          </button>
          <button
            className="button-metal rounded px-4 py-3 font-black uppercase disabled:opacity-40"
            disabled={!canSubmit || isPending || !liveCanSubmit}
            onClick={submit}
          >
            Submit Ballot
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="metal-panel rounded-lg p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
        Step {step + 1}: Set {step + 1}
      </p>
      <h1 className="mt-2 text-3xl font-black uppercase text-white">{currentDraw?.displayLabel}</h1>
      {presenceWarningBanner}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-metal-700 bg-black/25 p-3">
        <p className="text-sm font-black uppercase text-white" data-testid="ban-selection-counter">
          {currentChoice?.bannedChartIds.length ?? 0}/2 bans selected
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metal-300">
          Choose up to two charts or explicit no-bans
        </p>
      </div>
      {selectionMessage ? (
        <p
          className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
          data-testid="ban-limit-feedback"
          role="alert"
        >
          {selectionMessage}
        </p>
      ) : null}
      {!liveCanSubmit ? (
        <p className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
          Voting is not accepting ballot changes right now.
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {currentDraw?.charts.map((chart, index) => {
          const selected = currentChoice?.bannedChartIds.includes(chart.id) ?? false;
          return (
            <button
              key={chart.id}
              aria-label={`Ban ${chart.name} (${chart.displayDifficulty})`}
              aria-pressed={selected}
              className={clsx(
                "relative min-h-40 min-w-0 overflow-hidden rounded border bg-cover bg-center p-3 text-left",
                selected
                  ? "border-ember-300 bg-ember-900/40 shadow-ember-tight"
                  : "border-metal-700 bg-black/25",
                index === 6 ? "col-span-2 mx-auto w-[calc((100%_-_0.75rem)/2)] min-w-0" : "",
              )}
              data-chart-image-path={chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
              data-testid="ballot-chart-card"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.32), rgba(0, 0, 0, 0.86)), url(${
                  chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH
                })`,
              }}
              onClick={() => toggleBan(chart.id)}
              disabled={!liveCanSubmit}
              type="button"
            >
              <span className="relative flex min-h-32 flex-col justify-between">
                <span className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                  <span>{chart.displayDifficulty}</span>
                  <span
                    className={clsx(
                      "rounded border px-2 py-1 font-black tracking-normal",
                      selected
                        ? "border-ember-300 bg-ember-900/45 text-white"
                        : "border-metal-700 bg-black/35 text-metal-300",
                    )}
                    data-testid="ban-selected-label"
                  >
                    {selected ? "Ban selected" : "Tap to ban"}
                  </span>
                </span>
                <span>
                  <span className="mt-2 block break-words text-sm font-black uppercase leading-tight text-white line-clamp-3 sm:text-base">
                    {chart.name}
                  </span>
                  <span className="mt-1 block break-words text-xs text-metal-300 line-clamp-2 sm:text-sm">
                    {chart.artist}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-3 rounded border border-metal-700 bg-black/25 p-3 text-sm font-bold text-metal-300">
        <input
          type="checkbox"
          checked={currentChoice?.noBans ?? false}
          disabled={!liveCanSubmit}
          onChange={(event) => {
            if (!currentChoice) {
              return;
            }

            setSelectionMessage(null);
            updateChoice({
              ...currentChoice,
              noBans: event.target.checked,
              bannedChartIds: [],
            });
          }}
        />
        No bans for this set
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300 disabled:opacity-40"
          disabled={step === 0}
          onClick={() => {
            setSelectionMessage(null);
            setStep((current) => current - 1);
          }}
          type="button"
        >
          Back
        </button>
        <button
          className="button-metal rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={
            !liveCanSubmit ||
            !currentChoice ||
            !(
              (currentChoice.noBans && currentChoice.bannedChartIds.length === 0) ||
              (!currentChoice.noBans && currentChoice.bannedChartIds.length >= 1)
            )
          }
          onClick={() => {
            setSelectionMessage(null);
            setStep((current) => current + 1);
          }}
          type="button"
        >
          {step === 1 ? "Review" : "Next"}
        </button>
      </div>
    </section>
  );
}
