import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Phase0EvidenceSafetyError,
  assertSafeDiagnosticEvidence,
  sanitizePhase0Evidence,
  writeSafeDiagnosticEvidence,
} from "./diagnostic-evidence";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Phase 0 diagnostic evidence safety", () => {
  it("retains only allowlisted aggregate, state, timing, request, and geometry fields", () => {
    expect(
      sanitizePhase0Evidence({
        diagnostics: {
          state: {
            roundNumber: 2,
            drawId: "draw-02-a",
            drawVersions: [3, 4],
            votingStatus: "open",
            votingDeadline: "2026-07-13T10:15:30.000Z",
            resultId: "result-02",
            resultPhase: "set_1_tiebreak",
            freshnessGeneration: 8,
          },
          requests: [
            {
              httpMethod: "GET",
              path: "/stage",
              httpStatus: 200,
              sequence: 1,
              harmlessDebugNote: "omitted",
            },
          ],
          roster: {
            activePlayerCount: 48,
            inactivePlayerCount: 12,
            actionCount: 30,
            confirmationLatenciesMs: [72, 90, 105],
            p50Ms: 90,
            p95Ms: 105,
            workflowDurationMs: 2_950,
          },
          geometry: {
            viewportWidth: 390,
            viewportHeight: 844,
            x: 12,
            y: 24,
            width: 366,
            height: 44,
            hasHorizontalOverflow: false,
          },
        },
        evidenceAuthor: "not retained",
      }),
    ).toEqual({
      diagnostics: {
        state: {
          roundNumber: 2,
          drawId: "draw-02-a",
          drawVersions: [3, 4],
          votingStatus: "open",
          votingDeadline: "2026-07-13T10:15:30.000Z",
          resultId: "result-02",
          resultPhase: "set_1_tiebreak",
          freshnessGeneration: 8,
        },
        requests: [
          {
            httpMethod: "GET",
            path: "/stage",
            httpStatus: 200,
            sequence: 1,
          },
        ],
        roster: {
          activePlayerCount: 48,
          inactivePlayerCount: 12,
          actionCount: 30,
          confirmationLatenciesMs: [72, 90, 105],
          p50Ms: 90,
          p95Ms: 105,
          workflowDurationMs: 2_950,
        },
        geometry: {
          viewportWidth: 390,
          viewportHeight: 844,
          x: 12,
          y: 24,
          width: 366,
          height: 44,
          hasHorizontalOverflow: false,
        },
      },
    });
  });

  it.each([
    "username",
    "cookies",
    "adminPassword",
    "sessionToken",
    "hostToken",
    "serviceRoleKey",
    "passwordHash",
    "authorizationHeader",
    "requestBody",
    "responseBody",
    "responseHtml",
  ])("rejects the prohibited key %s before allowlist filtering", (key) => {
    expect(() =>
      sanitizePhase0Evidence({ diagnostics: { ignored: { [key]: "sensitive" } } }),
    ).toThrow(Phase0EvidenceSafetyError);
  });

  it.each([
    ["Bearer", ["eyJhbGciOiJIUzI1NiJ9", "payload", "signature"].join(".")].join(" "),
    ["Cookie", "admin_session=private"].join(": "),
    ["password", "placeholder"].join("="),
    ["sb", "secret", "placeholder"].join("_"),
    ["$2b$12$", "0".repeat(53)].join(""),
    "a".repeat(64),
    ["<!doctype html>", "<html>", "<body>error</body>", "</html>"].join(""),
    JSON.stringify({ ["user" + "name"]: "private-player" }),
  ])("rejects a prohibited value even beneath a non-allowlisted key", (value) => {
    expect(() => sanitizePhase0Evidence({ diagnostics: { ignored: value } })).toThrow(
      Phase0EvidenceSafetyError,
    );
  });

  it("keeps sanitized failure evidence limited to route, status, class, and RSC digest", () => {
    expect(
      sanitizePhase0Evidence({
        failure: {
          route: "/vote",
          status: 500,
          errorClass: "ResponseError",
          rscDigest: "919273645",
          message: "not retained",
          stack: "not retained",
        },
      }),
    ).toEqual({
      failure: {
        route: "/vote",
        status: 500,
        errorClass: "ResponseError",
        rscDigest: "919273645",
      },
    });
  });

  it("supports the focused Playwright diagnostic field vocabulary", () => {
    const payload = {
      earliest: {
        geometry: { x: 1, y: 2, width: 300, height: 199 },
        tagName: "IMG",
        appearance: "auto",
        fontSize: 16,
      },
      loaded: {
        layoutShiftCount: 1,
        layoutShiftValue: 0.012,
      },
      settled: {
        viewport: {
          width: 390,
          height: 844,
          horizontalOverflow: false,
        },
      },
      requests: [{ method: "GET", path: "/results", status: 200, sequence: 4, digest: "123456" }],
      timing: {
        timingMs: 125,
        latenciesMs: [90, 125, 180],
        p50Ms: 125,
        p95Ms: 180,
        totalMs: 395,
        propagationMs: 210,
        skewSeconds: 0.4,
      },
      state: {
        activeCount: 48,
        deadline: "2026-07-13T10:15:30.000Z",
        observed: true,
        collectionSucceeded: true,
        eventIdPrefix: "phase0-",
        eventIdDiffersFromConfigured: true,
      },
    };

    expect(assertSafeDiagnosticEvidence(payload)).toEqual(payload);
  });

  it("supports narrow hosted transition and recovery vocabulary", () => {
    const payload = {
      transitions: {
        beforeReroll: {
          state: {
            observationPhase: "before_reroll",
            freshnessObservedAt: "2026-07-13T10:15:30.000Z",
            draws: [{ drawId: "draw-1", drawVersion: 1, drawStatus: "active" }],
          },
        },
        revealPhases: [{ resultPhase: "set_1_resolved", state: { roundNumber: 1 } }],
      },
      publicResponses: [{ method: "GET", path: "/results", status: 200, sequence: 1 }],
      publicErrors: [{ errorClass: "ResponseError", digest: null }],
      hostRecovery: { controlAfterAging: false, recoverySucceeded: true },
    };

    expect(assertSafeDiagnosticEvidence(payload)).toEqual(payload);
  });

  it("preserves only the explicitly nullable diagnostic observations", () => {
    const payload = {
      state: {
        deadline: null,
        resultId: null,
        resultPhase: null,
        votingStatus: null,
        freshnessGeneration: null,
      },
      failure: { digest: null },
      timing: { skewSeconds: null, stageSeconds: null, phoneSeconds: null },
      earliest: { geometry: [null, { x: 1, y: 2, width: 3, height: 4 }] },
      loaded: { geometry: { x: null, y: null, width: null, height: null } },
    };

    expect(assertSafeDiagnosticEvidence(payload)).toEqual(payload);
    expect(() => assertSafeDiagnosticEvidence({ state: { roundNumber: null } })).toThrow(
      /finite number/,
    );
  });

  it("writes and attaches only the sanitized payload", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "phase0-evidence-"));
    temporaryDirectories.push(outputDirectory);
    const attach = vi.fn(async () => undefined);
    const testInfo = {
      attach,
      outputPath: (...pathSegments: string[]) => join(outputDirectory, ...pathSegments),
    };

    const outputPath = await writeSafeDiagnosticEvidence(testInfo, "diagnostic.json", {
      requests: [{ method: "GET", path: "/stage", status: 200, sequence: 1 }],
      harmlessNote: "must not be serialized",
    });

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      requests: [{ method: "GET", path: "/stage", status: 200, sequence: 1 }],
    });
    expect(attach).toHaveBeenCalledWith("diagnostic.json", {
      path: outputPath,
      contentType: "application/json",
    });
  });

  it("rejects unsafe payloads and path-bearing filenames before writing", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "phase0-evidence-"));
    temporaryDirectories.push(outputDirectory);
    const testInfo = {
      attach: vi.fn(async () => undefined),
      outputPath: (...pathSegments: string[]) => join(outputDirectory, ...pathSegments),
    };

    await expect(
      writeSafeDiagnosticEvidence(testInfo, "unsafe.json", {
        requests: [{ authorization: "Bearer private" }],
      }),
    ).rejects.toThrow(Phase0EvidenceSafetyError);
    await expect(
      writeSafeDiagnosticEvidence(testInfo, "../escape.json", { observed: true }),
    ).rejects.toThrow(/path-free/);
    expect(testInfo.attach).not.toHaveBeenCalled();
  });

  it.each([
    { requests: [{ path: "/vote?player=private-player" }] },
    { requests: [{ httpMethod: "get" }] },
    { state: { votingDeadline: "not-a-timestamp" } },
    { state: { eventIdPrefix: "phase0-full-event-id" } },
    { geometry: { width: Number.NaN } },
  ])("rejects malformed values in allowlisted fields", (input) => {
    expect(() => sanitizePhase0Evidence(input)).toThrow(Phase0EvidenceSafetyError);
  });

  it("rejects circular and non-plain evidence inputs", () => {
    const circular: Record<string, unknown> = {};
    circular.diagnostics = circular;

    expect(() => sanitizePhase0Evidence(circular)).toThrow(/Circular evidence value/);
    expect(() => sanitizePhase0Evidence({ diagnostics: new Date() })).toThrow(
      /Non-plain evidence object/,
    );
  });
});
