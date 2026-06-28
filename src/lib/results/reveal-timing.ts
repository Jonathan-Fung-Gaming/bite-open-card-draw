export const TIEBREAK_REVEAL_DURATION_MS = 5_000;

export function getTiebreakRevealRemainingMs(startedAt: string | null | undefined, nowMs: number) {
  if (!startedAt) {
    return TIEBREAK_REVEAL_DURATION_MS;
  }

  const startedMs = Date.parse(startedAt);

  if (!Number.isFinite(startedMs)) {
    return TIEBREAK_REVEAL_DURATION_MS;
  }

  return Math.max(0, TIEBREAK_REVEAL_DURATION_MS - (nowMs - startedMs));
}

export function isTiebreakRevealComplete(startedAt: string | null | undefined, nowMs: number) {
  return getTiebreakRevealRemainingMs(startedAt, nowMs) === 0;
}
