export type ChartType = "S" | "D";

export type RoundSetDefinition = {
  roundNumber: 1 | 2 | 3 | 4;
  setOrder: 1 | 2;
  chartType: ChartType;
  chartLevel: 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;
  displayLabel: "S16" | "S17" | "S18" | "S19" | "S20" | "S21" | "S22" | "D23";
  drawCount: 7;
  maxBans: 2;
};

export type PlaceholderChart = {
  id: string;
  title: string;
  artist: string;
  difficulty: RoundSetDefinition["displayLabel"];
  label: string;
};

export const REQUIRED_ROUTES = [
  "/stage",
  "/room",
  "/vote",
  "/charts",
  "/results",
  "/coolguy69",
] as const;

export const ROUND_SET_DEFINITIONS: readonly RoundSetDefinition[] = [
  {
    roundNumber: 1,
    setOrder: 1,
    chartType: "S",
    chartLevel: 16,
    displayLabel: "S16",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 1,
    setOrder: 2,
    chartType: "S",
    chartLevel: 17,
    displayLabel: "S17",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 2,
    setOrder: 1,
    chartType: "S",
    chartLevel: 18,
    displayLabel: "S18",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 2,
    setOrder: 2,
    chartType: "S",
    chartLevel: 19,
    displayLabel: "S19",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 3,
    setOrder: 1,
    chartType: "S",
    chartLevel: 20,
    displayLabel: "S20",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 3,
    setOrder: 2,
    chartType: "S",
    chartLevel: 21,
    displayLabel: "S21",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 4,
    setOrder: 1,
    chartType: "S",
    chartLevel: 22,
    displayLabel: "S22",
    drawCount: 7,
    maxBans: 2,
  },
  {
    roundNumber: 4,
    setOrder: 2,
    chartType: "D",
    chartLevel: 23,
    displayLabel: "D23",
    drawCount: 7,
    maxBans: 2,
  },
];

export const SET_COMPLETION_OPTIONS = ["1 or 2 chart bans", "No bans for this set"] as const;

export const PLACEHOLDER_PLAYERS = [
  "Ari",
  "Bex",
  "Cipher",
  "Delta",
  "Echo",
  "Flux",
] as const;

export const PLACEHOLDER_CHARTS: readonly PlaceholderChart[] = [
  {
    id: "phase-1-s16-1",
    title: "Furnace Signal",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-2",
    title: "Iron Oath",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-3",
    title: "Ash Relay",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-4",
    title: "Molten Line",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-5",
    title: "Black Gear",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-6",
    title: "Rune Gate",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s16-7",
    title: "Final Ember",
    artist: "Open Stage Crew",
    difficulty: "S16",
    label: "BITE",
  },
  {
    id: "phase-1-s17-1",
    title: "Steel Vector",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-2",
    title: "Pressure Room",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-3",
    title: "Lockstep Heat",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-4",
    title: "Signal Chain",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-5",
    title: "Red Terminal",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-6",
    title: "Bolt Chamber",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
  {
    id: "phase-1-s17-7",
    title: "Stage Breaker",
    artist: "Open Stage Crew",
    difficulty: "S17",
    label: "BITE",
  },
];

export function getSetsForRound(roundNumber: RoundSetDefinition["roundNumber"]) {
  return ROUND_SET_DEFINITIONS.filter((set) => set.roundNumber === roundNumber);
}

export function getPlaceholderChartsForSet(displayLabel: RoundSetDefinition["displayLabel"]) {
  const charts = PLACEHOLDER_CHARTS.filter((chart) => chart.difficulty === displayLabel);

  return charts.length > 0 ? charts : PLACEHOLDER_CHARTS.slice(0, 7);
}
