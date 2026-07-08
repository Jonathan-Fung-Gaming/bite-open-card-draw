export function getRuneWheelFinalRotation(slotCount: number, winnerSlotIndex: number) {
  if (slotCount <= 0 || winnerSlotIndex < 0) {
    return 720;
  }

  return 720 - winnerSlotIndex * (360 / slotCount);
}

export function getRuneWheelRadialImageRotation(slotCount: number, slotIndex: number) {
  if (slotCount <= 0 || slotIndex < 0) {
    return 0;
  }

  return slotIndex * (360 / slotCount);
}
