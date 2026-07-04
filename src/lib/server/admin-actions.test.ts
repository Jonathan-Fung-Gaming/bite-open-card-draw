import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MUTATION_CONTRACTS, type MutationName } from "./mutation-contracts";

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";
const UUID_C = "00000000-0000-4000-8000-000000000003";
const UUID_D = "00000000-0000-4000-8000-000000000004";

function getActionBlock(source: string, actionName: string) {
  const start = source.indexOf(`export async function ${actionName}`);
  const next = source.indexOf("\nexport async function", start + 1);

  expect(start).toBeGreaterThanOrEqual(0);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("admin action production safeguards", () => {
  it("requires password and reason for forced host takeover", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/page.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(actionsSource).toContain("const reason = force ? getRequiredReason(formData) : null");
    expect(actionsSource).toContain("verifyDangerousActionPassword(getAdminPassword(formData))");
    expect(actionsSource).toContain('action: result.takeover ? "host_lock_takeover"');
    expect(actionsSource).toContain("reason,");
    expect(pageSource).toContain('name="forceHostTakeover" value="true"');
    expect(pageSource).toContain('passwordId="force-host-takeover-password"');
    expect(pageSource).toContain('name="reason"');
  });

  it("audits non-host release-host attempts as no-op outcomes", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );

    expect(actionsSource).toContain(
      'action: released ? "host_lock_release" : "host_lock_release_noop"',
    );
    expect(actionsSource).toContain(
      "Ignored release host control request because this session is not the active host.",
    );
    expect(actionsSource).toContain("releaseOutcome");
  });

  it("releases host lock before logout clearing and exposes inactivity cleanup", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const inactivitySource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/AdminInactivityTimer.tsx"),
      "utf8",
    );
    const logoutBlock = getActionBlock(actionsSource, "adminLogoutAction");
    const expireBlock = getActionBlock(actionsSource, "expireAdminSessionAction");

    expect(logoutBlock.indexOf("await bestEffortReleaseHostLockForCurrentCookies();")).toBeLessThan(
      logoutBlock.indexOf("await clearAdminCookies();"),
    );
    expect(expireBlock).toContain(
      "bestEffortReleaseHostLockForCurrentCookies({ allowExpiredSession: true })",
    );
    expect(inactivitySource).toContain("expireAdminSessionAction");
  });

  it("persists stage final reveal before public route revalidation", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const block = getActionBlock(actionsSource, "advanceResultRevealAction");
    const persistIndex = block.indexOf("await persistTournamentState();");
    const revalidateIndex = block.indexOf("revalidateTournamentViews(revalidatePath)");

    expect(block).toContain('if (result.revealPhase === "final")');
    expect(block).toContain("holdFinalResultsForStageCompletion(roundNumber)");
    expect(persistIndex).toBeGreaterThanOrEqual(0);
    expect(revalidateIndex).toBeGreaterThanOrEqual(0);
    expect(persistIndex).toBeLessThan(revalidateIndex);
  });

  it("persists explicit public result release before route revalidation", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const block = getActionBlock(actionsSource, "releaseFinalResultsAction");
    const persistIndex = block.indexOf("await persistTournamentState();");
    const revalidateIndex = block.indexOf("revalidateTournamentViews(revalidatePath)");

    expect(block).toContain('result.revealPhase !== "final"');
    expect(block).toContain("releaseFinalResultsToPublic(roundNumber, result)");
    expect(actionsSource).toContain('setResultsPhase(roundNumber, "results_revealed")');
    expect(persistIndex).toBeGreaterThanOrEqual(0);
    expect(revalidateIndex).toBeGreaterThanOrEqual(0);
    expect(persistIndex).toBeLessThan(revalidateIndex);
  });

  it("binds emergency inactive-player eligibility to the authoritative current round", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/page.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(actionsSource).toContain(
      "const roundNumber = adminState.roundStateStore.getSnapshot().currentRound",
    );
    expect(actionsSource).toContain("Inactive players can only be added to the current round.");
    expect(pageSource).toContain('name="roundNumber" value={currentRoundNumber}');
    expect(pageSource).not.toContain(
      '<select\n                id="roundNumber"\n                name="roundNumber"',
    );
  });

  it("guards rehearsal controls by deployment policy", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/page.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(actionsSource).toContain("requireRehearsalControlsForAction");
    expect(actionsSource).toContain("rehearsal_control_denied");
    expect(pageSource).toContain("deploymentSafety.rehearsalAdminControlsAllowed ? (");
    expect(pageSource).toContain("Rehearsal reset controls unavailable");
    expect(pageSource).not.toContain("disposable in-memory data");
  });

  it("requires active host control and audits private CSV exports", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/page.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(actionsSource).toContain("private_csv_export_denied");
    expect(actionsSource).toContain("private_csv_export");
    expect(actionsSource).toContain("Active host control is required to download the private CSV.");
    expect(actionsSource).toContain("privateCsvFilename(roundNumber, nowMs)");
    expect(pageSource).toContain("enabled={canControl && finalResultsReleased}");
    expect(pageSource).toContain("Take host control to download the private ballot CSV.");
  });

  it("gates private CSV generation behind host and final-reveal checks before auditing content", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const exportStart = actionsSource.indexOf("export async function downloadPrivateCsvAction");
    const hostCheck = actionsSource.indexOf("adminState.hostLockStore.refresh", exportStart);
    const hostDeniedAudit = actionsSource.indexOf('action: "private_csv_export_denied"', hostCheck);
    const finalRevealCheck = actionsSource.indexOf(
      'result.revealPhase !== "final"',
      hostDeniedAudit,
    );
    const publicReleaseCheck = actionsSource.indexOf(
      'roundSnapshot.status !== "results_revealed"',
      finalRevealCheck,
    );
    const filenameBuild = actionsSource.indexOf(
      "const filename = privateCsvFilename",
      publicReleaseCheck,
    );
    const successAudit = actionsSource.indexOf('action: "private_csv_export"', filenameBuild);
    const generateCsv = actionsSource.indexOf("generatePrivateBallotCsv({", successAudit);

    expect(exportStart).toBeGreaterThanOrEqual(0);
    expect(hostCheck).toBeGreaterThan(exportStart);
    expect(hostDeniedAudit).toBeGreaterThan(hostCheck);
    expect(finalRevealCheck).toBeGreaterThan(hostDeniedAudit);
    expect(publicReleaseCheck).toBeGreaterThan(finalRevealCheck);
    expect(filenameBuild).toBeGreaterThan(publicReleaseCheck);
    expect(successAudit).toBeGreaterThan(filenameBuild);
    expect(generateCsv).toBeGreaterThan(successAudit);
    expect(actionsSource).toContain("roundEligibility,");
    expect(actionsSource).toContain("ballotCount: ballots.length");
    expect(actionsSource).toContain("tournamentChanging: false");
  });

  it("keeps private CSV auto-download retryable until a download succeeds", () => {
    const privateCsvDownloadSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/PrivateCsvDownload.tsx"),
      "utf8",
    );

    const attemptedBeforeDownload = privateCsvDownloadSource.indexOf(
      "autoAttemptedKeyRef.current = autoDownloadKey",
    );
    const successCallback = privateCsvDownloadSource.indexOf("onSuccess?.()");
    const autoDownloadCall = privateCsvDownloadSource.indexOf(
      'startDownload(() => window.localStorage.setItem(storageKey, "done"))',
    );
    const markDone = privateCsvDownloadSource.indexOf(
      'window.localStorage.setItem(storageKey, "done")',
    );

    expect(privateCsvDownloadSource).toContain("Download private ballot CSV");
    expect(privateCsvDownloadSource).toContain("onClick={() => startDownload()}");
    expect(privateCsvDownloadSource).toContain(
      "Refresh or use the manual download button to retry.",
    );
    expect(attemptedBeforeDownload).toBeGreaterThanOrEqual(0);
    expect(successCallback).toBeGreaterThanOrEqual(0);
    expect(autoDownloadCall).toBeGreaterThan(attemptedBeforeDownload);
    expect(markDone).toBeGreaterThan(attemptedBeforeDownload);
  });

  it("invalidates unrevealed computed local results only after manual ballot validation succeeds", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const manualStart = actionsSource.indexOf("export async function manualBallotAction");
    const submitBallot = actionsSource.indexOf(
      "const ballot = adminState.ballotStore.submit",
      manualStart,
    );
    const clearResult = actionsSource.indexOf(
      "adminState.resultStore.clearRoundResult(roundNumber)",
      submitBallot,
    );
    const returnToClosed = actionsSource.indexOf(
      "adminState.votingWindowStore.returnToClosedForRecompute(roundNumber, nowMs)",
      clearResult,
    );
    const auditInvalidation = actionsSource.indexOf(
      'invalidatedComputedResult: result?.revealPhase === "computed"',
      returnToClosed,
    );

    expect(manualStart).toBeGreaterThanOrEqual(0);
    expect(submitBallot).toBeGreaterThan(manualStart);
    expect(clearResult).toBeGreaterThan(submitBallot);
    expect(returnToClosed).toBeGreaterThan(clearResult);
    expect(auditInvalidation).toBeGreaterThan(returnToClosed);
    expect(actionsSource).toContain(
      "Manual ballots are allowed before result reveal starts. Use result correction after reveal begins.",
    );
  });

  it("requires password, reason, and computed-result invalidation for emergency reopen", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const reopenStart = actionsSource.indexOf("export async function reopenVotingAction");
    const reopenSource = actionsSource.slice(reopenStart);

    expect(reopenSource).toContain(
      'assertSupabaseTransactionalMutationImplemented("reopenVotingWindow")',
    );
    expect(reopenSource).toContain(
      "await verifyDangerousActionPassword(getAdminPassword(formData))",
    );
    expect(reopenSource).toContain("const reason = getRequiredReason(formData)");
    expect(reopenSource).toContain("reopenNormalizedVotingWindow({");
    expect(reopenSource).toContain('result && result.revealPhase !== "computed"');
    expect(reopenSource).toContain("adminState.resultStore.clearRoundResult(roundNumber)");
    expect(reopenSource).toContain(
      "adminState.votingWindowStore.returnToClosedForRecompute(roundNumber, nowMs)",
    );
    expect(reopenSource).toContain(
      'adminState.ballotStore.setPhoneStatus(roundNumber, { phase: "voting_open" })',
    );
    expect(reopenSource).toContain('action: "emergency_reopen_voting"');
    expect(reopenSource).toContain('invalidatedComputedResult: result?.revealPhase === "computed"');
  });

  it("renders dangerous summaries before passwords and requires reasons for manual/reopen flows", () => {
    const dialogSource = readFileSync(
      path.join(process.cwd(), "src/components/DangerousActionDialog.tsx"),
      "utf8",
    );
    const pageSource = readFileSync(path.join(process.cwd(), "src/app/coolguy69/page.tsx"), "utf8");
    const manualBallotSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/ManualBallotForm.tsx"),
      "utf8",
    );

    expect(dialogSource.indexOf('data-testid="dangerous-action-summary"')).toBeLessThan(
      dialogSource.indexOf('name="adminPassword"'),
    );
    expect(dialogSource).toContain("You are about to {action}.");
    expect(dialogSource).toContain("This will {consequence}.");
    expect(pageSource).toContain(
      'consequence="invalidate any computed unrevealed result and allow ballot edits for the chosen duration"',
    );
    expect(pageSource).toContain('passwordId="reopen-voting-password"');
    expect(pageSource).toContain('{ label: "Duration", fieldName: "durationMinutes" }');
    expect(manualBallotSource).toContain(
      "? `You are about to manually replace a ballot for ${selectedUsername}.`",
    );
    expect(manualBallotSource).toContain(
      "This will save a server-side ballot for the selected eligible player and may change the",
    );
    expect(manualBallotSource).toContain("Confirm replacement below before saving.");
    expect(manualBallotSource).toContain('name="reason"');
    expect(manualBallotSource).toContain('name="adminPassword"');
  });

  it("covers the product dangerous-action matrix with contracts, summaries, password re-entry, reasons, and audits", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const pageSource = readFileSync(path.join(process.cwd(), "src/app/coolguy69/page.tsx"), "utf8");
    const liveCountsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/AdminLiveCountsDisclosure.tsx"),
      "utf8",
    );
    const manualBallotSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/ManualBallotForm.tsx"),
      "utf8",
    );
    const visibleAdminSource = `${pageSource}\n${manualBallotSource}`;
    const ballotChoices = [
      {
        drawId: UUID_B,
        roundSetId: UUID_C,
        noBans: true,
        bannedChartIds: [],
      },
      {
        drawId: UUID_C,
        roundSetId: UUID_D,
        noBans: true,
        bannedChartIds: [],
      },
    ];
    const dangerousActions: Array<{
      productRule: string;
      contractName: MutationName;
      validInput: Record<string, unknown>;
      serverActionName: string;
      auditAction: string;
      visibleSummarySnippets: string[];
      guardSnippets?: string[];
    }> = [
      {
        productRule: "replace one chart",
        contractName: "rerollOneChart",
        validInput: {
          roundNumber: 1,
          setOrder: 1,
          drawnChartId: UUID_A,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "rerollOneChartAction",
        auditAction: 'action: "reroll_one_chart"',
        visibleSummarySnippets: [
          "Confirm Chart Reroll",
          "replace only this chart in the active draw",
          "invalidate any submitted ballots",
        ],
        guardSnippets: ["invalidateRoundVotingForReroll"],
      },
      {
        productRule: "reroll one chart set",
        contractName: "rerollRoundSet",
        validInput: {
          roundNumber: 1,
          setOrder: 1,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "rerollRoundSetAction",
        auditAction: 'action: "reroll_round_set"',
        visibleSummarySnippets: [
          "Confirm Set Reroll",
          "replace all currently drawn charts for this set",
          "voting window",
        ],
        guardSnippets: ["invalidateRoundVotingForReroll"],
      },
      {
        productRule: "reroll a full round",
        contractName: "rerollFullRound",
        validInput: {
          roundNumber: 1,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "rerollFullRoundAction",
        auditAction: 'action: "reroll_full_round"',
        visibleSummarySnippets: [
          'action="reroll a full round"',
          "replace both currently drawn sets",
          "Confirm Round Reroll",
        ],
        guardSnippets: ["invalidateRoundVotingForReroll"],
      },
      {
        productRule: "reopen voting",
        contractName: "reopenVotingWindow",
        validInput: {
          roundNumber: 1,
          durationMinutes: 3,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "reopenVotingAction",
        auditAction: 'action: "emergency_reopen_voting"',
        visibleSummarySnippets: [
          "reopen Round",
          "invalidate any computed unrevealed result",
          "allow ballot edits for the chosen duration",
        ],
        guardSnippets: [
          'assertSupabaseTransactionalMutationImplemented("reopenVotingWindow")',
          'result && result.revealPhase !== "computed"',
        ],
      },
      {
        productRule: "manually enter a ballot",
        contractName: "manualBallotOverride",
        validInput: {
          roundNumber: 1,
          playerId: UUID_A,
          choices: ballotChoices,
          replaceExistingBallot: false,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "manualBallotAction",
        auditAction: 'action: "manual_ballot"',
        visibleSummarySnippets: [
          "You are about to manually enter a ballot.",
          "may change the",
          "round result",
        ],
        guardSnippets: [
          'assertSupabaseTransactionalMutationImplemented("manualBallotOverride")',
          "canAcceptManualBallot",
        ],
      },
      {
        productRule: "overwrite an existing ballot",
        contractName: "manualBallotOverride",
        validInput: {
          roundNumber: 1,
          playerId: UUID_A,
          choices: ballotChoices,
          replaceExistingBallot: true,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "manualBallotAction",
        auditAction: 'action: "manual_ballot"',
        visibleSummarySnippets: [
          "manually replace a ballot for",
          "Confirm replacement below before saving.",
          "Replace existing ballot for",
        ],
        guardSnippets: [
          "existing && !replaceExisting",
          "replacedExistingBallot: Boolean(existing)",
        ],
      },
      {
        productRule: "add inactive player to current round",
        contractName: "addPlayerToCurrentRoundEligibility",
        validInput: {
          roundNumber: 1,
          playerId: UUID_A,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "addInactivePlayerToCurrentRoundAction",
        auditAction: 'action: "current_round_eligibility_add"',
        visibleSummarySnippets: [
          "add an inactive player to current round eligibility",
          "make that player eligible for the selected current round",
          "Audit reason",
        ],
        guardSnippets: [
          "Inactive players can only be added to the current round.",
          "isCurrentRoundEligibilityChangeAllowed",
        ],
      },
      {
        productRule: "override a result",
        contractName: "overrideResult",
        validInput: {
          roundNumber: 1,
          setOrder: 1,
          chartId: UUID_A,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "overrideResultAction",
        auditAction: 'action: "result_correction_override"',
        visibleSummarySnippets: [
          "override a Round",
          "change the committed selected chart",
          "Override Result",
        ],
        guardSnippets: [
          "Results must be computed before a result correction.",
          "assertNoFutureSelectedSongConflicts",
        ],
      },
      {
        productRule: "reset a round",
        contractName: "resetRound",
        validInput: {
          roundNumber: 1,
          adminPassword: "password",
          reason: "audit reason",
        },
        serverActionName: "resetRoundAction",
        auditAction: 'action: "reset_round"',
        visibleSummarySnippets: [
          "reset a round",
          "clear that round's draws, ballots, voting window, result snapshot, and reveal state",
          "Reset Round",
        ],
        guardSnippets: ['assertSupabaseTransactionalMutationImplemented("resetRound")'],
      },
    ];

    for (const row of dangerousActions) {
      const parsed = MUTATION_CONTRACTS[row.contractName].safeParse(row.validInput);
      const missingPassword = MUTATION_CONTRACTS[row.contractName].safeParse({
        ...row.validInput,
        adminPassword: "",
      });
      const missingReason = MUTATION_CONTRACTS[row.contractName].safeParse({
        ...row.validInput,
        reason: "",
      });
      const block = getActionBlock(actionsSource, row.serverActionName);

      expect(parsed.success, row.productRule).toBe(true);
      expect(missingPassword.success, row.productRule).toBe(false);
      expect(missingReason.success, row.productRule).toBe(false);
      expect(block, row.productRule).toContain(
        "verifyDangerousActionPassword(getAdminPassword(formData))",
      );
      expect(block, row.productRule).toContain("const reason = getRequiredReason(formData)");
      expect(block, row.productRule).toContain(row.auditAction);
      expect(block, row.productRule).toContain("dangerous: true");

      for (const snippet of row.guardSnippets ?? []) {
        expect(block, `${row.productRule}: ${snippet}`).toContain(snippet);
      }

      for (const snippet of row.visibleSummarySnippets) {
        expect(visibleAdminSource, `${row.productRule}: ${snippet}`).toContain(snippet);
      }
    }

    const liveCountsActionBlock = getActionBlock(actionsSource, "getAdminLiveCountsAction");

    expect(pageSource).toContain("AdminLiveCountsDisclosure");
    expect(pageSource).not.toContain("buildLiveCountRows");
    expect(pageSource).not.toContain("liveCountRows.map");
    expect(pageSource).not.toContain("row.banCount");
    expect(liveCountsSource).toContain("Show live counts");
    expect(liveCountsSource).toContain("warning does not require another");
    expect(liveCountsSource).not.toContain('name="adminPassword"');
    expect(liveCountsActionBlock).toContain("requireAdminSession");
    expect(liveCountsActionBlock).toContain("buildAdminLiveCountRows");
    expect(liveCountsActionBlock).not.toContain("verifyDangerousActionPassword");
  });

  it("records stable chart display metadata for exclusion audits", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );

    expect(actionsSource).toContain(
      'action: excluded ? "chart_exclusion_add" : "chart_exclusion_remove"',
    );
    expect(actionsSource).toContain("chartId: before.id");
    expect(actionsSource).toContain("chartName: before.name");
    expect(actionsSource).toContain("chartNameKr: before.nameKr");
    expect(actionsSource).toContain("artist: before.artist");
    expect(actionsSource).toContain("label: before.label");
    expect(actionsSource).toContain("chartType: before.chartType");
    expect(actionsSource).toContain("level: before.level");
    expect(actionsSource).toContain("songKey: before.songKey");
    expect(actionsSource).toContain("sourceBgImg: before.sourceBgImg");
    expect(actionsSource).toContain("sourceRowNumber: before.sourceRowNumber");
  });

  it("requires an audit reason for dangerous debug snapshot exports", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const debugSnapshotSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/_components/DebugSnapshotDownload.tsx"),
      "utf8",
    );

    expect(actionsSource).toContain("const reason = getRequiredReason(formData)");
    expect(actionsSource).toContain('action: "debug_snapshot_export"');
    expect(actionsSource).toContain("reason,");
    expect(debugSnapshotSource).toContain('name="reason"');
    expect(debugSnapshotSource).toContain('placeholder="Audit reason"');
  });

  it("uses shared mutation contracts for critical scalar parsing", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );

    expect(actionsSource).toContain("roundNumberInputSchema.parse");
    expect(actionsSource).toContain("setOrderInputSchema.parse");
    expect(actionsSource).toContain("durationMinutesInputSchema.parse");
    expect(actionsSource).toContain("overrideResultTargetInputSchema.parse");
    expect(actionsSource).not.toContain('Number(getString(formData, "setOrder"))');
    expect(actionsSource).not.toContain('Number(getString(formData, "durationMinutes"))');
    expect(actionsSource).not.toContain('split("|")');
  });

  it("routes implemented Supabase emergency workflows through normalized RPCs", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );
    const wrapperSource = readFileSync(
      path.join(process.cwd(), "src/lib/server/normalized-admin-workflows.ts"),
      "utf8",
    );
    const workflows = [
      {
        actionName: "manualBallotAction",
        wrapperCall: "submitNormalizedManualBallotOverride({",
        rpcName: '"manualBallotOverride"',
      },
      {
        actionName: "reopenVotingAction",
        wrapperCall: "reopenNormalizedVotingWindow({",
        rpcName: '"reopenVotingWindow"',
      },
      {
        actionName: "resetRoundAction",
        wrapperCall: "resetNormalizedRound({",
        rpcName: '"resetRound"',
      },
    ];

    for (const workflow of workflows) {
      const block = getActionBlock(actionsSource, workflow.actionName);
      const supabaseBranch = block.indexOf('getTournamentStateBackend() === "supabase"');
      const passwordCheck = block.indexOf(
        "await verifyDangerousActionPassword(getAdminPassword(formData))",
        supabaseBranch,
      );
      const wrapperCall = block.indexOf(workflow.wrapperCall, passwordCheck);
      const revalidate = block.indexOf("revalidateTournamentViews(revalidatePath)", wrapperCall);
      const branchReturn = block.indexOf("return;", revalidate);
      const snapshotPersist = block.indexOf("await persistTournamentState();");

      expect(supabaseBranch, workflow.actionName).toBeGreaterThanOrEqual(0);
      expect(passwordCheck, workflow.actionName).toBeGreaterThan(supabaseBranch);
      expect(wrapperCall, workflow.actionName).toBeGreaterThan(passwordCheck);
      expect(revalidate, workflow.actionName).toBeGreaterThan(wrapperCall);
      expect(branchReturn, workflow.actionName).toBeGreaterThan(revalidate);
      expect(snapshotPersist, workflow.actionName).toBeGreaterThan(branchReturn);
      expect(wrapperSource, workflow.actionName).toContain(
        `executeNormalizedTransactionalMutation(${workflow.rpcName}`,
      );
    }

    expect(wrapperSource).not.toContain("adminPassword");
  });
});
