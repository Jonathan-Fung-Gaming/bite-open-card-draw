import "server-only";
import type { z } from "zod";
import { MUTATION_CONTRACTS, type MutationInput, type MutationName } from "./mutation-contracts";

type MutationResult<TData = null> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      code: "invalid_input" | "not_implemented";
      message: string;
      issues?: z.ZodIssue[];
    };

function parseMutationInput<TName extends MutationName>(
  name: TName,
  input: unknown,
): MutationResult<MutationInput<TName>> {
  const parsed = MUTATION_CONTRACTS[name].safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: `Invalid input for ${name}.`,
      issues: parsed.error.issues,
    };
  }

  return {
    ok: true,
    data: parsed.data as MutationInput<TName>,
  };
}

function notImplemented(name: MutationName): MutationResult {
  return {
    ok: false,
    code: "not_implemented",
    message: `${name} is a Phase 2 server-side contract placeholder.`,
  };
}

function mutationPlaceholder<TName extends MutationName>(name: TName, input: unknown): MutationResult {
  const parsed = parseMutationInput(name, input);

  if (!parsed.ok) {
    return parsed;
  }

  return notImplemented(name);
}

export async function adminLogin(input: unknown) {
  return mutationPlaceholder("adminLogin", input);
}

export async function adminLogout(input: unknown) {
  return mutationPlaceholder("adminLogout", input);
}

export async function acquireHostLock(input: unknown) {
  return mutationPlaceholder("acquireHostLock", input);
}

export async function refreshHostLock(input: unknown) {
  return mutationPlaceholder("refreshHostLock", input);
}

export async function releaseHostLock(input: unknown) {
  return mutationPlaceholder("releaseHostLock", input);
}

export async function importCharts(input: unknown) {
  return mutationPlaceholder("importCharts", input);
}

export async function updateChartExclusion(input: unknown) {
  return mutationPlaceholder("updateChartExclusion", input);
}

export async function createOrUpdatePlayer(input: unknown) {
  return mutationPlaceholder("createOrUpdatePlayer", input);
}

export async function setPlayerActiveStatus(input: unknown) {
  return mutationPlaceholder("setPlayerActiveStatus", input);
}

export async function addPlayerToCurrentRoundEligibility(input: unknown) {
  return mutationPlaceholder("addPlayerToCurrentRoundEligibility", input);
}

export async function drawRoundSet(input: unknown) {
  return mutationPlaceholder("drawRoundSet", input);
}

export async function rerollOneChart(input: unknown) {
  return mutationPlaceholder("rerollOneChart", input);
}

export async function rerollRoundSet(input: unknown) {
  return mutationPlaceholder("rerollRoundSet", input);
}

export async function rerollFullRound(input: unknown) {
  return mutationPlaceholder("rerollFullRound", input);
}

export async function openVotingWindow(input: unknown) {
  return mutationPlaceholder("openVotingWindow", input);
}

export async function pauseVotingWindow(input: unknown) {
  return mutationPlaceholder("pauseVotingWindow", input);
}

export async function resumeVotingWindow(input: unknown) {
  return mutationPlaceholder("resumeVotingWindow", input);
}

export async function submitBallot(input: unknown) {
  return mutationPlaceholder("submitBallot", input);
}

export async function manualBallotOverride(input: unknown) {
  return mutationPlaceholder("manualBallotOverride", input);
}

export async function closeVotingWindow(input: unknown) {
  return mutationPlaceholder("closeVotingWindow", input);
}

export async function computeResults(input: unknown) {
  return mutationPlaceholder("computeResults", input);
}

export async function commitTiebreak(input: unknown) {
  return mutationPlaceholder("commitTiebreak", input);
}

export async function markResultsRevealed(input: unknown) {
  return mutationPlaceholder("markResultsRevealed", input);
}

export async function exportPrivateCsv(input: unknown) {
  return mutationPlaceholder("exportPrivateCsv", input);
}
