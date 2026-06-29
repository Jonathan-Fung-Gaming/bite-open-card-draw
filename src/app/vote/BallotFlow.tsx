"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { BallotSetChoice, RoundBallot } from "@/lib/vote/ballot";
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
  submittedPlayerIds: string[];
  statusLabel: string;
  timerText: string;
  turnoutText: string;
  canSubmit: boolean;
  eligiblePlayerIds: string[];
};

const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";
const DEVICE_STORAGE_KEY = "bite-open-card-draw:device-id:v1";

function emptyChoices(draws: DrawRecord[]): BallotSetChoice[] {
  return draws.map((draw) => ({
    roundSetId: draw.id,
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

function choicesFromBallot(draws: DrawRecord[], ballot: RoundBallot) {
  return draws.map((draw) => {
    const existing = ballot.choices.find((choice) => choice.roundSetId === draw.id);
    const chartIds = new Set(draw.charts.map((chart) => chart.id));
    const bannedChartIds = existing?.bannedChartIds.filter((chartId) => chartIds.has(chartId)) ?? [];

    return {
      roundSetId: draw.id,
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

export function BallotFlow({
  roundNumber,
  players,
  draws,
  submittedPlayerIds,
  statusLabel,
  timerText,
  turnoutText,
  canSubmit: initialCanSubmit,
  eligiblePlayerIds,
}: BallotFlowProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => emptyChoices(draws));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(null);
  const [existingBallot, setExistingBallot] = useState<RoundBallot | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [liveCanSubmit, setLiveCanSubmit] = useState(initialCanSubmit);
  const [liveStatusLabel, setLiveStatusLabel] = useState(statusLabel);
  const [liveTimerText, setLiveTimerText] = useState(timerText);
  const [liveTurnoutText, setLiveTurnoutText] = useState(turnoutText);
  const [liveSubmittedPlayerIds, setLiveSubmittedPlayerIds] = useState(submittedPlayerIds);
  const [isPending, startTransition] = useTransition();
  const initializedIdentityRef = useRef(false);
  const eligibleFingerprintRef = useRef(eligiblePlayerIds.join("|"));
  const refreshRequestedRef = useRef(false);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const alreadySubmitted =
    liveSubmittedPlayerIds.includes(selectedPlayerId) || existingBallot !== null;
  const currentDraw = draws[step];
  const currentChoice = choices[step];
  const canSubmit = choices.every(
    (choice) =>
      (choice.noBans && choice.bannedChartIds.length === 0) ||
      (!choice.noBans && choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2),
  );

  const loadExistingBallot = useCallback(
    async (
      playerId: string,
      options: { autoConfirmExisting?: boolean; resetWhenMissing?: boolean } = {},
    ) => {
      setLookupPending(true);

      try {
        const ballot = await getExistingBallotAction(roundNumber, playerId);

        setExistingBallot(ballot);

        if (ballot) {
          setChoices(choicesFromBallot(draws, ballot));
          setSavedAt(ballot.submittedAt);
          setMessage(`Loaded saved revision ${ballot.revision}.`);

          if (options.autoConfirmExisting) {
            setConfirmed(true);
          }
        } else if (options.resetWhenMissing) {
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
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not claim voter presence.");
      }
    },
    [roundNumber],
  );

  const warning = useMemo(() => {
    if (!selectedPlayer || !alreadySubmitted) {
      return null;
    }

    if (existingBallot) {
      return `A ballot already exists for this start.gg username from ${existingBallot.submittedAt}. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
    }

    return `A ballot already exists for this start.gg username. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
  }, [alreadySubmitted, existingBallot, selectedPlayer]);

  useEffect(() => {
    setLiveCanSubmit(initialCanSubmit);
    setLiveStatusLabel(statusLabel);
    setLiveTimerText(timerText);
    setLiveTurnoutText(turnoutText);
    setLiveSubmittedPlayerIds(submittedPlayerIds);
    eligibleFingerprintRef.current = eligiblePlayerIds.join("|");
  }, [
    eligiblePlayerIds,
    initialCanSubmit,
    statusLabel,
    submittedPlayerIds,
    timerText,
    turnoutText,
  ]);

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
    let cancelled = false;

    async function poll() {
      try {
        const state = await getVoteLiveStateAction(roundNumber, selectedPlayerId || undefined);

        if (cancelled) {
          return;
        }

        setLiveCanSubmit(state.canSubmit);
        setLiveStatusLabel(state.statusLabel);
        setLiveTimerText(state.timerText);
        setLiveTurnoutText(state.turnoutText);
        setLiveSubmittedPlayerIds(state.submittedPlayerIds);

        const nextEligibleFingerprint = state.eligiblePlayerIds.join("|");

        if (nextEligibleFingerprint !== eligibleFingerprintRef.current) {
          eligibleFingerprintRef.current = nextEligibleFingerprint;
          router.refresh();
        }

        if (state.existingBallot) {
          setExistingBallot(state.existingBallot);

          if (savedAt || !confirmed) {
            setChoices(choicesFromBallot(draws, state.existingBallot));
            setSavedAt(state.existingBallot.submittedAt);
          }
        }

        if (!state.canSubmit && !refreshRequestedRef.current) {
          refreshRequestedRef.current = true;
          setMessage("Voting state changed. Ballot changes are disabled while this phone refreshes.");
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          setMessage("Could not refresh voting status. Server validation still protects submissions.");
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
  }, [confirmed, draws, roundNumber, router, savedAt, selectedPlayerId]);

  useEffect(() => {
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
    const bannedChartIds = exists
      ? currentChoice.bannedChartIds.filter((id) => id !== chartId)
      : [...currentChoice.bannedChartIds, chartId].slice(0, 2);

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
          choices,
        });

        rememberIdentity(selectedPlayer);
        setExistingBallot(ballot);
        setSavedAt(ballot.submittedAt);
        setMessage(`Saved revision ${ballot.revision}.`);
        setLiveSubmittedPlayerIds((current) =>
          current.includes(selectedPlayer.id) ? current : [...current, selectedPlayer.id],
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Save failed. Previous server ballot remains valid.",
        );
      }
    });
  }

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
          value={selectedPlayerId}
          onChange={(event) => {
            const playerId = event.target.value;

            setSelectedPlayerId(playerId);
            setConfirmed(false);
            setSavedAt(null);
            setExistingBallot(null);
            setPresenceWarning(null);
            setChoices(emptyChoices(draws));
            setMessage(null);
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
          <p className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
            {warning}
          </p>
        ) : null}
        {presenceWarning ? (
          <p className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            {presenceWarning}
          </p>
        ) : null}
        <button
          className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={!selectedPlayer || lookupPending || !liveCanSubmit}
          onClick={() => {
            if (selectedPlayer) {
              rememberIdentity(selectedPlayer);
              void claimPresence(selectedPlayer);
            }

            setConfirmed(true);
          }}
          type="button"
        >
          {lookupPending ? "Checking saved ballot" : "Confirm"}
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
        <div className="mt-5 grid gap-3">
          {choices.map((choice) => {
            const draw = draws.find((candidate) => candidate.id === choice.roundSetId);

            return (
              <div
                key={choice.roundSetId}
                className="rounded border border-metal-700 bg-black/25 p-3"
              >
                <p className="font-bold text-white">{choice.displayLabel}</p>
                <p className="mt-1 text-sm text-metal-300">{describeChoice(draw, choice)}</p>
              </div>
            );
          })}
        </div>
        {message ? <p className="mt-3 text-sm text-ember-300">{message}</p> : null}
        {liveCanSubmit ? (
          <button
            className="button-metal mt-5 rounded px-4 py-3 font-black uppercase"
            onClick={() => setSavedAt(null)}
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
        <div className="mt-5 grid gap-3">
          {choices.map((choice) => (
            <div
              key={choice.roundSetId}
              className="rounded border border-metal-700 bg-black/25 p-3"
            >
              <p className="font-bold text-white">{choice.displayLabel}</p>
              <p className="mt-1 text-sm text-metal-300">
                {choice.noBans
                  ? "No bans for this set"
                  : describeChoice(
                      draws.find((draw) => draw.id === choice.roundSetId),
                      choice,
                    )}
              </p>
            </div>
          ))}
        </div>
        {message ? <p className="mt-3 text-sm text-ember-300">{message}</p> : null}
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
              className={`relative min-h-32 overflow-hidden rounded border bg-cover bg-center p-3 text-left ${
                selected ? "border-ember-300 bg-ember-900/40" : "border-metal-700 bg-black/25"
              } ${index === 6 ? "col-span-2 mx-auto w-1/2 min-w-40" : ""}`}
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
              <span className="relative text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                {chart.displayDifficulty}
              </span>
              <span className="relative mt-2 block font-black uppercase text-white">
                {chart.name}
              </span>
              <span className="relative mt-1 block text-sm text-metal-300">{chart.artist}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-3 rounded border border-metal-700 bg-black/25 p-3 text-sm font-bold text-metal-300">
        <input
          type="checkbox"
          checked={currentChoice?.noBans ?? false}
          disabled={!liveCanSubmit}
          onChange={(event) =>
            currentChoice &&
            updateChoice({
              ...currentChoice,
              noBans: event.target.checked,
              bannedChartIds: [],
            })
          }
        />
        No bans for this set
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300 disabled:opacity-40"
          disabled={step === 0}
          onClick={() => setStep((current) => current - 1)}
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
          onClick={() => setStep((current) => current + 1)}
          type="button"
        >
          {step === 1 ? "Review" : "Next"}
        </button>
      </div>
    </section>
  );
}
