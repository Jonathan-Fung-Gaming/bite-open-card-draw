import { describe, expect, it } from "vitest";
import {
  STAGE_RESULT_ROW_REVEAL_INTERVAL_MS,
  TIEBREAK_REVEAL_DURATION_MS,
  getStageResultCountRevealProgress,
  getTiebreakRevealProgress,
  getTiebreakRevealRemainingMs,
  isTiebreakRevealComplete,
} from "./reveal-timing";

const STARTED_AT = "2026-07-13T10:00:00.000Z";
const STARTED_AT_MS = Date.parse(STARTED_AT);

describe("authoritative reveal timing", () => {
  it("resumes a tiebreak from authoritative elapsed time", () => {
    expect(getTiebreakRevealProgress(STARTED_AT, STARTED_AT_MS + 4_000)).toEqual({
      complete: false,
      elapsedMs: 4_000,
      hasValidStart: true,
      progress: 0.4,
      remainingMs: 6_000,
    });
    expect(getTiebreakRevealRemainingMs(STARTED_AT, STARTED_AT_MS + 4_000)).toBe(6_000);
    expect(isTiebreakRevealComplete(STARTED_AT, STARTED_AT_MS + 4_000)).toBe(false);
  });

  it("reveals the committed winner immediately once ten seconds elapsed", () => {
    const progress = getTiebreakRevealProgress(
      STARTED_AT,
      STARTED_AT_MS + TIEBREAK_REVEAL_DURATION_MS + 5_000,
    );

    expect(progress).toEqual({
      complete: true,
      elapsedMs: TIEBREAK_REVEAL_DURATION_MS,
      hasValidStart: true,
      progress: 1,
      remainingMs: 0,
    });
    expect(isTiebreakRevealComplete(STARTED_AT, STARTED_AT_MS + 15_000)).toBe(true);
  });

  it("clamps future starts and safely holds invalid or missing starts", () => {
    expect(getTiebreakRevealProgress(STARTED_AT, STARTED_AT_MS - 1_000)).toMatchObject({
      complete: false,
      elapsedMs: 0,
      hasValidStart: true,
      progress: 0,
      remainingMs: TIEBREAK_REVEAL_DURATION_MS,
    });
    expect(getTiebreakRevealProgress(null, STARTED_AT_MS)).toMatchObject({
      complete: false,
      hasValidStart: false,
      progress: 0,
      remainingMs: TIEBREAK_REVEAL_DURATION_MS,
    });
    expect(getTiebreakRevealProgress("invalid", STARTED_AT_MS)).toMatchObject({
      complete: false,
      hasValidStart: false,
      progress: 0,
      remainingMs: TIEBREAK_REVEAL_DURATION_MS,
    });
  });

  it("reconstructs count-row progress instead of restarting after reload", () => {
    const interval = STAGE_RESULT_ROW_REVEAL_INTERVAL_MS;

    expect(getStageResultCountRevealProgress(STARTED_AT, STARTED_AT_MS, 7)).toMatchObject({
      complete: false,
      progress: 0,
      visibleRowCount: 1,
    });
    expect(
      getStageResultCountRevealProgress(STARTED_AT, STARTED_AT_MS + interval * 3 + 500, 7),
    ).toMatchObject({
      complete: false,
      elapsedMs: interval * 3 + 500,
      progress: 0.5,
      visibleRowCount: 4,
    });
    expect(
      getStageResultCountRevealProgress(STARTED_AT, STARTED_AT_MS + interval * 6, 7),
    ).toMatchObject({
      complete: true,
      progress: 1,
      remainingMs: 0,
      visibleRowCount: 7,
    });
  });

  it("holds at the first count row until a valid authoritative start exists", () => {
    expect(getStageResultCountRevealProgress(null, STARTED_AT_MS, 7)).toMatchObject({
      complete: false,
      hasValidStart: false,
      progress: 0,
      visibleRowCount: 1,
    });
    expect(getStageResultCountRevealProgress(STARTED_AT, STARTED_AT_MS, 0)).toMatchObject({
      complete: true,
      progress: 1,
      visibleRowCount: 0,
    });
  });
});
