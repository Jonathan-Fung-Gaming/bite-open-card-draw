import { describe, expect, it } from "vitest";
import {
  formatBallotSaveFailureMessage,
  PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
  shouldShowFinalPhoneResults,
  shouldShowPhoneResultHoldingState,
  STAGE_PUBLIC_REFRESH_INTERVAL_MS,
  STAGE_REVEAL_REFRESH_INTERVAL_MS,
  VOTE_PAGE_REFRESH_INTERVAL_MS,
  VOTER_PRESENCE_REFRESH_INTERVAL_MS,
  VOTE_LIVE_POLL_INTERVAL_MS,
} from "./phone-view";

describe("phone result display", () => {
  it("shows final charts for revealed and round-complete final results", () => {
    expect(shouldShowFinalPhoneResults("results_revealed", "final")).toBe(true);
    expect(shouldShowFinalPhoneResults("round_complete", "final")).toBe(true);
  });

  it("does not show final charts for non-final result phases", () => {
    expect(shouldShowFinalPhoneResults("round_complete", "computed")).toBe(false);
    expect(shouldShowFinalPhoneResults("results_revealing", "final")).toBe(false);
  });

  it("holds phones when the final stage screen exists but public release is not committed", () => {
    expect(shouldShowFinalPhoneResults("results_revealing", "final")).toBe(false);
    expect(shouldShowPhoneResultHoldingState("results_revealing", "final")).toBe(true);
  });

  it("holds phones in result-loading states when final result data is unavailable", () => {
    expect(shouldShowPhoneResultHoldingState("voting_closed", null)).toBe(true);
    expect(shouldShowPhoneResultHoldingState("results_computed", "computed")).toBe(true);
    expect(shouldShowPhoneResultHoldingState("results_revealing", "final")).toBe(true);
    expect(shouldShowPhoneResultHoldingState("results_revealed", null)).toBe(true);
    expect(shouldShowPhoneResultHoldingState("round_complete", "computed")).toBe(true);
    expect(shouldShowPhoneResultHoldingState("round_complete", "final")).toBe(false);
    expect(shouldShowPhoneResultHoldingState("ready_to_vote", null)).toBe(false);
  });

  it("only reassures failed edits when a server-confirmed ballot exists", () => {
    expect(formatBallotSaveFailureMessage("Save failed.", false)).toBe("Save failed.");
    expect(formatBallotSaveFailureMessage("Save failed.", true)).toBe(
      "Save failed. Previous server-confirmed ballot remains valid.",
    );
    expect(
      formatBallotSaveFailureMessage(
        "Save failed. Previous server-confirmed ballot remains valid.",
        true,
      ),
    ).toBe("Save failed. Previous server-confirmed ballot remains valid.");
  });

  it("uses light phone and public polling cadences", () => {
    expect(VOTE_LIVE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
    expect(VOTE_PAGE_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(8_000);
    expect(STAGE_PUBLIC_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
    expect(STAGE_REVEAL_REFRESH_INTERVAL_MS).toBeGreaterThan(5_000);
    expect(PUBLIC_INSPECTION_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(VOTER_PRESENCE_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(45_000);
  });
});
