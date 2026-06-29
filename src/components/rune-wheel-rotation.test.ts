import { describe, expect, it } from "vitest";
import { getRuneWheelFinalRotation } from "./rune-wheel-rotation";

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

  it("also lands non-12 zero-ballot wheels on the committed winner", () => {
    expect(normalizedPointerAngle(7, 4)).toBeCloseTo(0, 8);
  });

  it("falls back to two full rotations when no winner slot is available", () => {
    expect(getRuneWheelFinalRotation(0, -1)).toBe(720);
    expect(getRuneWheelFinalRotation(12, -1)).toBe(720);
  });
});
