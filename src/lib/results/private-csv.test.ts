import { describe, expect, it } from "vitest";
import type { RoundResultSnapshot } from "./result-engine";
import type { RoundBallot } from "@/lib/vote/ballot";
import { generatePrivateBallotCsv } from "./private-csv";

const result: RoundResultSnapshot = {
  id: "result",
  roundNumber: 1,
  computedAt: "now",
  eligiblePlayers: [
    { id: "p1", startggUsername: "Alpha" },
    { id: "p2", startggUsername: "Bravo" },
  ],
  revealPhase: "final",
  revealPhaseStartedAt: "done",
  finalRevealedAt: "done",
  sets: [
    {
      drawId: "draw-1",
      drawVersion: 1,
      roundSetId: "static-s16",
      setOrder: 1,
      displayLabel: "S16",
      rows: [
        {
          chart: {
            id: "chart-1",
            name: "Selected One",
            artist: "Artist",
            displayDifficulty: "S16",
            songKey: "song-1",
            chartKey: "chart-1",
            sourceBgImg: "",
            localImagePath: "/chart-images/fallback-card.svg",
          },
          banCount: 0,
          selected: true,
          tiedForFewest: true,
        },
      ],
      maxBanCount: 0,
      leastBanCount: 0,
      selectedChart: {
        id: "chart-1",
        name: "Selected One",
        artist: "Artist",
        displayDifficulty: "S16",
        songKey: "song-1",
        chartKey: "chart-1",
        sourceBgImg: "",
        localImagePath: "/chart-images/fallback-card.svg",
      },
      tiebreakUsed: false,
      tiebreakCandidateIds: [],
      tiebreakWinnerChartId: null,
      wheelSlots: [],
      wheelSupported: false,
      winnerRevealStartedAt: null,
    },
    {
      drawId: "draw-2",
      drawVersion: 3,
      roundSetId: "static-s17",
      setOrder: 2,
      displayLabel: "S17",
      rows: [
        {
          chart: {
            id: "chart-2",
            name: "Selected Two",
            artist: "Artist",
            displayDifficulty: "S17",
            songKey: "song-2",
            chartKey: "chart-2",
            sourceBgImg: "",
            localImagePath: "/chart-images/fallback-card.svg",
          },
          banCount: 0,
          selected: true,
          tiedForFewest: true,
        },
      ],
      maxBanCount: 0,
      leastBanCount: 0,
      selectedChart: {
        id: "chart-2",
        name: "Selected Two",
        artist: "Artist",
        displayDifficulty: "S17",
        songKey: "song-2",
        chartKey: "chart-2",
        sourceBgImg: "",
        localImagePath: "/chart-images/fallback-card.svg",
      },
      tiebreakUsed: true,
      tiebreakCandidateIds: ["chart-2", "chart-3"],
      tiebreakWinnerChartId: "chart-2",
      wheelSlots: [],
      wheelSupported: false,
      winnerRevealStartedAt: "done",
    },
  ],
};

const ballot: RoundBallot = {
  id: "ballot",
  roundNumber: 1,
  playerId: "p1",
  playerStartggUsername: "Alpha",
  choices: [
    {
      drawId: "draw-1",
      roundSetId: "static-s16",
      displayLabel: "S16",
      noBans: true,
      bannedChartIds: [],
    },
    {
      drawId: "draw-2",
      roundSetId: "static-s17",
      displayLabel: "S17",
      noBans: false,
      bannedChartIds: ["chart-2"],
    },
  ],
  submittedAt: "submitted",
  revision: 2,
  source: "manual_admin",
  manualReason: "phone died",
  manualOverride: true,
  replacedExistingBallot: true,
};

describe("private CSV export", () => {
  it("includes player ballots, manual overrides, selected charts, and tiebreak flags", () => {
    const csv = generatePrivateBallotCsv({ result, ballots: [ballot] });

    expect(csv).toContain("round_number,player_startgg_username");
    expect(csv).toContain("Alpha,true,true,submitted,submitted");
    expect(csv).toContain("S16,draw-1,1");
    expect(csv).toContain("S17,draw-2,3,Selected Two");
    expect(csv).toContain("true,shared_admin,phone died,true,Selected One,Selected Two,false,true");
    expect(csv).toContain("Bravo,true,false");
  });
});
