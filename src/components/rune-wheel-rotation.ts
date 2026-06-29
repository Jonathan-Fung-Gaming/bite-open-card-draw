export function getRuneWheelFinalRotation(slotCount: number, winnerSlotIndex: number) {
  if (slotCount <= 0 || winnerSlotIndex < 0) {
    return 720;
  }

  return 720 - winnerSlotIndex * (360 / slotCount);
}
