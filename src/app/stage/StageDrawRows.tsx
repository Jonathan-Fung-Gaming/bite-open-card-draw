"use client";

import { useEffect, useMemo, useState } from "react";
import { StageSetPanel } from "@/components";
import {
  STAGE_CHART_REVEAL_INTERVAL_MS,
  STAGE_SET_REVEAL_GAP_MS,
  type StageSetView,
} from "@/lib/stage/stage-view";

type StageDrawRowsProps = {
  serverNowMs: number;
  sets: StageSetView[];
};

type EffectiveStarts = Record<string, string | null>;

const STORAGE_PREFIX = "bite-open-card-draw:stage-reveal-start";
const CATCH_UP_GRACE_MS = 250;

function keyForSet(setView: StageSetView) {
  return setView.draw
    ? `${STORAGE_PREFIX}:${setView.set.roundNumber}:${setView.set.setOrder}:${setView.draw.id}:${setView.draw.version}`
    : `${STORAGE_PREFIX}:${setView.set.roundNumber}:${setView.set.setOrder}:missing`;
}

function readStoredStart(key: string) {
  try {
    const value = window.sessionStorage.getItem(key);
    const parsed = value ? Date.parse(value) : NaN;

    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredStart(key: string, valueMs: number) {
  try {
    window.sessionStorage.setItem(key, new Date(valueMs).toISOString());
  } catch {
    // Session storage is an optimization for projector continuity, not tournament state.
  }
}

function buildEffectiveStarts(sets: StageSetView[], serverNowMs: number) {
  let nextRevealStartMs: number | null = null;

  return sets.reduce<EffectiveStarts>((starts, setView) => {
    const key = keyForSet(setView);

    if (!setView.draw || !setView.revealStartsAt) {
      starts[key] = null;

      return starts;
    }

    const canonicalStartMs = Date.parse(setView.revealStartsAt);
    const storedStartMs = readStoredStart(key);
    const lateStartMs =
      Number.isFinite(canonicalStartMs) && canonicalStartMs < serverNowMs - CATCH_UP_GRACE_MS
        ? serverNowMs
        : canonicalStartMs;
    const baseStartMs = storedStartMs ?? lateStartMs;
    const effectiveStartMs =
      nextRevealStartMs === null ? baseStartMs : Math.max(baseStartMs, nextRevealStartMs);

    starts[key] = new Date(effectiveStartMs).toISOString();
    writeStoredStart(key, effectiveStartMs);
    nextRevealStartMs =
      effectiveStartMs +
      setView.draw.charts.length * STAGE_CHART_REVEAL_INTERVAL_MS +
      STAGE_SET_REVEAL_GAP_MS;

    return starts;
  }, {});
}

export function StageDrawRows({ serverNowMs, sets }: StageDrawRowsProps) {
  const signature = useMemo(
    () =>
      sets
        .map((setView) =>
          [
            setView.set.roundNumber,
            setView.set.setOrder,
            setView.draw?.id ?? "missing",
            setView.draw?.version ?? 0,
            setView.revealStartsAt ?? "blocked",
          ].join(":"),
        )
        .join("|"),
    [sets],
  );
  const [effectiveStarts, setEffectiveStarts] = useState<EffectiveStarts>(() =>
    Object.fromEntries(sets.map((setView) => [keyForSet(setView), null])),
  );

  useEffect(() => {
    setEffectiveStarts(buildEffectiveStarts(sets, serverNowMs));
  }, [serverNowMs, sets, signature]);

  return (
    <div className="grid gap-1" data-testid="stage-chart-rows">
      {sets.map((setView) => (
        <StageSetPanel
          key={setView.set.displayLabel}
          set={setView.set}
          draw={setView.draw}
          revealStartsAt={effectiveStarts[keyForSet(setView)] ?? null}
          serverNowMs={serverNowMs}
        />
      ))}
    </div>
  );
}
