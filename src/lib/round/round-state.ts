export type RoundNumber = 1 | 2 | 3 | 4;

export type RoundStateSnapshot = {
  currentRound: RoundNumber;
  rehearsalMode: boolean;
};

export class RoundStateStore {
  private currentRound: RoundNumber = 1;
  private rehearsalMode = false;

  getSnapshot(): RoundStateSnapshot {
    return {
      currentRound: this.currentRound,
      rehearsalMode: this.rehearsalMode,
    };
  }

  setCurrentRound(roundNumber: RoundNumber) {
    this.currentRound = roundNumber;

    return this.getSnapshot();
  }

  advanceRound() {
    if (this.currentRound >= 4) {
      throw new Error("Round 4 is the final round.");
    }

    this.currentRound = (this.currentRound + 1) as RoundNumber;

    return this.getSnapshot();
  }

  setRehearsalMode(enabled: boolean) {
    this.rehearsalMode = enabled;

    return this.getSnapshot();
  }

  exportSnapshot(): RoundStateSnapshot {
    return this.getSnapshot();
  }

  importSnapshot(snapshot: RoundStateSnapshot) {
    this.currentRound = snapshot.currentRound;
    this.rehearsalMode = snapshot.rehearsalMode;
  }
}
