import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(pageSource).toContain(
      'enabled={canControl && Boolean(result && result.revealPhase === "final")}',
    );
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
    const filenameBuild = actionsSource.indexOf(
      "const filename = privateCsvFilename",
      finalRevealCheck,
    );
    const successAudit = actionsSource.indexOf('action: "private_csv_export"', filenameBuild);
    const generateCsv = actionsSource.indexOf("generatePrivateBallotCsv({", successAudit);

    expect(exportStart).toBeGreaterThanOrEqual(0);
    expect(hostCheck).toBeGreaterThan(exportStart);
    expect(hostDeniedAudit).toBeGreaterThan(hostCheck);
    expect(finalRevealCheck).toBeGreaterThan(hostDeniedAudit);
    expect(filenameBuild).toBeGreaterThan(finalRevealCheck);
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

  it("blocks snapshot-backed Supabase admin mutations whose normalized RPCs are disabled", () => {
    const actionsSource = readFileSync(
      path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
      "utf8",
    );

    expect(actionsSource).toContain(
      'assertSupabaseTransactionalMutationImplemented("manualBallotOverride")',
    );
    expect(actionsSource).toContain(
      'assertSupabaseTransactionalMutationImplemented("reopenVotingWindow")',
    );
    expect(actionsSource).toContain('assertSupabaseTransactionalMutationImplemented("resetRound")');
  });
});
