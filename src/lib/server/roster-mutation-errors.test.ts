import { describe, expect, it, vi } from "vitest";
import { safeRosterMutationMessage } from "./roster-mutation-errors";

vi.mock("server-only", () => ({}));

describe("safeRosterMutationMessage", () => {
  it("maps expected roster conflicts to fixed actionable messages", () => {
    expect(
      safeRosterMutationMessage(
        new Error(
          "Normalized runtime mutation renameRosterPlayer failed: Roster version changed before rename. Expected 4, found 5.",
        ),
        "fallback",
      ),
    ).toBe("The roster changed before this update committed. Refresh and try again.");
    expect(
      safeRosterMutationMessage(
        "Normalized runtime mutation renameRosterPlayer failed: Active start.gg username already exists: Secret Name",
        "fallback",
      ),
    ).toBe("An active player already uses that start.gg username.");
  });

  it("does not expose unrecognized persistence details", () => {
    expect(
      safeRosterMutationMessage(
        new Error("relation secret_internal_table violated private_constraint"),
        "Could not update the roster.",
      ),
    ).toBe("Could not update the roster.");
  });

  it("keeps pre-migration failures explicit without exposing RPC details", () => {
    expect(
      safeRosterMutationMessage(
        new Error(
          "Normalized runtime mutation renameRosterPlayer is unavailable until the Phase 4 database migration is applied: private schema cache detail",
        ),
        "fallback",
      ),
    ).toBe(
      "Roster changes are temporarily unavailable while the Phase 4 database migration is applied.",
    );
  });
});
