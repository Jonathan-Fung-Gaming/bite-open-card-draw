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
});
