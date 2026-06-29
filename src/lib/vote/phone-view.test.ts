import { describe, expect, it } from "vitest";
import { shouldShowFinalPhoneResults } from "./phone-view";

describe("phone result display", () => {
  it("shows final charts for revealed and round-complete final results", () => {
    expect(shouldShowFinalPhoneResults("results_revealed", "final")).toBe(true);
    expect(shouldShowFinalPhoneResults("round_complete", "final")).toBe(true);
  });

  it("does not show final charts for non-final result phases", () => {
    expect(shouldShowFinalPhoneResults("round_complete", "computed")).toBe(false);
    expect(shouldShowFinalPhoneResults("results_revealing", "final")).toBe(false);
  });
});
