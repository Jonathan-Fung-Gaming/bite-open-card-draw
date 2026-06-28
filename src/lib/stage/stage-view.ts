import type { DrawRecord, DrawStateStore } from "@/lib/draw/draw-state";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";

export type StageSetView = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
};

export type StageRoundView = {
  roundNumber: 1 | 2 | 3 | 4;
  sets: StageSetView[];
  bothSetsDrawn: boolean;
};

export function buildStageRoundView(
  drawStateStore: Pick<DrawStateStore, "getActiveDraw">,
  roundNumber: 1 | 2 | 3 | 4,
): StageRoundView {
  const sets = ROUND_SET_DEFINITIONS.filter((set) => set.roundNumber === roundNumber).map((set) => ({
    set,
    draw: drawStateStore.getActiveDraw(set.roundNumber, set.setOrder),
  }));

  return {
    roundNumber,
    sets,
    bothSetsDrawn: sets.every((set) => set.draw !== null),
  };
}
