"use client";

import { useEffect, useRef, useState } from "react";
import {
  acceptAuthoritativeCountdownSample,
  tickAuthoritativeCountdown,
  type AuthoritativeCountdownAnchor,
  type AuthoritativeCountdownSample,
  type CountdownSampleDecision,
} from "@/lib/vote/authoritative-countdown";
import type { VotingRoundStatus } from "@/lib/vote/voting-window";

export type AuthoritativeCountdownView = {
  acceptedRevision: number | null;
  acceptedRoundNumber: 1 | 2 | 3 | 4 | null;
  acceptedStatus: VotingRoundStatus | null;
  lastSampleDecision: CountdownSampleDecision | null;
  remainingMs: number;
};

const COUNTDOWN_TICK_INTERVAL_MS = 250;

function initialView(sample: AuthoritativeCountdownSample | null): AuthoritativeCountdownView {
  return {
    acceptedRevision: sample?.revision ?? null,
    acceptedRoundNumber: sample?.roundNumber ?? null,
    acceptedStatus: sample?.status ?? null,
    lastSampleDecision: null,
    remainingMs: Math.max(0, sample?.remainingMs ?? 0),
  };
}

function viewFromAnchor(
  anchor: AuthoritativeCountdownAnchor,
  remainingMs: number,
  lastSampleDecision: CountdownSampleDecision | null,
): AuthoritativeCountdownView {
  return {
    acceptedRevision: anchor.revision,
    acceptedRoundNumber: anchor.roundNumber,
    acceptedStatus: anchor.status,
    lastSampleDecision,
    remainingMs,
  };
}

function sameView(left: AuthoritativeCountdownView, right: AuthoritativeCountdownView) {
  return (
    left.acceptedRevision === right.acceptedRevision &&
    left.acceptedRoundNumber === right.acceptedRoundNumber &&
    left.acceptedStatus === right.acceptedStatus &&
    left.lastSampleDecision === right.lastSampleDecision &&
    left.remainingMs === right.remainingMs
  );
}

export function useAuthoritativeCountdown(sample: AuthoritativeCountdownSample | null) {
  const anchorRef = useRef<AuthoritativeCountdownAnchor | null>(null);
  const decisionRef = useRef<CountdownSampleDecision | null>(null);
  const [view, setView] = useState(() => initialView(sample));
  const deadline = sample?.deadline ?? null;
  const remainingMs = sample?.remainingMs ?? null;
  const revision = sample?.revision ?? null;
  const roundNumber = sample?.roundNumber ?? null;
  const serverNowMs = sample?.serverNowMs ?? null;
  const status = sample?.status ?? null;

  useEffect(() => {
    if (
      roundNumber === null ||
      revision === null ||
      status === null ||
      serverNowMs === null ||
      remainingMs === null
    ) {
      anchorRef.current = null;
      decisionRef.current = null;
      setView(initialView(null));
      return;
    }

    const performanceNowMs = window.performance.now();
    const result = acceptAuthoritativeCountdownSample(
      anchorRef.current,
      {
        roundNumber,
        revision,
        status,
        deadline,
        serverNowMs,
        remainingMs,
      },
      performanceNowMs,
    );

    anchorRef.current = result.anchor;
    decisionRef.current = result.decision;

    if (!result.anchor) {
      return;
    }

    const tick = tickAuthoritativeCountdown(result.anchor, performanceNowMs);
    anchorRef.current = tick.anchor;
    const nextView = viewFromAnchor(tick.anchor, tick.remainingMs, result.decision);
    setView((current) => (sameView(current, nextView) ? current : nextView));
  }, [deadline, remainingMs, revision, roundNumber, serverNowMs, status]);

  useEffect(() => {
    const tick = () => {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const next = tickAuthoritativeCountdown(anchor, window.performance.now());
      anchorRef.current = next.anchor;
      const nextView = viewFromAnchor(next.anchor, next.remainingMs, decisionRef.current);
      setView((current) => (sameView(current, nextView) ? current : nextView));
    };
    const intervalId = window.setInterval(tick, COUNTDOWN_TICK_INTERVAL_MS);

    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return view;
}
