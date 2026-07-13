import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptAuthoritativeCountdownSample,
  tickAuthoritativeCountdown,
  type AuthoritativeCountdownAnchor,
  type AuthoritativeCountdownSample,
} from "./authoritative-countdown";

const OPEN_DEADLINE = "2026-07-14T00:10:00.000Z";

function sample(
  overrides: Partial<AuthoritativeCountdownSample> = {},
): AuthoritativeCountdownSample {
  return {
    roundNumber: 1,
    revision: 4,
    status: "voting_open",
    deadline: OPEN_DEADLINE,
    serverNowMs: Date.parse("2026-07-14T00:00:00.000Z"),
    remainingMs: 10 * 60 * 1000,
    ...overrides,
  };
}

function acceptedAnchor(value: AuthoritativeCountdownSample = sample(), performanceNowMs = 1_000) {
  const result = acceptAuthoritativeCountdownSample(null, value, performanceNowMs);

  expect(result.decision).toBe("accepted_initial");
  expect(result.anchor).not.toBeNull();
  return result.anchor as AuthoritativeCountdownAnchor;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authoritative countdown samples", () => {
  it("calibrates once and follows monotonic elapsed time", () => {
    const anchor = acceptedAnchor();
    const afterOneSecond = tickAuthoritativeCountdown(anchor, 2_000);

    expect(afterOneSecond.remainingMs).toBe(599_000);
    expect(tickAuthoritativeCountdown(afterOneSecond.anchor, 3_250).remainingMs).toBe(597_750);
  });

  it("does not re-anchor or increase for repeated same-revision samples", () => {
    const initial = acceptedAnchor();
    const elapsed = tickAuthoritativeCountdown(initial, 6_000);
    const repeated = acceptAuthoritativeCountdownSample(
      elapsed.anchor,
      sample({
        serverNowMs: Date.parse("2026-07-14T00:00:05.000Z"),
        remainingMs: 600_000,
      }),
      6_000,
    );

    expect(repeated.decision).toBe("ignored_same_revision");
    expect(repeated.anchor).toBe(elapsed.anchor);
    expect(tickAuthoritativeCountdown(repeated.anchor!, 6_000).remainingMs).toBe(595_000);
  });

  it("ignores older revisions and rejects same-revision lifecycle changes", () => {
    const anchor = acceptedAnchor();

    expect(
      acceptAuthoritativeCountdownSample(anchor, sample({ revision: 3 }), 2_000).decision,
    ).toBe("ignored_older_revision");
    expect(
      acceptAuthoritativeCountdownSample(
        anchor,
        sample({ status: "final_30_seconds", remainingMs: 30_000 }),
        2_000,
      ).decision,
    ).toBe("rejected_same_revision_lifecycle_change");
    expect(
      acceptAuthoritativeCountdownSample(
        anchor,
        sample({ deadline: "2026-07-14T00:11:00.000Z" }),
        2_000,
      ).decision,
    ).toBe("rejected_same_revision_lifecycle_change");
  });

  it("accepts a new round even when its per-round revision is lower", () => {
    const anchor = acceptedAnchor(sample({ roundNumber: 1, revision: 20 }));
    const next = acceptAuthoritativeCountdownSample(
      anchor,
      sample({ roundNumber: 2, revision: 1 }),
      5_000,
    );

    expect(next.decision).toBe("accepted_new_round");
    expect(next.anchor).toMatchObject({ roundNumber: 2, revision: 1 });
  });

  it("rejects invalid samples without replacing the accepted anchor", () => {
    const anchor = acceptedAnchor();
    const invalid = acceptAuthoritativeCountdownSample(
      anchor,
      sample({ deadline: "not-a-timestamp" }),
      2_000,
    );

    expect(invalid).toEqual({ anchor, decision: "rejected_invalid_sample" });
  });
});

describe("authoritative countdown transitions", () => {
  it("freezes an exact authoritative pause value", () => {
    const running = tickAuthoritativeCountdown(acceptedAnchor(), 3_250);
    const paused = acceptAuthoritativeCountdownSample(
      running.anchor,
      sample({
        revision: 5,
        status: "voting_paused",
        deadline: null,
        remainingMs: 597_321,
      }),
      3_250,
    );

    expect(paused.decision).toBe("accepted_new_revision");
    expect(tickAuthoritativeCountdown(paused.anchor!, 103_250).remainingMs).toBe(597_321);
  });

  it.each([
    {
      name: "resume",
      status: "voting_open" as const,
      deadline: "2026-07-14T00:12:00.000Z",
      remainingMs: 480_000,
    },
    {
      name: "reopen",
      status: "voting_open" as const,
      deadline: "2026-07-14T00:01:00.000Z",
      remainingMs: 60_000,
    },
    {
      name: "official extension",
      status: "extension_1_minute" as const,
      deadline: "2026-07-14T00:11:00.000Z",
      remainingMs: 60_000,
    },
  ])("allows an official increase for a newer $name revision", (transition) => {
    const nearlyExpired = tickAuthoritativeCountdown(acceptedAnchor(), 599_000);
    const next = acceptAuthoritativeCountdownSample(
      nearlyExpired.anchor,
      sample({ revision: 5, ...transition }),
      599_000,
    );

    expect(next.decision).toBe("accepted_new_revision");
    expect(tickAuthoritativeCountdown(next.anchor!, 599_000).remainingMs).toBe(
      transition.remainingMs,
    );
  });

  it("calibrates the official final warning only on its newer revision", () => {
    const anchor = acceptedAnchor();
    const warning = acceptAuthoritativeCountdownSample(
      anchor,
      sample({
        revision: 5,
        status: "final_30_seconds",
        deadline: "2026-07-14T00:00:30.000Z",
        remainingMs: 30_000,
      }),
      4_000,
    );

    expect(warning.decision).toBe("accepted_new_revision");
    expect(tickAuthoritativeCountdown(warning.anchor!, 14_000).remainingMs).toBe(20_000);
  });

  it("catches up after a background jump and resumes normal cadence", () => {
    const backgrounded = tickAuthoritativeCountdown(acceptedAnchor(), 121_000);
    const foregroundTick = tickAuthoritativeCountdown(backgrounded.anchor, 122_000);

    expect(backgrounded.remainingMs).toBe(480_000);
    expect(foregroundTick.remainingMs).toBe(479_000);
  });

  it("does not depend on the device wall clock", () => {
    const anchor = acceptedAnchor();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:00.000Z"));

    expect(tickAuthoritativeCountdown(anchor, 11_000).remainingMs).toBe(590_000);
  });

  it("keeps independent stage and phone models aligned from one sample", () => {
    const stage = acceptedAnchor(sample(), 5_000);
    const phone = acceptedAnchor(sample(), 5_000);

    expect(tickAuthoritativeCountdown(stage, 7_750).remainingMs).toBe(
      tickAuthoritativeCountdown(phone, 7_750).remainingMs,
    );
  });
});
