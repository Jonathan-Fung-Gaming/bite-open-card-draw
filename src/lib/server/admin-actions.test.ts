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

    expect(actionsSource).toContain('action: released ? "host_lock_release" : "host_lock_release_noop"');
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
    expect(pageSource).not.toContain('<select\n                id="roundNumber"\n                name="roundNumber"');
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
    expect(pageSource).toContain("enabled={canControl && Boolean(result && result.revealPhase === \"final\")}");
    expect(pageSource).toContain("Take host control to download the private ballot CSV.");
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
