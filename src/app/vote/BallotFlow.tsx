"use client";

import { useMemo, useState, useTransition } from "react";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { BallotSetChoice } from "@/lib/vote/ballot";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import { getExistingBallotAction, submitRoundBallotAction } from "./actions";

type BallotFlowProps = {
  roundNumber: 1 | 2 | 3 | 4;
  players: EligiblePlayerSnapshot[];
  draws: DrawRecord[];
  submittedPlayerIds: string[];
  statusLabel: string;
  timerText: string;
  turnoutText: string;
};

function emptyChoices(draws: DrawRecord[]): BallotSetChoice[] {
  return draws.map((draw) => ({
    roundSetId: draw.id,
    displayLabel: draw.displayLabel,
    noBans: false,
    bannedChartIds: [],
  }));
}

export function BallotFlow({
  roundNumber,
  players,
  draws,
  submittedPlayerIds,
  statusLabel,
  timerText,
  turnoutText,
}: BallotFlowProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => emptyChoices(draws));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const alreadySubmitted = submittedPlayerIds.includes(selectedPlayerId);
  const currentDraw = draws[step];
  const currentChoice = choices[step];
  const canSubmit = choices.every(
    (choice) =>
      (choice.noBans && choice.bannedChartIds.length === 0) ||
      (!choice.noBans && choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2),
  );

  const warning = useMemo(() => {
    if (!selectedPlayer || !alreadySubmitted) {
      return null;
    }

    return `A ballot already exists for this start.gg username. Only continue if you are ${selectedPlayer.startggUsername}. The latest valid submitted ballot will count.`;
  }, [alreadySubmitted, selectedPlayer]);

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
    if (!selectedPlayer || !canSubmit) {
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

        setSavedAt(ballot.submittedAt);
        setMessage(`Saved revision ${ballot.revision}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Save failed. Previous server ballot remains valid.");
      }
    });
  }

  if (draws.length !== 2) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-lg font-bold text-metal-300">Both chart sets must be drawn before voting opens.</p>
      </section>
    );
  }

  if (!confirmed) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <div className="mb-5 grid gap-2 rounded border border-metal-700 bg-black/25 p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">{statusLabel}</p>
            <p className="mt-1 text-sm text-metal-300">{turnoutText}</p>
          </div>
          <p className="font-mono text-3xl font-black tabular-nums text-white">{timerText}</p>
        </div>
        <label className="text-sm font-bold uppercase tracking-[0.16em] text-ember-300" htmlFor="startgg-username">
          Select your start.gg username
        </label>
        <select
          id="startgg-username"
          className="mt-3 w-full rounded border border-metal-700 bg-black/35 px-3 py-3 text-white"
          value={selectedPlayerId}
          onChange={(event) => {
            setSelectedPlayerId(event.target.value);
            setMessage(null);
            if (event.target.value) {
              void getExistingBallotAction(roundNumber, event.target.value);
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
        {warning ? <p className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">{warning}</p> : null}
        <button
          className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={!selectedPlayer}
          onClick={() => setConfirmed(true)}
          type="button"
        >
          Confirm
        </button>
      </section>
    );
  }

  if (savedAt) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Ballot Saved</p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">{selectedPlayer?.startggUsername}</h1>
        <p className="mt-3 text-metal-300">Server-confirmed timestamp: {savedAt}</p>
        {message ? <p className="mt-3 text-sm text-ember-300">{message}</p> : null}
        <button className="button-metal mt-5 rounded px-4 py-3 font-black uppercase" onClick={() => setSavedAt(null)}>
          Change vote
        </button>
      </section>
    );
  }

  if (step >= draws.length) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Review and Submit</p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">Round {roundNumber} Ballot</h1>
        <div className="mt-5 grid gap-3">
          {choices.map((choice) => (
            <div key={choice.roundSetId} className="rounded border border-metal-700 bg-black/25 p-3">
              <p className="font-bold text-white">{choice.displayLabel}</p>
              <p className="mt-1 text-sm text-metal-300">
                {choice.noBans ? "No bans for this set" : `${choice.bannedChartIds.length} ban selection(s)`}
              </p>
            </div>
          ))}
        </div>
        {message ? <p className="mt-3 text-sm text-ember-300">{message}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300" onClick={() => setStep(1)}>
            Back
          </button>
          <button
            className="button-metal rounded px-4 py-3 font-black uppercase disabled:opacity-40"
            disabled={!canSubmit || isPending}
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
      <div className="mt-4 grid grid-cols-2 gap-3">
        {currentDraw?.charts.map((chart, index) => {
          const selected = currentChoice?.bannedChartIds.includes(chart.id) ?? false;
          return (
            <button
              key={chart.id}
              className={`min-h-28 rounded border p-3 text-left ${
                selected ? "border-ember-300 bg-ember-900/40" : "border-metal-700 bg-black/25"
              } ${index === 6 ? "col-span-2 mx-auto w-1/2 min-w-40" : ""}`}
              onClick={() => toggleBan(chart.id)}
              type="button"
            >
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                {chart.displayDifficulty}
              </span>
              <span className="mt-2 block font-black uppercase text-white">{chart.name}</span>
              <span className="mt-1 block text-sm text-metal-300">{chart.artist}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-3 rounded border border-metal-700 bg-black/25 p-3 text-sm font-bold text-metal-300">
        <input
          type="checkbox"
          checked={currentChoice?.noBans ?? false}
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
          disabled={!currentChoice || !((currentChoice.noBans && currentChoice.bannedChartIds.length === 0) || (!currentChoice.noBans && currentChoice.bannedChartIds.length >= 1))}
          onClick={() => setStep((current) => current + 1)}
          type="button"
        >
          {step === 1 ? "Review" : "Next"}
        </button>
      </div>
    </section>
  );
}
