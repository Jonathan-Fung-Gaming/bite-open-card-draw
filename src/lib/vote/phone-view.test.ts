import { describe, expect, it } from "vitest";
import {
  formatBallotSaveFailureMessage,
  PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
  shouldShowFinalPhoneResults,
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
    expect(PUBLIC_INSPECTION_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });
});
