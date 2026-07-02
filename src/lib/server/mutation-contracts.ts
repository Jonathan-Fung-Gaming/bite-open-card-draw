import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const roundNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export const setOrderSchema = z.union([z.literal(1), z.literal(2)]);
const passwordSchema = z.string().min(1);
const reasonSchema = z.string().trim().min(1);

function coerceIntegerFormValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
  }

  return value;
}

export const roundNumberInputSchema = z.preprocess(coerceIntegerFormValue, roundNumberSchema);
export const setOrderInputSchema = z.preprocess(coerceIntegerFormValue, setOrderSchema);
export const durationMinutesInputSchema = z.preprocess(
  coerceIntegerFormValue,
  z.number().int().min(1).max(10),
);
export const overrideResultTargetInputSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const [setOrderValue, chartIdValue, extraValue] = value.split("|");
    const setOrder = setOrderInputSchema.safeParse(setOrderValue);
    const chartId = uuidSchema.safeParse(chartIdValue);

    if (extraValue !== undefined || !setOrder.success || !chartId.success) {
      context.addIssue({
        code: "custom",
        message: "Result target must include set order and chart id.",
      });

      return z.NEVER;
    }

    return {
      setOrder: setOrder.data,
      chartId: chartId.data,
    };
  });

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
  roundNumber: roundNumberInputSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const drawRoundSetInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  setOrder: setOrderInputSchema,
});

export const rerollOneChartInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  setOrder: setOrderInputSchema,
  drawnChartId: uuidSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const rerollRoundSetInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  setOrder: setOrderInputSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const rerollFullRoundInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const openVotingWindowInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
});

export const pauseVotingWindowInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
});

export const resumeVotingWindowInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
});

export const reopenVotingWindowInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  durationMinutes: durationMinutesInputSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const submitBallotInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  playerId: uuidSchema,
  editTokenHash: z.string().trim().min(1).optional(),
  choices: z
    .array(
      z.object({
        drawId: uuidSchema,
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
  roundNumber: roundNumberInputSchema,
});

export const resetRoundInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const computeResultsInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  adminSessionId: uuidSchema.optional(),
});

export const commitTiebreakInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  drawId: uuidSchema,
  roundSetId: uuidSchema,
  candidateChartIds: z.array(uuidSchema).min(2),
});

export const markResultsRevealedInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
});

export const advanceResultRevealInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
});

export const overrideResultInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
  setOrder: setOrderInputSchema,
  chartId: uuidSchema,
  adminPassword: passwordSchema,
  reason: reasonSchema,
});

export const setCurrentRoundInputSchema = z.object({
  roundNumber: roundNumberInputSchema,
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
