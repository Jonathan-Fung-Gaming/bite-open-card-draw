export type ResultRevealPhase =
  "computed"
  | "set_1_counts"
  | "set_1_resolved"
  | "set_2_counts"
  | "set_2_resolved"
  | "final";

export const RESULT_REVEAL_PHASES: ResultRevealPhase[] = [
  "computed",
  "set_1_counts",
  "set_1_resolved",
  "set_2_counts",
  "set_2_resolved",
  "final",
];

export function resultRevealPhaseRank(phase: ResultRevealPhase | string | null | undefined) {
  const index = RESULT_REVEAL_PHASES.indexOf(phase as ResultRevealPhase);

  return index === -1 ? -1 : index;
}

export function resultRevealPhaseIsBefore(
  left: ResultRevealPhase | string | null | undefined,
  right: ResultRevealPhase | string | null | undefined,
) {
  return resultRevealPhaseRank(left) < resultRevealPhaseRank(right);
}
