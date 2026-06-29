import { z } from "zod";

const uuidSchema = z.string().uuid();
const roundNumberSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const setOrderSchema = z.union([z.literal(1), z.literal(2)]);
const passwordSchema = z.string().min(1);
const reasonSchema = z.string().trim().min(1);

export const adminLoginInputSchema = z.object({
  password: passwordSchema,
});

export const adminLogoutInputSchema = z.object({
  sessionId: uuidSchema,
});

export const acquireHostLockInputSchema = z.object({
  sessionId: uuidSchema,
  hostToken: z.string().min(16),
});

export const refreshHostLockInputSchema = acquireHostLockInputSchema;
export const releaseHostLockInputSchema = acquireHostLockInputSchema;

export const importChartsInputSchema = z.object({
  sourcePath: z.string().default("data/source/charts.csv"),
});

export const updateChartExclusionInputSchema = z.object({
  chartKey: z.string().trim().min(1),
  excluded: z.boolean(),
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const createOrUpdatePlayerInputSchema = z.object({
  playerId: uuidSchema.optional(),
  startggUsername: z.string().trim().min(1),
  active: z.boolean().default(true),
});

export const setPlayerActiveStatusInputSchema = z.object({
  playerId: uuidSchema,
  active: z.boolean(),
  reason: reasonSchema.optional(),
});

export const addPlayerToCurrentRoundEligibilityInputSchema = z.object({
  playerId: uuidSchema,
  roundNumber: roundNumberSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const drawRoundSetInputSchema = z.object({
  roundNumber: roundNumberSchema,
  setOrder: setOrderSchema,
});

export const rerollOneChartInputSchema = z.object({
  roundNumber: roundNumberSchema,
  setOrder: setOrderSchema,
  drawnChartId: uuidSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const rerollRoundSetInputSchema = z.object({
  roundNumber: roundNumberSchema,
  setOrder: setOrderSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const rerollFullRoundInputSchema = z.object({
  roundNumber: roundNumberSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const openVotingWindowInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const pauseVotingWindowInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const resumeVotingWindowInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const reopenVotingWindowInputSchema = z.object({
  roundNumber: roundNumberSchema,
  durationMinutes: z.number().int().min(1).max(10),
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const submitBallotInputSchema = z.object({
  roundNumber: roundNumberSchema,
  playerId: uuidSchema,
  choices: z
    .array(
      z.object({
        roundSetId: uuidSchema,
        noBans: z.boolean(),
        bannedChartIds: z.array(uuidSchema).max(2),
      }),
    )
    .length(2),
});

export const manualBallotOverrideInputSchema = submitBallotInputSchema.extend({
  adminPassword: passwordSchema,
  reason: reasonSchema,
  replaceExistingBallot: z.boolean(),
});

export const closeVotingWindowInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const resetRoundInputSchema = z.object({
  roundNumber: roundNumberSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const computeResultsInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const commitTiebreakInputSchema = z.object({
  roundNumber: roundNumberSchema,
  roundSetId: uuidSchema,
  candidateChartIds: z.array(uuidSchema).min(2),
});

export const markResultsRevealedInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const advanceResultRevealInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const overrideResultInputSchema = z.object({
  roundNumber: roundNumberSchema,
  setOrder: setOrderSchema,
  chartId: uuidSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const setCurrentRoundInputSchema = z.object({
  roundNumber: roundNumberSchema,
});

export const advanceCurrentRoundInputSchema = z.object({});

export const startRehearsalModeInputSchema = z.object({
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const resetRehearsalModeInputSchema = startRehearsalModeInputSchema;

export const exportPrivateCsvInputSchema = z.object({
  roundNumber: roundNumberSchema.optional(),
});

export const MUTATION_CONTRACTS = {
  adminLogin: adminLoginInputSchema,
  adminLogout: adminLogoutInputSchema,
  acquireHostLock: acquireHostLockInputSchema,
  refreshHostLock: refreshHostLockInputSchema,
  releaseHostLock: releaseHostLockInputSchema,
  importCharts: importChartsInputSchema,
  updateChartExclusion: updateChartExclusionInputSchema,
  createOrUpdatePlayer: createOrUpdatePlayerInputSchema,
  setPlayerActiveStatus: setPlayerActiveStatusInputSchema,
  addPlayerToCurrentRoundEligibility: addPlayerToCurrentRoundEligibilityInputSchema,
  drawRoundSet: drawRoundSetInputSchema,
  rerollOneChart: rerollOneChartInputSchema,
  rerollRoundSet: rerollRoundSetInputSchema,
  rerollFullRound: rerollFullRoundInputSchema,
  openVotingWindow: openVotingWindowInputSchema,
  pauseVotingWindow: pauseVotingWindowInputSchema,
  resumeVotingWindow: resumeVotingWindowInputSchema,
  reopenVotingWindow: reopenVotingWindowInputSchema,
  submitBallot: submitBallotInputSchema,
  manualBallotOverride: manualBallotOverrideInputSchema,
  closeVotingWindow: closeVotingWindowInputSchema,
  resetRound: resetRoundInputSchema,
  computeResults: computeResultsInputSchema,
  commitTiebreak: commitTiebreakInputSchema,
  markResultsRevealed: markResultsRevealedInputSchema,
  advanceResultReveal: advanceResultRevealInputSchema,
  overrideResult: overrideResultInputSchema,
  setCurrentRound: setCurrentRoundInputSchema,
  advanceCurrentRound: advanceCurrentRoundInputSchema,
  startRehearsalMode: startRehearsalModeInputSchema,
  resetRehearsalMode: resetRehearsalModeInputSchema,
  exportPrivateCsv: exportPrivateCsvInputSchema,
} as const;

export type MutationName = keyof typeof MUTATION_CONTRACTS;
export type MutationInput<TName extends MutationName> = z.infer<(typeof MUTATION_CONTRACTS)[TName]>;
