import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ACTION_POLICIES,
  ADMIN_ACTION_POLICY_CLASSIFICATIONS,
} from "./action-policy";

const actionsSource = readFileSync(
  path.join(process.cwd(), "src/app/coolguy69/actions.ts"),
  "utf8",
);

function exportedAdminServerActions() {
  return [...actionsSource.matchAll(/^export async function (\w+)/gm)].map(
    (match) => match[1] as string,
  );
}

function getActionBlock(actionName: string) {
  const start = actionsSource.indexOf(`export async function ${actionName}`);
  const next = actionsSource.indexOf("\nexport async function", start + 1);

  expect(start, actionName).toBeGreaterThanOrEqual(0);

  return next === -1 ? actionsSource.slice(start) : actionsSource.slice(start, next);
}

function hasAnySnippet(source: string, snippets: readonly string[]) {
  return snippets.some((snippet) => source.includes(snippet));
}

describe("admin action policy matrix", () => {
  it("classifies every exported admin server action exactly once", () => {
    const exported = exportedAdminServerActions().sort();
    const classified = ADMIN_ACTION_POLICIES.map((policy) => policy.serverAction).sort();

    expect(classified).toEqual(exported);
    expect(new Set(classified).size).toBe(classified.length);
  });

  it("uses only the Phase 0 policy classifications", () => {
    for (const policy of ADMIN_ACTION_POLICIES) {
      expect(ADMIN_ACTION_POLICY_CLASSIFICATIONS).toContain(policy.classification);
    }
  });

  it("proves password-required dangerous actions require password re-entry, reason, and audit", () => {
    const passwordRequired = ADMIN_ACTION_POLICIES.filter(
      (policy) => policy.requiresPasswordReentry,
    );

    expect(passwordRequired.length).toBeGreaterThan(0);

    for (const policy of passwordRequired) {
      const block = getActionBlock(policy.serverAction);

      expect(block, policy.serverAction).toContain("verifyDangerousActionPassword");
      expect(block, policy.serverAction).toContain("getRequiredReason");
      expect(block, policy.serverAction).toContain("dangerous: true");
      expect(policy.classification, policy.serverAction).toBe(
        "password-required dangerous action",
      );
      expect(policy.requiresAuditReason, policy.serverAction).toBe(true);
      expect(policy.dangerousAudit, policy.serverAction).toBe(true);
    }
  });

  it("keeps routine host-only tournament actions active-host gated, audited, and password-free", () => {
    const activeHostGuards = [
      "requireActiveHost",
      "withActiveHostVotingAdminState",
      "withActiveHostResultAdminState",
      "requireActiveHostForNormalizedAction",
      "adminState.hostLockStore.refresh",
    ] as const;
    const hostOnly = ADMIN_ACTION_POLICIES.filter(
      (policy) => policy.classification === "active-host-only tournament action",
    );

    expect(hostOnly.length).toBeGreaterThan(0);

    for (const policy of hostOnly) {
      const block = getActionBlock(policy.serverAction);

      expect(policy.requiresActiveHost, policy.serverAction).toBe(true);
      expect(policy.requiresPasswordReentry, policy.serverAction).toBe(false);
      expect(policy.audited, policy.serverAction).toBe(true);
      expect(hasAnySnippet(block, activeHostGuards), policy.serverAction).toBe(true);
      expect(block, policy.serverAction).toContain("audit(session");
      expect(block, policy.serverAction).not.toContain("verifyDangerousActionPassword");
    }
  });

  it("documents forced host takeover as the only conditional host-lock password case", () => {
    const hostControlPolicy = ADMIN_ACTION_POLICIES.find(
      (policy) => policy.serverAction === "takeHostControlAction",
    );
    const block = getActionBlock("takeHostControlAction");

    expect(hostControlPolicy?.classification).toBe("read-only or sensitive disclosure action");
    expect(hostControlPolicy?.requiresPasswordReentry).toBe(false);
    expect(hostControlPolicy?.conditionalDangerousVariant).toMatchObject({
      when: "forceHostTakeover=true",
      requiresPasswordReentry: true,
      requiresAuditReason: true,
      dangerousAudit: true,
    });
    expect(block).toContain("const reason = force ? getRequiredReason(formData) : null");
    expect(block).toContain("verifyDangerousActionPassword(getAdminPassword(formData))");
    expect(block).toContain("dangerous: result.takeover");
  });
});
