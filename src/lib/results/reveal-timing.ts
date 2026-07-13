export const TIEBREAK_REVEAL_DURATION_MS = 10_000;
export const STAGE_RESULT_ROW_REVEAL_INTERVAL_MS = 1_100;

export type AuthoritativeRevealProgress = {
  complete: boolean;
  elapsedMs: number;
  hasValidStart: boolean;
  progress: number;
  remainingMs: number;
};

export type StageResultCountRevealProgress = AuthoritativeRevealProgress & {
  visibleRowCount: number;
};

function parseRevealStartMs(startedAt: string | null | undefined) {
  if (!startedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);

  return Number.isFinite(startedAtMs) ? startedAtMs : null;
}

function getAuthoritativeRevealProgress(
  startedAt: string | null | undefined,
  nowMs: number,
  durationMs: number,
): AuthoritativeRevealProgress {
  const startedAtMs = parseRevealStartMs(startedAt);
  const safeDurationMs = Math.max(0, durationMs);

  if (startedAtMs === null || !Number.isFinite(nowMs)) {
    return {
      complete: false,
      elapsedMs: 0,
      hasValidStart: false,
      progress: 0,
      remainingMs: safeDurationMs,
    };
  }

  const elapsedMs = Math.min(safeDurationMs, Math.max(0, nowMs - startedAtMs));
  const remainingMs = Math.max(0, safeDurationMs - elapsedMs);

  return {
    complete: remainingMs === 0,
    elapsedMs,
    hasValidStart: true,
    progress: safeDurationMs === 0 ? 1 : elapsedMs / safeDurationMs,
    remainingMs,
  };
}

export function getTiebreakRevealProgress(
  startedAt: string | null | undefined,
  nowMs: number,
): AuthoritativeRevealProgress {
  return getAuthoritativeRevealProgress(startedAt, nowMs, TIEBREAK_REVEAL_DURATION_MS);
}

export function getTiebreakRevealRemainingMs(startedAt: string | null | undefined, nowMs: number) {
  return getTiebreakRevealProgress(startedAt, nowMs).remainingMs;
}

export function isTiebreakRevealComplete(startedAt: string | null | undefined, nowMs: number) {
  return getTiebreakRevealProgress(startedAt, nowMs).complete;
}

export function getStageResultCountRevealProgress(
  startedAt: string | null | undefined,
  nowMs: number,
  rowCount: number,
): StageResultCountRevealProgress {
  const safeRowCount = Math.max(0, Math.trunc(rowCount));

  if (safeRowCount === 0) {
    return {
      complete: true,
      elapsedMs: 0,
      hasValidStart: parseRevealStartMs(startedAt) !== null && Number.isFinite(nowMs),
      progress: 1,
      remainingMs: 0,
      visibleRowCount: 0,
    };
  }

  const durationMs = (safeRowCount - 1) * STAGE_RESULT_ROW_REVEAL_INTERVAL_MS;
  const progress = getAuthoritativeRevealProgress(startedAt, nowMs, durationMs);
  const visibleRowCount = progress.hasValidStart
    ? Math.min(
        safeRowCount,
        1 + Math.floor(progress.elapsedMs / STAGE_RESULT_ROW_REVEAL_INTERVAL_MS),
      )
    : 1;

  return {
    ...progress,
    complete: progress.hasValidStart && visibleRowCount === safeRowCount,
    progress:
      safeRowCount === 1
        ? progress.hasValidStart
          ? 1
          : 0
        : (visibleRowCount - 1) / (safeRowCount - 1),
    visibleRowCount,
  };
}
