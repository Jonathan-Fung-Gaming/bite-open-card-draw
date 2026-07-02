import { describe, expect, it } from "vitest";
import type { RoundResultSnapshot } from "./result-engine";
import type { RoundBallot } from "@/lib/vote/ballot";
import { buildPrivateBallotCsvFilename, generatePrivateBallotCsv } from "./private-csv";

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

    expect(csv).toContain("round_number,result_id,result_computed_at");
    expect(csv).toContain("selected_set_1_chart_id,selected_set_1_chart_difficulty");
    expect(csv).toContain("set_1_ban_1_chart_id,set_1_ban_1_difficulty");
    expect(csv).toContain("result,now,final,done,done,Alpha,true,true,submitted,submitted,2");
    expect(csv).toContain("S16,static-s16,draw-1,1");
    expect(csv).toContain("S17,static-s17,draw-2,3,Selected Two [S17] <chart-2>,chart-2,S17");
    expect(csv).toContain("true,shared_admin,phone died,true");
    expect(csv).toContain("Selected One [S16] <chart-1>,chart-1,S16");
    expect(csv).toContain("Selected Two [S17] <chart-2>,chart-2,S17");
    expect(csv).toContain("false,,,,true,chart-2|chart-3,chart-2,done");
    expect(csv).toContain("Bravo,true,false");
  });

  it("neutralizes spreadsheet formulas in user-provided and chart-provided cells", () => {
    const formulaResult: RoundResultSnapshot = {
      ...result,
      eligiblePlayers: [
        { id: "p1", startggUsername: "=Alpha" },
        { id: "p2", startggUsername: "+Bravo" },
        { id: "p3", startggUsername: "-Charlie" },
        { id: "p4", startggUsername: "@Delta" },
      ],
      sets: [
        {
          ...result.sets[0],
          rows: [
            {
              ...result.sets[0].rows[0],
              chart: { ...result.sets[0].rows[0].chart, name: "=Selected One" },
            },
          ],
          selectedChart: { ...result.sets[0].selectedChart, name: "=Selected One" },
        },
        {
          ...result.sets[1],
          rows: [
            {
              ...result.sets[1].rows[0],
              chart: { ...result.sets[1].rows[0].chart, name: "+Selected Two" },
            },
          ],
          selectedChart: { ...result.sets[1].selectedChart, name: "+Selected Two" },
        },
      ],
    };
    const formulaBallot = { ...ballot, manualReason: "@phone died" };
    const csv = generatePrivateBallotCsv({ result: formulaResult, ballots: [formulaBallot] });

    expect(csv).toContain("'=Alpha");
    expect(csv).toContain("'+Bravo");
    expect(csv).toContain("'-Charlie");
    expect(csv).toContain("'@Delta");
    expect(csv).toContain("'=Selected One [S16] <chart-1>");
    expect(csv).toContain("'+Selected Two [S17] <chart-2>");
    expect(csv).toContain("'@phone died");
  });

  it("exports original submission time separately from latest revision time", () => {
    const csv = generatePrivateBallotCsv({
      result,
      ballots: [
        {
          ...ballot,
          firstSubmittedAt: "2026-07-02T01:00:00.000Z",
          submittedAt: "2026-07-02T01:03:00.000Z",
          lastRevisionAt: "2026-07-02T01:03:00.000Z",
        },
      ],
    });

    expect(csv).toContain(
      "Alpha,true,true,2026-07-02T01:00:00.000Z,2026-07-02T01:03:00.000Z,2",
    );
  });

  it("exports emergency-added eligible players as not active at round start", () => {
    const csv = generatePrivateBallotCsv({
      result,
      ballots: [ballot],
      roundEligibility: [
        { playerId: "p1", activeAtRoundStart: true },
        { playerId: "p2", activeAtRoundStart: false },
      ],
    });

    expect(csv).toContain("Alpha,true,true");
    expect(csv).toContain("Bravo,false,false");
  });

  it("builds collision-resistant event and round scoped filenames", () => {
    expect(
      buildPrivateBallotCsvFilename({
        eventId: "pump/open stage",
        roundNumber: 4,
        generatedAt: "2026-07-02T01:02:03.004Z",
        nonce: "abc123",
      }),
    ).toBe("pump-open-stage-round-4-private-ballots-2026-07-02T01-02-03-004Z-abc123.csv");
  });
});
