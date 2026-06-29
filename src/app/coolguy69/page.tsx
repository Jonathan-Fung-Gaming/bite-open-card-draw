import { AdminLayout, DangerousActionDialog, HostLockBadge, TournamentLogo } from "@/components";
import { buildPoolCounts } from "@/lib/charts/importer";
import { REQUIRED_CHART_POOLS, type NormalizedChart } from "@/lib/charts/types";
import { adminState } from "@/lib/server/admin-state";
import { getAdminSessionFromCookies } from "@/lib/server/admin-auth";
import { hydrateTournamentState } from "@/lib/server/persistence";
import {
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";
import {
  addInactivePlayerToCurrentRoundAction,
  addPlayerAction,
  advanceCurrentRoundAction,
  adminLoginAction,
  adminLogoutAction,
  advanceResultRevealAction,
  bulkImportPlayersAction,
  closeVotingAction,
  computeResultsAction,
  downloadPrivateCsvAction,
  drawRoundSetAction,
  releaseHostControlAction,
  manualBallotAction,
  openVotingAction,
  overrideResultAction,
  pauseVotingAction,
  reopenVotingAction,
  rerollFullRoundAction,
  rerollOneChartAction,
  rerollRoundSetAction,
  resetRoundAction,
  resumeVotingAction,
  resetRehearsalModeAction,
  seedRehearsalTiebreakAction,
  setPlayerActiveStatusAction,
  setCurrentRoundAction,
  startRehearsalModeAction,
  takeHostControlAction,
  updateChartExclusionAction,
} from "./actions";
import { AdminInactivityTimer } from "./_components/AdminInactivityTimer";
import { AdminSessionHeartbeat } from "./_components/AdminSessionHeartbeat";
import { HostHeartbeat } from "./_components/HostHeartbeat";
import { ManualBallotForm } from "./_components/ManualBallotForm";
import { PrivateCsvDownload } from "./_components/PrivateCsvDownload";
import type { RoundBallot } from "@/lib/vote/ballot";
import { formatVotingTime } from "@/lib/vote/voting-window";

type AdminPageProps = {
  searchParams?: Promise<{
    chartPool?: string;
    error?: string;
  }>;
};

function buildLiveCountRows(draws: ReturnType<typeof getRoundDrawRecords>, ballots: RoundBallot[]) {
  return draws.map((draw) => ({
    id: draw.id,
    displayLabel: draw.displayLabel,
    rows: draw.charts.map((chart) => {
      const banCount = ballots.reduce((total, ballot) => {
        const choice = ballot.choices.find((candidate) => candidate.roundSetId === draw.id);

        return total + (choice?.bannedChartIds.includes(chart.id) ? 1 : 0);
      }, 0);

      return {
        id: chart.id,
        name: chart.name,
        banCount,
      };
    }),
  }));
}

function buildChartPoolRows(charts: NormalizedChart[]) {
  const poolCounts = buildPoolCounts(charts);

  return REQUIRED_CHART_POOLS.map((pool) => {
    const poolCharts = charts
      .filter((chart) => chart.displayDifficulty === pool && chart.tournamentScope)
      .sort(
        (left, right) =>
          Number(left.excluded) - Number(right.excluded) ||
          left.name.localeCompare(right.name) ||
          left.artist.localeCompare(right.artist),
      );
    const excludedCount = poolCharts.filter((chart) => chart.excluded).length;

    return {
      pool,
      eligibleCount: poolCounts[pool],
      totalCount: poolCharts.length,
      excludedCount,
      valid: poolCounts[pool] >= 7,
      charts: poolCharts,
    };
  });
}

function resolveSelectedChartPool(value: string | undefined, fallbackRoundNumber: 1 | 2 | 3 | 4) {
  if (REQUIRED_CHART_POOLS.includes(value as (typeof REQUIRED_CHART_POOLS)[number])) {
    return value as (typeof REQUIRED_CHART_POOLS)[number];
  }

  return (
    ROUND_SET_DEFINITIONS.find(
      (set) => set.roundNumber === fallbackRoundNumber && set.setOrder === 1,
    )?.displayLabel ?? REQUIRED_CHART_POOLS[0]
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await getAdminSessionFromCookies();
  const params = await searchParams;
  const error = params?.error;

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="w-full max-w-md">
          <TournamentLogo priority className="mx-auto mb-8" />
          <form action={adminLoginAction} className="metal-panel rounded-lg p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Admin Console</p>
            <h1 className="mt-2 text-3xl font-black uppercase text-white">coolguy69</h1>
            {error ? (
              <p className="mt-4 rounded border border-ember-500/40 bg-ember-900/25 p-3 text-sm text-ember-300">
                {error}
              </p>
            ) : null}
            <label className="mt-5 block text-sm font-semibold text-metal-300" htmlFor="password">
              Shared admin password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-3 text-white"
            />
            <button className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase" type="submit">
              Log In
            </button>
          </form>
        </section>
      </main>
    );
  }

  await hydrateTournamentState();

  const hostSnapshot = adminState.hostLockStore.getSnapshot(session.sessionId);
  const players = adminState.rosterStore.listPlayers();
  const inactivePlayers = players.filter((player) => !player.active);
  const activeCount = adminState.rosterStore.getActivePlayerCount();
  const canControl = hostSnapshot.status === "active";
  const roundSnapshot = adminState.roundStateStore.getSnapshot();
  const currentRoundNumber = roundSnapshot.currentRound;
  const selectedChartPool = resolveSelectedChartPool(params?.chartPool, currentRoundNumber);
  const votingSnapshot = getVotingRoundSnapshot(currentRoundNumber);
  const currentRoundDraws = getRoundDrawRecords(currentRoundNumber);
  const currentRoundBallots = adminState.ballotStore.listForRound(currentRoundNumber);
  const submittedPlayerIds = getSubmittedPlayerIdsForRound(currentRoundNumber);
  const result = adminState.resultStore.getRoundResult(currentRoundNumber);
  const liveCountRows = buildLiveCountRows(currentRoundDraws, currentRoundBallots);
  const auditRecords = adminState.auditStore.list(12);
  const drawControls = ROUND_SET_DEFINITIONS.map((set) => ({
    set,
    activeDraw: adminState.drawStateStore.getActiveDraw(set.roundNumber, set.setOrder),
    historyCount: adminState.drawStateStore.getDrawHistory(set.roundNumber, set.setOrder).length,
  }));
  const chartPoolRows = buildChartPoolRows(adminState.drawStateStore.getCharts());
  const selectedChartPoolRow = chartPoolRows.find((row) => row.pool === selectedChartPool);

  return (
    <AdminLayout hostStatus={hostSnapshot.status}>
      <AdminSessionHeartbeat />
      <HostHeartbeat active={hostSnapshot.status === "active"} />
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          {error ? (
            <section className="rounded-lg border border-ember-500/35 bg-ember-900/20 p-4 text-sm text-ember-300">
              {error}
            </section>
          ) : null}
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Event Mode
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Current Round {currentRoundNumber}
                </h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                {roundSnapshot.rehearsalMode ? "Rehearsal mode" : "Tournament mode"}
              </p>
            </div>
            {roundSnapshot.rehearsalMode ? (
              <p className="mt-4 rounded border border-ember-300/25 bg-ember-900/15 p-3 text-sm text-ember-300">
                Rehearsal mode uses disposable in-memory data. Reset rehearsal data before switching back to
                tournament operation.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <form action={setCurrentRoundAction} className="flex flex-wrap gap-2">
                <select
                  name="roundNumber"
                  disabled={!canControl}
                  defaultValue={currentRoundNumber}
                  className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="1">Round 1</option>
                  <option value="2">Round 2</option>
                  <option value="3">Round 3</option>
                  <option value="4">Round 4</option>
                </select>
                <button
                  className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Set Current Round
                </button>
              </form>
              <form action={advanceCurrentRoundAction}>
                <button
                  className="rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 disabled:opacity-40"
                  disabled={!canControl || currentRoundNumber === 4}
                  type="submit"
                >
                  Advance Round
                </button>
              </form>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <form action={startRehearsalModeAction} className="rounded border border-metal-700 bg-black/20 p-3">
                <p className="text-sm font-bold text-white">Start rehearsal mode</p>
                <p className="mt-1 text-xs text-metal-300">
                  This resets operational state and loads a 12-player test roster.
                </p>
                <p className="mt-2 text-xs font-bold text-ember-300">
                  Dangerous action: this clears current in-memory tournament operation data.
                </p>
                <input
                  name="adminPassword"
                  type="password"
                  required
                  disabled={!canControl}
                  placeholder="Admin password"
                  className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <textarea
                  name="reason"
                  required
                  disabled={!canControl}
                  rows={2}
                  placeholder="Audit reason"
                  className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <button
                  className="button-metal mt-3 w-full rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Start Rehearsal
                </button>
              </form>
              <form action={seedRehearsalTiebreakAction} className="rounded border border-metal-700 bg-black/20 p-3">
                <p className="text-sm font-bold text-white">Force rehearsal tiebreak</p>
                <p className="mt-1 text-xs text-metal-300">
                  After both current-round sets are drawn, seed ballots that create a two-chart least-ban tie.
                </p>
                <button
                  className="button-metal mt-3 w-full rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl || !roundSnapshot.rehearsalMode}
                  type="submit"
                >
                  Seed Tiebreak
                </button>
              </form>
              <form action={resetRehearsalModeAction} className="rounded border border-metal-700 bg-black/20 p-3">
                <p className="text-sm font-bold text-white">Reset rehearsal data</p>
                <p className="mt-1 text-xs text-metal-300">
                  This clears rehearsal state and returns to tournament mode.
                </p>
                <p className="mt-2 text-xs font-bold text-ember-300">
                  Dangerous action: this clears current in-memory rehearsal operation data.
                </p>
                <input
                  name="adminPassword"
                  type="password"
                  required
                  disabled={!canControl}
                  placeholder="Admin password"
                  className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <textarea
                  name="reason"
                  required
                  disabled={!canControl}
                  rows={2}
                  placeholder="Audit reason"
                  className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <button
                  className="mt-3 w-full rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Reset Rehearsal
                </button>
              </form>
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Tournament Config
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Round Sets</h2>
              </div>
              <HostLockBadge status={hostSnapshot.status} />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {ROUND_SET_DEFINITIONS.map((set) => (
                <div
                  key={`${set.roundNumber}-${set.displayLabel}`}
                  className="rounded border border-metal-700 bg-black/25 p-3"
                >
                  <p className="text-sm font-bold text-white">
                    Round {set.roundNumber} - {set.displayLabel}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-metal-300">
                    Draw {set.drawCount} / Max bans {set.maxBans}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Chart Eligibility
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Required Pools</h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                7 eligible required
              </p>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {chartPoolRows.map((row) => (
                <div
                  key={row.pool}
                  className={`rounded border bg-black/25 p-3 ${
                    row.valid ? "border-metal-700" : "border-ember-300/45"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
                    {row.pool}
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{row.eligibleCount}</p>
                  <p className="mt-1 text-xs text-metal-300">
                    {row.excludedCount} excluded / {row.totalCount} total
                  </p>
                </div>
              ))}
            </div>
            {!canControl ? (
              <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
                Take host control to change chart eligibility.
              </p>
            ) : null}
            <form className="mt-4 flex flex-wrap gap-2" method="get">
              <select
                name="chartPool"
                defaultValue={selectedChartPool}
                className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {chartPoolRows.map((row) => (
                  <option key={row.pool} value={row.pool}>
                    {row.pool} - {row.eligibleCount} eligible
                  </option>
                ))}
              </select>
              <button className="button-metal rounded px-3 py-2 text-xs font-bold uppercase" type="submit">
                Review Pool
              </button>
            </form>
            <details className="mt-4 rounded border border-metal-700 bg-black/20 p-3" open>
              <summary className="cursor-pointer text-sm font-black uppercase text-ember-300">
                {selectedChartPoolRow?.pool} - {selectedChartPoolRow?.eligibleCount} eligible
              </summary>
              <div className="mt-3 grid gap-2">
                {selectedChartPoolRow?.charts.map((chart) => (
                  <form
                    key={chart.chartKey}
                    action={updateChartExclusionAction}
                    className="grid gap-2 rounded border border-metal-700 bg-black/25 p-3 text-sm xl:grid-cols-[minmax(0,1fr)_160px_220px_auto]"
                    data-testid="admin-chart-exclusion-row"
                  >
                    <input type="hidden" name="chartKey" value={chart.chartKey} />
                    <input type="hidden" name="excluded" value={chart.excluded ? "false" : "true"} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{chart.name}</p>
                      <p className="truncate text-xs text-metal-300">{chart.artist}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-metal-400">
                        {chart.excluded
                          ? `Excluded: ${chart.exclusionReason ?? "No reason stored"}`
                          : "Eligible"}
                      </p>
                    </div>
                    <input
                      name="adminPassword"
                      type="password"
                      required
                      disabled={!canControl}
                      placeholder="Admin password"
                      className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <input
                      name="reason"
                      required
                      disabled={!canControl}
                      placeholder={chart.excluded ? "Re-include reason" : "Exclusion reason"}
                      className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <button
                      className={`rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40 ${
                        chart.excluded ? "button-metal" : "border border-ember-300/40 text-ember-300"
                      }`}
                      disabled={!canControl}
                      type="submit"
                    >
                      {chart.excluded ? "Re-include" : "Exclude"}
                    </button>
                  </form>
                ))}
              </div>
            </details>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              Sensitive Admin Counts
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Live Chart Counts</h2>
            <details className="mt-4 rounded border border-ember-300/30 bg-ember-900/15 p-3">
              <summary className="cursor-pointer text-sm font-black uppercase text-ember-300">
                Show live counts
              </summary>
              <p className="mt-3 text-sm text-metal-300">
                Keep this closed on projector or stream. This warning does not require another password because
                it does not change tournament state.
              </p>
              <div className="mt-4 grid gap-3">
                {liveCountRows.length === 0 ? (
                  <p className="text-sm text-metal-300">Draw both current-round sets before live counts appear.</p>
                ) : (
                  liveCountRows.map((set) => (
                    <div key={set.id} className="rounded border border-metal-700 bg-black/25 p-3">
                      <p className="font-bold text-white">{set.displayLabel}</p>
                      <ol className="mt-2 grid gap-1 text-sm text-metal-300">
                        {set.rows.map((row) => (
                          <li key={row.id} className="flex justify-between gap-3">
                            <span>{row.name}</span>
                            <span className="font-mono text-ember-300">{row.banCount}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))
                )}
              </div>
            </details>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Voting Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Round {currentRoundNumber}</h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                {votingSnapshot.status.replaceAll("_", " ")}
              </p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Timer</p>
                <p className="mt-2 font-mono text-3xl font-black tabular-nums text-white">
                  {formatVotingTime(votingSnapshot.remainingMs)}
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Ballots submitted</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {votingSnapshot.submittedCount} / {votingSnapshot.eligibleCount}
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Ban selections cast</p>
                <p className="mt-2 text-3xl font-black text-white">{votingSnapshot.banSelectionsCast}</p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Extension</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {votingSnapshot.extensionUsed ? "Used" : "Ready"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={openVotingAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl || !votingSnapshot.canOpen}
                  type="submit"
                >
                  Open Voting
                </button>
              </form>
              <form action={pauseVotingAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 disabled:opacity-40"
                  disabled={!canControl || !votingSnapshot.canPause}
                  type="submit"
                >
                  Pause
                </button>
              </form>
              <form action={resumeVotingAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 disabled:opacity-40"
                  disabled={!canControl || !votingSnapshot.canResume}
                  type="submit"
                >
                  Resume
                </button>
              </form>
              <form action={closeVotingAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                  disabled={!canControl || !votingSnapshot.canClose}
                  type="submit"
                >
                  Close Voting
                </button>
              </form>
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Result Reveal Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Round {currentRoundNumber}</h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                {result?.revealPhase.replaceAll("_", " ") ?? "not computed"}
              </p>
            </div>
            <p className="mt-4 rounded border border-ember-300/25 bg-black/25 p-3 text-sm text-metal-300">
              Revealing live counts is sensitive. Confirm the stage is ready before advancing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={computeResultsAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl || votingSnapshot.status !== "voting_closed" || Boolean(result)}
                  type="submit"
                >
                  Compute Results
                </button>
              </form>
              <form action={advanceResultRevealAction}>
                <input type="hidden" name="roundNumber" value={currentRoundNumber} />
                <button
                  className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                  disabled={!canControl || !result || result.revealPhase === "final"}
                  type="submit"
                >
                  Next Reveal Step
                </button>
              </form>
            </div>
            <div className="mt-4">
              <PrivateCsvDownload
                roundNumber={currentRoundNumber}
                enabled={Boolean(result && result.revealPhase === "final")}
                autoDownloadKey={result?.finalRevealedAt ? `${result.id}:${result.finalRevealedAt}` : null}
                action={downloadPrivateCsvAction}
              />
            </div>
          </section>
          <ManualBallotForm
            action={manualBallotAction}
            roundNumber={currentRoundNumber}
            players={votingSnapshot.eligiblePlayers}
            draws={currentRoundDraws}
            existingPlayerIds={submittedPlayerIds}
            canControl={canControl}
            canSubmitManualBallot={
              votingSnapshot.canAcceptManualBallot && (!result || result.revealPhase === "computed")
            }
          />
          <section className="grid gap-4 xl:grid-cols-3">
            <form action={reopenVotingAction}>
              <input type="hidden" name="roundNumber" value={currentRoundNumber} />
              <DangerousActionDialog
                action={`reopen Round ${currentRoundNumber} voting`}
                consequence="invalidate any computed unrevealed result and allow ballot edits for the chosen duration"
                disabled={!canControl}
                passwordId="reopen-voting-password"
              >
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="durationMinutes">
                  Reopen duration
                </label>
                <select
                  id="durationMinutes"
                  name="durationMinutes"
                  disabled={!canControl}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="1">1 minute</option>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                </select>
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="reopen-reason">
                  Audit reason
                </label>
                <textarea
                  id="reopen-reason"
                  name="reason"
                  required
                  disabled={!canControl}
                  rows={3}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                />
                <button
                  className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Reopen Voting
                </button>
              </DangerousActionDialog>
            </form>
            <form action={resetRoundAction}>
              <DangerousActionDialog
                action="reset a round"
                consequence="clear that round's draws, ballots, voting window, result snapshot, and reveal state"
                disabled={!canControl}
                passwordId="reset-round-password"
              >
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="reset-round">
                  Round
                </label>
                <select
                  id="reset-round"
                  name="roundNumber"
                  defaultValue={currentRoundNumber}
                  disabled={!canControl}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="1">Round 1</option>
                  <option value="2">Round 2</option>
                  <option value="3">Round 3</option>
                  <option value="4">Round 4</option>
                </select>
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="reset-round-reason">
                  Audit reason
                </label>
                <textarea
                  id="reset-round-reason"
                  name="reason"
                  required
                  disabled={!canControl}
                  rows={3}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                />
                <button
                  className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Reset Round
                </button>
              </DangerousActionDialog>
            </form>
            <form action={overrideResultAction}>
              <input type="hidden" name="roundNumber" value={currentRoundNumber} />
              <DangerousActionDialog
                action={`override a Round ${currentRoundNumber} selected chart`}
                consequence="change the committed selected chart used by stage, phones, and private export"
                disabled={!canControl || !result}
                passwordId="override-result-password"
              >
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="resultTarget">
                  Corrected selected chart
                </label>
                <select
                  id="resultTarget"
                  name="resultTarget"
                  required
                  disabled={!canControl || !result}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                >
                  {result?.sets.map((set) => (
                    <optgroup key={set.roundSetId} label={set.displayLabel}>
                      {set.rows.map((row) => (
                        <option key={row.chart.id} value={`${set.setOrder}|${row.chart.id}`}>
                          {set.displayLabel} - {row.chart.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="override-reason">
                  Audit reason
                </label>
                <textarea
                  id="override-reason"
                  name="reason"
                  required
                  disabled={!canControl || !result}
                  rows={3}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                />
                <button
                  className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                  disabled={!canControl || !result}
                  type="submit"
                >
                  Override Result
                </button>
              </DangerousActionDialog>
            </form>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Draw Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">All Rounds</h2>
              </div>
              <form action={rerollFullRoundAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <p className="sm:col-span-3 text-xs font-bold text-ember-300">
                  You are about to reroll a full round. This will replace both currently drawn sets for that round.
                </p>
                <select
                  name="roundNumber"
                  disabled={!canControl}
                  className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="1">Round 1</option>
                  <option value="2">Round 2</option>
                  <option value="3">Round 3</option>
                  <option value="4">Round 4</option>
                </select>
                <input
                  name="adminPassword"
                  type="password"
                  required
                  disabled={!canControl}
                  placeholder="Admin password"
                  className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <input
                  name="reason"
                  required
                  disabled={!canControl}
                  placeholder="Reroll reason"
                  className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                />
                <button
                  className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Reroll Round
                </button>
              </form>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {drawControls.map(({ set, activeDraw, historyCount }) => (
                <section key={set.displayLabel} className="rounded border border-metal-700 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ember-300">
                        Round {set.roundNumber} - Set {set.setOrder}
                      </p>
                      <h3 className="text-xl font-black text-white">{set.displayLabel}</h3>
                    </div>
                    <form action={drawRoundSetAction}>
                      <input type="hidden" name="roundNumber" value={set.roundNumber} />
                      <input type="hidden" name="setOrder" value={set.setOrder} />
                      <button
                        className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                        disabled={!canControl || Boolean(activeDraw)}
                        type="submit"
                      >
                        Draw Set
                      </button>
                    </form>
                  </div>
                  {activeDraw ? (
                    <div className="mt-3 grid gap-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-metal-300">
                        Version {activeDraw.version} / Pool {activeDraw.eligiblePoolCount} / History {historyCount}
                      </p>
                      {activeDraw.charts.map((chart, index) => (
                        <div
                          key={chart.id}
                          className="grid gap-2 rounded border border-metal-700 bg-black/25 p-2 text-sm md:grid-cols-[1fr_auto]"
                        >
                          <div>
                            <p className="font-semibold text-white">
                              {index + 1}. {chart.name}
                            </p>
                            <p className="text-xs text-metal-300">{chart.artist}</p>
                          </div>
                          <form action={rerollOneChartAction} className="grid gap-2 sm:grid-cols-3">
                            <p className="sm:col-span-3 text-xs font-bold text-ember-300">
                              You are about to reroll this chart. This will replace only this chart in the active
                              {` ${activeDraw.displayLabel}`} draw.
                            </p>
                            <input type="hidden" name="roundNumber" value={set.roundNumber} />
                            <input type="hidden" name="setOrder" value={set.setOrder} />
                            <input type="hidden" name="chartId" value={chart.id} />
                            <input
                              name="adminPassword"
                              type="password"
                              required
                              disabled={!canControl}
                              placeholder="Password"
                              className="rounded border border-metal-700 bg-black/30 px-2 py-1 text-xs text-white"
                            />
                            <input
                              name="reason"
                              required
                              disabled={!canControl}
                              placeholder="Reason"
                              className="rounded border border-metal-700 bg-black/30 px-2 py-1 text-xs text-white"
                            />
                            <button
                              className="rounded border border-ember-300/30 px-2 py-1 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                              disabled={!canControl}
                              type="submit"
                            >
                              Reroll
                            </button>
                          </form>
                        </div>
                      ))}
                      <form action={rerollRoundSetAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <p className="sm:col-span-3 text-xs font-bold text-ember-300">
                          You are about to reroll Round {set.roundNumber} - {set.displayLabel}. This will replace
                          all currently drawn charts for this set.
                        </p>
                        <input type="hidden" name="roundNumber" value={set.roundNumber} />
                        <input type="hidden" name="setOrder" value={set.setOrder} />
                        <input
                          name="adminPassword"
                          type="password"
                          required
                          disabled={!canControl}
                          placeholder="Admin password"
                          className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                        <input
                          name="reason"
                          required
                          disabled={!canControl}
                          placeholder="Set reroll reason"
                          className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                        <button
                          className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                          disabled={!canControl}
                          type="submit"
                        >
                          Reroll Set
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-metal-300">No active draw.</p>
                  )}
                </section>
              ))}
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Roster</p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Players</h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm text-metal-300">
                Active {activeCount}
              </p>
            </div>
            {!canControl ? (
              <p className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
                Take host control to edit the roster.
              </p>
            ) : null}
            <form action={addPlayerAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                name="startggUsername"
                required
                disabled={!canControl}
                placeholder="start.gg username"
                className="min-w-0 flex-1 rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              />
              <button
                className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                disabled={!canControl}
                type="submit"
              >
                Add Player
              </button>
            </form>
            <form action={bulkImportPlayersAction} className="mt-4 grid gap-2">
              <textarea
                name="startggUsernames"
                rows={4}
                disabled={!canControl}
                placeholder="Bulk import start.gg usernames"
                className="rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              />
              <button
                className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                disabled={!canControl}
                type="submit"
              >
                Bulk Import
              </button>
            </form>
            <div className="mt-4 overflow-hidden rounded border border-metal-700">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-black/40 text-left text-xs uppercase tracking-[0.16em] text-ember-300">
                  <tr>
                    <th className="p-3">Username</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.id} className="border-t border-metal-700 bg-black/20">
                      <td className="p-3 font-semibold text-white">{player.startggUsername}</td>
                      <td className="p-3 text-metal-300">{player.active ? "Active" : "Inactive"}</td>
                      <td className="p-3">
                        <form action={setPlayerActiveStatusAction}>
                          <input type="hidden" name="playerId" value={player.id} />
                          <input type="hidden" name="active" value={player.active ? "false" : "true"} />
                          <button
                            className="rounded border border-metal-700 px-3 py-1 text-xs font-bold uppercase text-metal-300 hover:border-ember-300/50 hover:text-white disabled:opacity-40"
                            disabled={!canControl}
                            type="submit"
                          >
                            {player.active ? "Mark Inactive" : "Reactivate"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <aside className="grid content-start gap-5">
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Session</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Admin Access</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AdminInactivityTimer expiresAt={session.expiresAt} />
              <form action={adminLogoutAction}>
                <button className="rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                  Log Out
                </button>
              </form>
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Host Lock</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Control</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {hostSnapshot.status === "readonly" ? (
                <form action={takeHostControlAction} className="grid gap-3">
                  <input type="hidden" name="forceHostTakeover" value="true" />
                  <p className="rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm text-ember-300">
                    Another admin has an unexpired host lock. Force takeover only if that host is unavailable
                    or explicitly handed control to you.
                  </p>
                  <button
                    className="rounded border border-ember-300/40 px-4 py-2 font-bold uppercase text-ember-300"
                    type="submit"
                  >
                    Force Host Takeover
                  </button>
                </form>
              ) : (
                <form action={takeHostControlAction}>
                  <button
                    className="button-metal rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                    disabled={hostSnapshot.status === "active"}
                    type="submit"
                  >
                    Take Host Control
                  </button>
                </form>
              )}
              <form action={releaseHostControlAction}>
                <button
                  className="rounded border border-metal-700 px-4 py-2 font-bold uppercase text-metal-300 disabled:opacity-40"
                  disabled={!canControl}
                  type="submit"
                >
                  Release
                </button>
              </form>
            </div>
          </section>
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">Audit</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Recent Actions</h2>
            <div className="mt-4 grid gap-2">
              {auditRecords.length === 0 ? (
                <p className="text-sm text-metal-300">No admin actions recorded in this server process yet.</p>
              ) : (
                auditRecords.map((record) => (
                  <article key={record.id} className="rounded border border-metal-700 bg-black/25 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-white">{record.action.replaceAll("_", " ")}</p>
                      <p className="font-mono text-xs text-metal-300">{record.createdAt}</p>
                    </div>
                    <p className="mt-1 text-metal-300">{record.summary}</p>
                    {record.reason ? (
                      <p className="mt-1 text-xs text-ember-300">Reason: {record.reason}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-metal-400">Session {record.sessionId.slice(0, 8)}</p>
                  </article>
                ))
              )}
            </div>
          </section>
          <form action={addInactivePlayerToCurrentRoundAction}>
            <DangerousActionDialog
              action="add an inactive player to current round eligibility"
              consequence="make that player eligible for the selected current round"
              disabled={!canControl}
            >
              <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="playerId">
                Inactive player
              </label>
              <select
                id="playerId"
                name="playerId"
                required
                disabled={!canControl}
                className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              >
                {inactivePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.startggUsername}
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="roundNumber">
                Round
              </label>
              <select
                id="roundNumber"
                name="roundNumber"
                disabled={!canControl}
                className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              >
                <option value="1">Round 1</option>
                <option value="2">Round 2</option>
                <option value="3">Round 3</option>
                <option value="4">Round 4</option>
              </select>
              <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="reason">
                Audit reason
              </label>
              <textarea
                id="reason"
                name="reason"
                required
                disabled={!canControl}
                rows={3}
                className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              />
              <button
                className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                disabled={!canControl}
                type="submit"
              >
                Confirm Eligibility Change
              </button>
            </DangerousActionDialog>
          </form>
        </aside>
      </section>
    </AdminLayout>
  );
}
