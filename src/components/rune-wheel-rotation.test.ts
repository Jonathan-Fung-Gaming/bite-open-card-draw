import { describe, expect, it } from "vitest";
import { getRuneWheelFinalRotation, getRuneWheelRadialImageRotation } from "./rune-wheel-rotation";

function normalizedPointerAngle(slotCount: number, winnerSlotIndex: number) {
  const slotAngle = 360 / slotCount;
  const rotation = getRuneWheelFinalRotation(slotCount, winnerSlotIndex);

  return (winnerSlotIndex * slotAngle + rotation) % 360;
}

describe("rune wheel final rotation", () => {
  it("lands a repeated 12-slot winner under the pointer", () => {
    expect(getRuneWheelFinalRotation(12, 3)).toBe(630);
    expect(normalizedPointerAngle(12, 3)).toBe(0);
    expect(normalizedPointerAngle(12, 11)).toBe(0);
  });

  it("can still align a non-12 wheel if a caller provides one", () => {
    expect(normalizedPointerAngle(7, 4)).toBeCloseTo(0, 8);
  });

  it("falls back to two full rotations when no winner slot is available", () => {
    expect(getRuneWheelFinalRotation(0, -1)).toBe(720);
    expect(getRuneWheelFinalRotation(12, -1)).toBe(720);
  });

  it("rotates each slot image radially so the bottom edge faces the wheel center", () => {
    const rotations = Array.from({ length: 12 }, (_, index) =>
      getRuneWheelRadialImageRotation(12, index),
    );

    expect(rotations.slice(0, 4)).toEqual([0, 30, 60, 90]);
    expect(rotations[11]).toBe(330);
    expect(getRuneWheelRadialImageRotation(0, 0)).toBe(0);
    expect(getRuneWheelRadialImageRotation(12, -1)).toBe(0);
  });
});
