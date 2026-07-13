import type { VotingRoundStatus } from "./voting-window";

export type AuthoritativeCountdownSample = {
  roundNumber: 1 | 2 | 3 | 4;
  revision: number;
  status: VotingRoundStatus;
  deadline: string | null;
  serverNowMs: number;
  remainingMs: number;
};

export type AuthoritativeCountdownAnchor = {
  roundNumber: 1 | 2 | 3 | 4;
  revision: number;
  status: VotingRoundStatus;
  deadlineMs: number | null;
  anchorRemainingMs: number;
  anchorPerformanceMs: number;
  lastRenderedRemainingMs: number;
  running: boolean;
};

export type CountdownSampleDecision =
  | "accepted_initial"
  | "accepted_new_round"
  | "accepted_new_revision"
  | "ignored_same_revision"
  | "ignored_older_revision"
  | "rejected_invalid_sample"
  | "rejected_same_revision_lifecycle_change";

export type CountdownSampleResult = {
  anchor: AuthoritativeCountdownAnchor | null;
  decision: CountdownSampleDecision;
};

export type CountdownTick = {
  anchor: AuthoritativeCountdownAnchor;
  remainingMs: number;
};

const RUNNING_STATUSES = new Set<VotingRoundStatus>([
  "voting_open",
  "final_30_seconds",
  "extension_1_minute",
]);

function parseDeadline(deadline: string | null) {
  if (deadline === null) {
    return null;
  }

  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(deadlineMs) ? deadlineMs : Number.NaN;
}

function isValidSample(sample: AuthoritativeCountdownSample, deadlineMs: number | null) {
  const running = RUNNING_STATUSES.has(sample.status);

  return (
    Number.isInteger(sample.roundNumber) &&
    sample.roundNumber >= 1 &&
    sample.roundNumber <= 4 &&
    Number.isSafeInteger(sample.revision) &&
    sample.revision >= 0 &&
    Number.isFinite(sample.serverNowMs) &&
    Number.isFinite(sample.remainingMs) &&
    sample.remainingMs >= 0 &&
    !Number.isNaN(deadlineMs) &&
    (!running || deadlineMs !== null)
  );
}

function createAnchor(
  sample: AuthoritativeCountdownSample,
  deadlineMs: number | null,
  performanceNowMs: number,
): AuthoritativeCountdownAnchor {
  const remainingMs = Math.max(0, sample.remainingMs);

  return {
    roundNumber: sample.roundNumber,
    revision: sample.revision,
    status: sample.status,
    deadlineMs,
    anchorRemainingMs: remainingMs,
    anchorPerformanceMs: performanceNowMs,
    lastRenderedRemainingMs: remainingMs,
    running: RUNNING_STATUSES.has(sample.status),
  };
}

function sameLifecycle(
  anchor: AuthoritativeCountdownAnchor,
  sample: AuthoritativeCountdownSample,
  deadlineMs: number | null,
) {
  return anchor.status === sample.status && anchor.deadlineMs === deadlineMs;
}

export function acceptAuthoritativeCountdownSample(
  current: AuthoritativeCountdownAnchor | null,
  sample: AuthoritativeCountdownSample,
  performanceNowMs: number,
): CountdownSampleResult {
  const deadlineMs = parseDeadline(sample.deadline);

  if (!Number.isFinite(performanceNowMs) || !isValidSample(sample, deadlineMs)) {
    return { anchor: current, decision: "rejected_invalid_sample" };
  }

  if (current === null) {
    return {
      anchor: createAnchor(sample, deadlineMs, performanceNowMs),
      decision: "accepted_initial",
    };
  }

  if (sample.roundNumber !== current.roundNumber) {
    return {
      anchor: createAnchor(sample, deadlineMs, performanceNowMs),
      decision: "accepted_new_round",
    };
  }

  if (sample.revision < current.revision) {
    return { anchor: current, decision: "ignored_older_revision" };
  }

  if (sample.revision === current.revision) {
    return sameLifecycle(current, sample, deadlineMs)
      ? { anchor: current, decision: "ignored_same_revision" }
      : { anchor: current, decision: "rejected_same_revision_lifecycle_change" };
  }

  return {
    anchor: createAnchor(sample, deadlineMs, performanceNowMs),
    decision: "accepted_new_revision",
  };
}

export function tickAuthoritativeCountdown(
  anchor: AuthoritativeCountdownAnchor,
  performanceNowMs: number,
): CountdownTick {
  const safePerformanceNowMs = Number.isFinite(performanceNowMs)
    ? performanceNowMs
    : anchor.anchorPerformanceMs;
  const elapsedMs = anchor.running
    ? Math.max(0, safePerformanceNowMs - anchor.anchorPerformanceMs)
    : 0;
  const calculatedRemainingMs = Math.max(0, anchor.anchorRemainingMs - elapsedMs);
  const remainingMs = Math.min(anchor.lastRenderedRemainingMs, calculatedRemainingMs);

  if (remainingMs === anchor.lastRenderedRemainingMs) {
    return { anchor, remainingMs };
  }

  return {
    anchor: {
      ...anchor,
      lastRenderedRemainingMs: remainingMs,
    },
    remainingMs,
  };
}

export function isAuthoritativeCountdownRunning(status: VotingRoundStatus) {
  return RUNNING_STATUSES.has(status);
}
