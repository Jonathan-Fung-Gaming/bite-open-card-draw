import type { Metadata } from "next";
import { AdminLayout, DangerousActionDialog, HostLockBadge, TournamentLogo } from "@/components";
import { buildPoolCounts } from "@/lib/charts/importer";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import { REQUIRED_CHART_POOLS, type NormalizedChart } from "@/lib/charts/types";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { adminState } from "@/lib/server/admin-state";
import { getAdminSessionFromCookies } from "@/lib/server/admin-auth";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { getDeploymentSafetySnapshot } from "@/lib/server/deployment-safety";
import { hydrateTournamentState } from "@/lib/server/persistence";
import {
  advanceVotingTimerIfDue,
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";
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
  downloadDebugSnapshotAction,
  getAdminLiveCountsAction,
  downloadPrivateCsvAction,
  drawRoundSetAction,
  editPlayerUsernameAction,
  releaseHostControlAction,
  releaseFinalResultsAction,
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
import { AdminLiveRefresh } from "./_components/AdminLiveRefresh";
import { AdminLiveCountsDisclosure } from "./_components/AdminLiveCountsDisclosure";
import { AdminSessionHeartbeat } from "./_components/AdminSessionHeartbeat";
import { DebugSnapshotDownload } from "./_components/DebugSnapshotDownload";
import { AdminActionButton } from "./_components/AdminActionButton";
import { HostHeartbeat } from "./_components/HostHeartbeat";
import { ManualBallotForm } from "./_components/ManualBallotForm";
import { PrivateCsvDownload } from "./_components/PrivateCsvDownload";
import { formatVotingTime } from "@/lib/vote/voting-window";

type AdminPageProps = {
  searchParams?: Promise<{
    chartPool?: string;
    error?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Host Console",
};

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

function revealPhaseLabel(phase: string | null | undefined) {
  switch (phase) {
    case "computed":
      return "Computed, not yet revealed";
    case "set_1_counts":
      return "Set 1 ban counts on stage";
    case "set_1_resolved":
      return "Set 1 selected chart on stage";
    case "set_2_counts":
      return "Set 2 ban counts on stage";
    case "set_2_resolved":
      return "Set 2 selected chart on stage";
    case "final":
      return "Final two charts on stage";
    default:
      return "No result computed";
  }
}

function nextRevealActionLabel(phase: string | null | undefined) {
  switch (phase) {
    case "computed":
      return "Advance to Set 1 counts";
    case "set_1_counts":
      return "Reveal Set 1 selected chart";
    case "set_1_resolved":
      return "Advance to Set 2 counts";
    case "set_2_counts":
      return "Reveal Set 2 selected chart";
    case "set_2_resolved":
      return "Show final charts";
    case "final":
      return "Final charts shown";
    default:
      return "Advance reveal";
  }
}

type DrawControlView = {
  set: RoundSetDefinition;
  activeDraw: DrawRecord | null;
  historyCount: number;
};

function readinessToneClass(isReady: boolean) {
  return isReady ? "border-metal-700 bg-black/25" : "border-ember-300/45 bg-ember-900/15";
}

function readinessTextClass(isReady: boolean) {
  return isReady ? "text-white" : "text-ember-300";
}

function RerollOneChartConfirmation({
  activeDraw,
  canControl,
  chart,
  index,
  set,
}: {
  activeDraw: DrawRecord;
  canControl: boolean;
  chart: DrawRecord["charts"][number];
  index: number;
  set: RoundSetDefinition;
}) {
  const detailId = `reroll-chart-${set.roundNumber}-${set.setOrder}-${index}`;

  return (
    <details className="rounded border border-metal-700 bg-black/20 p-2">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-ember-300">
        Reroll chart
      </summary>
      <form action={rerollOneChartAction} className="mt-3 grid gap-3">
        <input type="hidden" name="roundNumber" value={set.roundNumber} />
        <input type="hidden" name="setOrder" value={set.setOrder} />
        <input type="hidden" name="chartId" value={chart.id} />
        <DangerousActionDialog
          action={`reroll ${chart.name} from Round ${set.roundNumber} - ${activeDraw.displayLabel}`}
          consequence="replace only this chart in the active draw, invalidate any submitted ballots for this round, clear any computed result, and reset the round voting window"
          disabled={!canControl}
          passwordId={`${detailId}-password`}
        >
          <label
            className="block text-sm font-semibold text-metal-300"
            htmlFor={`${detailId}-reason`}
          >
            Audit reason
          </label>
          <textarea
            id={`${detailId}-reason`}
            name="reason"
            required
            disabled={!canControl}
            rows={2}
            className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </DangerousActionDialog>
        <button
          className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Confirm Chart Reroll
        </button>
      </form>
    </details>
  );
}

function RerollSetConfirmation({
  activeDraw,
  canControl,
  set,
}: {
  activeDraw: DrawRecord;
  canControl: boolean;
  set: RoundSetDefinition;
}) {
  const detailId = `reroll-set-${set.roundNumber}-${set.setOrder}`;

  return (
    <details className="mt-3 rounded border border-metal-700 bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-ember-300">
        Reroll this set
      </summary>
      <form action={rerollRoundSetAction} className="mt-3 grid gap-3">
        <input type="hidden" name="roundNumber" value={set.roundNumber} />
        <input type="hidden" name="setOrder" value={set.setOrder} />
        <DangerousActionDialog
          action={`reroll Round ${set.roundNumber} - ${activeDraw.displayLabel}`}
          consequence="replace all currently drawn charts for this set, invalidate any submitted ballots for this round, clear any computed result, and reset the round voting window"
          disabled={!canControl}
          passwordId={`${detailId}-password`}
        >
          <label
            className="block text-sm font-semibold text-metal-300"
            htmlFor={`${detailId}-reason`}
          >
            Audit reason
          </label>
          <textarea
            id={`${detailId}-reason`}
            name="reason"
            required
            disabled={!canControl}
            rows={2}
            className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </DangerousActionDialog>
        <button
          className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Confirm Set Reroll
        </button>
      </form>
    </details>
  );
}

function RerollFullRoundConfirmation({
  canControl,
  currentRoundNumber,
  selectRound = false,
}: {
  canControl: boolean;
  currentRoundNumber: 1 | 2 | 3 | 4;
  selectRound?: boolean;
}) {
  return (
    <details className="rounded border border-metal-700 bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-ember-300">
        Reroll full round
      </summary>
      <form action={rerollFullRoundAction} className="mt-3 grid gap-3">
        {selectRound ? (
          <label className="block text-sm font-semibold text-metal-300" htmlFor="reroll-round">
            Round
            <select
              id="reroll-round"
              name="roundNumber"
              disabled={!canControl}
              defaultValue={currentRoundNumber}
              className="mt-2 block w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value="1">Round 1</option>
              <option value="2">Round 2</option>
              <option value="3">Round 3</option>
              <option value="4">Round 4</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="roundNumber" value={currentRoundNumber} />
        )}
        <DangerousActionDialog
          action="reroll a full round"
          consequence="replace both currently drawn sets for that round, invalidate any submitted ballots for that round, clear any computed result, and reset the voting window for that round"
          disabled={!canControl}
          passwordId={selectRound ? "reroll-any-round-password" : "reroll-current-round-password"}
          summaryItems={[{ label: "Round", fieldName: "roundNumber" }]}
        >
          <label
            className="block text-sm font-semibold text-metal-300"
            htmlFor={selectRound ? "reroll-any-round-reason" : "reroll-current-round-reason"}
          >
            Audit reason
          </label>
          <textarea
            id={selectRound ? "reroll-any-round-reason" : "reroll-current-round-reason"}
            name="reason"
            required
            disabled={!canControl}
            rows={2}
            className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </DangerousActionDialog>
        <button
          className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
          disabled={!canControl}
          type="submit"
        >
          Confirm Round Reroll
        </button>
      </form>
    </details>
  );
}

function DrawControlCard({
  canControl,
  control,
  includeRerollControls,
}: {
  canControl: boolean;
  control: DrawControlView;
  includeRerollControls: boolean;
}) {
  const { activeDraw, historyCount, set } = control;

  return (
    <section className="rounded border border-metal-700 bg-black/20 p-3">
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
            Version {activeDraw.version} / Pool {activeDraw.eligiblePoolCount} / History{" "}
            {historyCount}
          </p>
          {activeDraw.charts.map((chart, index) => (
            <div
              key={chart.id}
              className="grid gap-2 rounded border border-metal-700 bg-black/25 p-2 text-sm md:grid-cols-[minmax(0,1fr)_170px]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {index + 1}. {chart.name}
                </p>
                <p className="truncate text-xs text-metal-300">{chart.artist}</p>
              </div>
              {includeRerollControls ? (
                <RerollOneChartConfirmation
                  activeDraw={activeDraw}
                  canControl={canControl}
                  chart={chart}
                  index={index}
                  set={set}
                />
              ) : null}
            </div>
          ))}
          {includeRerollControls ? (
            <RerollSetConfirmation activeDraw={activeDraw} canControl={canControl} set={set} />
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-metal-300">No active draw.</p>
      )}
    </section>
  );
}

function HostControlPanel({
  canControl,
  hostStatus,
}: {
  canControl: boolean;
  hostStatus: "inactive" | "active" | "readonly";
}) {
  return (
    <section className="metal-panel rounded-lg p-4" data-testid="admin-host-control-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Host Lock
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">Control</h2>
        </div>
        <HostLockBadge status={hostStatus} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {hostStatus === "readonly" ? (
          <form action={takeHostControlAction} className="grid gap-3">
            <input type="hidden" name="forceHostTakeover" value="true" />
            <DangerousActionDialog
              action="force takeover of the active host lock"
              consequence="make this browser the active host and put other admin browsers in read-only mode"
              disabled={false}
              passwordId="force-host-takeover-password"
            >
              <p className="rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm text-ember-300">
                Another admin has an unexpired host lock. Force takeover only if that host is
                unavailable or explicitly handed control to you.
              </p>
              <label
                className="mt-4 block text-sm font-semibold text-metal-300"
                htmlFor="forceHostTakeoverReason"
              >
                Audit reason
              </label>
              <textarea
                id="forceHostTakeoverReason"
                name="reason"
                required
                rows={3}
                className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
              />
            </DangerousActionDialog>
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
              disabled={hostStatus === "active"}
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              Admin Console
            </p>
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
            <button
              className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase"
              type="submit"
            >
              Log In
            </button>
          </form>
        </section>
      </main>
    );
  }

  await hydrateTournamentState();

  const nowMs = await getAuthoritativeNowMs();
  const hostSnapshot = adminState.hostLockStore.getSnapshot(session.sessionId, nowMs);
  const players = adminState.rosterStore.listPlayers();
  const inactivePlayers = players.filter((player) => !player.active);
  const activeCount = adminState.rosterStore.getActivePlayerCount();
  const canControl = hostSnapshot.status === "active";
  const deploymentSafety = getDeploymentSafetySnapshot();
  const canUseRehearsalControls = canControl && deploymentSafety.rehearsalAdminControlsAllowed;
  const rehearsalControlsDisabledReason = !canControl
    ? "Take host control to use rehearsal controls."
    : deploymentSafety.rehearsalControlBlockReason;
  const roundSnapshot = adminState.roundStateStore.getSnapshot();
  const currentRoundNumber = roundSnapshot.currentRound;
  const selectedChartPool = resolveSelectedChartPool(params?.chartPool, currentRoundNumber);
  await advanceVotingTimerIfDue(currentRoundNumber, nowMs);
  const votingSnapshot = getVotingRoundSnapshot(currentRoundNumber, nowMs);
  const currentRoundDraws = getRoundDrawRecords(currentRoundNumber);
  const submittedPlayerIds = getSubmittedPlayerIdsForRound(currentRoundNumber);
  const result = adminState.resultStore.getRoundResult(currentRoundNumber);
  const finalStageShown = result?.revealPhase === "final";
  const finalResultsReleased =
    finalStageShown &&
    (votingSnapshot.status === "results_revealed" || votingSnapshot.status === "round_complete");
  const finalStageAwaitingPublicRelease = finalStageShown && !finalResultsReleased;
  const auditRecords = adminState.auditStore.list(12);
  const allCharts = adminState.drawStateStore.getCharts();
  const drawControls = ROUND_SET_DEFINITIONS.map((set) => ({
    set,
    activeDraw: adminState.drawStateStore.getActiveDraw(set.roundNumber, set.setOrder),
    historyCount: adminState.drawStateStore.getDrawHistory(set.roundNumber, set.setOrder).length,
  }));
  const currentRoundDrawControls = drawControls.filter(
    ({ set }) => set.roundNumber === currentRoundNumber,
  );
  const secondaryDrawControls = drawControls.filter(
    ({ set }) => set.roundNumber !== currentRoundNumber,
  );
  const chartPoolRows = buildChartPoolRows(allCharts);
  const selectedChartPoolRow = chartPoolRows.find((row) => row.pool === selectedChartPool);
  const requiredPoolsReady = chartPoolRows.every((row) => row.valid);
  const currentRoundDrawnCount = currentRoundDrawControls.filter(
    ({ activeDraw }) => activeDraw !== null,
  ).length;
  const currentRoundDrawsReady = currentRoundDrawnCount === 2;
  const tournamentCharts = allCharts.filter((chart) => chart.tournamentScope);
  const cachedImageCount = tournamentCharts.filter(
    (chart) => chart.localImagePath && chart.localImagePath !== FALLBACK_CHART_IMAGE_PATH,
  ).length;
  const localImageMetadataReady =
    tournamentCharts.length > 0 && cachedImageCount === tournamentCharts.length;
  const resultRevealStarted = Boolean(result && result.revealPhase !== "computed");
  const canReopenVoting =
    canControl &&
    !resultRevealStarted &&
    (votingSnapshot.status === "voting_closed" || votingSnapshot.status === "results_computed");
  const reopenDisabledReason = !canControl
    ? "Take host control to reopen voting."
    : resultRevealStarted
      ? "Emergency reopen is blocked after result reveal starts. Use the correction workflow instead."
      : votingSnapshot.status === "voting_closed" || votingSnapshot.status === "results_computed"
        ? null
        : "Emergency reopen is available only after voting closes and before result reveal starts.";

  return (
    <AdminLayout hostStatus={hostSnapshot.status}>
      <AdminLiveRefresh />
      <AdminSessionHeartbeat />
      <HostHeartbeat active={hostSnapshot.status === "active"} />
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          {error ? (
            <section className="order-0 rounded-lg border border-ember-500/35 bg-ember-900/20 p-4 text-sm text-ember-300">
              {error}
            </section>
          ) : null}
          <div className="order-1">
            <HostControlPanel canControl={canControl} hostStatus={hostSnapshot.status} />
          </div>
          <section className="metal-panel order-2 rounded-lg p-4" data-testid="admin-readiness">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Event-Day Flow
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Current Round Readiness
                </h2>
              </div>
              <HostLockBadge status={hostSnapshot.status} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className={`rounded border p-3 ${readinessToneClass(canControl)}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Host lock</p>
                <p
                  className={`mt-2 text-2xl font-black uppercase ${readinessTextClass(canControl)}`}
                >
                  {canControl ? "Active" : "Standby"}
                </p>
                <p className="mt-1 text-xs text-metal-300">
                  {canControl
                    ? "This browser can run tournament controls."
                    : "Take host control before changing tournament state."}
                </p>
              </div>
              <div className={`rounded border p-3 ${readinessToneClass(currentRoundDrawsReady)}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">
                  Current round draws
                </p>
                <p
                  className={`mt-2 text-2xl font-black uppercase ${readinessTextClass(
                    currentRoundDrawsReady,
                  )}`}
                  data-testid="admin-current-round-draw-readiness"
                >
                  {currentRoundDrawnCount} / 2
                </p>
                <p className="mt-1 text-xs text-metal-300">Draw both sets before opening voting.</p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Active players</p>
                <p
                  className="mt-2 text-2xl font-black uppercase text-white"
                  data-count={activeCount}
                  data-testid="admin-readiness-active-player-count"
                >
                  {activeCount}
                </p>
                <p className="mt-1 text-xs text-metal-300">
                  Current active roster count before round snapshot.
                </p>
              </div>
              <div className={`rounded border p-3 ${readinessToneClass(requiredPoolsReady)}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Required pools</p>
                <p
                  className={`mt-2 text-2xl font-black uppercase ${readinessTextClass(requiredPoolsReady)}`}
                >
                  {requiredPoolsReady ? "Ready" : "Review"}
                </p>
                <p className="mt-1 text-xs text-metal-300">
                  {chartPoolRows.filter((row) => row.valid).length} / {chartPoolRows.length} pools
                  have at least 7 eligible charts.
                </p>
              </div>
              <div className={`rounded border p-3 ${readinessToneClass(localImageMetadataReady)}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">
                  Local image cache
                </p>
                <p
                  className={`mt-2 text-2xl font-black uppercase ${readinessTextClass(localImageMetadataReady)}`}
                >
                  {cachedImageCount} / {tournamentCharts.length}
                </p>
                <p className="mt-1 text-xs text-metal-300">
                  Local metadata signal only; deployed cache-art evidence remains separate.
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3 md:col-span-2 xl:col-span-5">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Runbook order</p>
                <ol className="mt-2 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.12em] text-metal-300">
                  <li>Host control</li>
                  <li>Draw current round</li>
                  <li>Reveal drawn charts</li>
                  <li>Open voting</li>
                  <li>Manual corrections</li>
                  <li>Compute and reveal</li>
                  <li>Export CSV</li>
                </ol>
              </div>
            </div>
          </section>
          <section className="metal-panel order-3 rounded-lg p-4">
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
                Rehearsal mode is using {deploymentSafety.operationalDataDescription}. Reset
                rehearsal data before switching back to tournament operation.
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
            {deploymentSafety.rehearsalAdminControlsAllowed ? (
              <details
                className="mt-4 rounded border border-metal-700 bg-black/20 p-3"
                open={roundSnapshot.rehearsalMode}
              >
                <summary className="cursor-pointer text-sm font-black uppercase text-ember-300">
                  Rehearsal controls
                </summary>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <form
                    action={startRehearsalModeAction}
                    className="rounded border border-metal-700 bg-black/20 p-3"
                  >
                    <p className="text-sm font-bold text-white">Start rehearsal mode</p>
                    <p className="mt-1 text-xs text-metal-300">
                      This resets {deploymentSafety.operationalDataDescription} and loads a
                      12-player test roster.
                    </p>
                    <p className="mt-2 text-xs font-bold text-ember-300">
                      Dangerous action: this clears current tournament operation data for this
                      deployment context.
                    </p>
                    <input
                      name="adminPassword"
                      type="password"
                      required
                      disabled={!canUseRehearsalControls}
                      placeholder="Admin password"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <textarea
                      name="reason"
                      required
                      disabled={!canUseRehearsalControls}
                      rows={2}
                      placeholder="Audit reason"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <button
                      className="button-metal mt-3 w-full rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                      disabled={!canUseRehearsalControls}
                      type="submit"
                    >
                      Start Rehearsal
                    </button>
                  </form>
                  <form
                    action={seedRehearsalTiebreakAction}
                    className="rounded border border-metal-700 bg-black/20 p-3"
                  >
                    <p className="text-sm font-bold text-white">Force rehearsal tiebreak</p>
                    <p className="mt-1 text-xs text-metal-300">
                      After both current-round sets are drawn, seed ballots that create a two-chart
                      least-ban tie.
                    </p>
                    <p className="mt-2 text-xs font-bold text-ember-300">
                      Dangerous action: this can open voting and creates manual-admin rehearsal
                      ballots.
                    </p>
                    <input
                      name="adminPassword"
                      type="password"
                      required
                      disabled={!canUseRehearsalControls || !roundSnapshot.rehearsalMode}
                      placeholder="Admin password"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <textarea
                      name="reason"
                      required
                      disabled={!canUseRehearsalControls || !roundSnapshot.rehearsalMode}
                      rows={2}
                      placeholder="Audit reason"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <button
                      className="button-metal mt-3 w-full rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                      disabled={!canUseRehearsalControls || !roundSnapshot.rehearsalMode}
                      type="submit"
                    >
                      Seed Tiebreak
                    </button>
                  </form>
                  <form
                    action={resetRehearsalModeAction}
                    className="rounded border border-metal-700 bg-black/20 p-3"
                  >
                    <p className="text-sm font-bold text-white">Reset rehearsal data</p>
                    <p className="mt-1 text-xs text-metal-300">
                      This clears {deploymentSafety.operationalDataDescription} and returns to
                      tournament mode.
                    </p>
                    <p className="mt-2 text-xs font-bold text-ember-300">
                      Dangerous action: this clears current rehearsal operation data for this
                      deployment context.
                    </p>
                    <input
                      name="adminPassword"
                      type="password"
                      required
                      disabled={!canUseRehearsalControls}
                      placeholder="Admin password"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <textarea
                      name="reason"
                      required
                      disabled={!canUseRehearsalControls}
                      rows={2}
                      placeholder="Audit reason"
                      className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <button
                      className="mt-3 w-full rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                      disabled={!canUseRehearsalControls}
                      type="submit"
                    >
                      Reset Rehearsal
                    </button>
                  </form>
                </div>
              </details>
            ) : (
              <div className="mt-4 rounded border border-metal-700 bg-black/20 p-3">
                <p className="text-sm font-bold text-white">Rehearsal reset controls unavailable</p>
                <p className="mt-1 text-xs text-metal-300">{rehearsalControlsDisabledReason}</p>
              </div>
            )}
          </section>
          <section className="metal-panel order-11 rounded-lg p-4">
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
          <section className="metal-panel order-12 rounded-lg p-4">
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
              <button
                className="button-metal rounded px-3 py-2 text-xs font-bold uppercase"
                type="submit"
              >
                Review Pool
              </button>
            </form>
            <details className="mt-4 rounded border border-metal-700 bg-black/20 p-3">
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
                    <input
                      type="hidden"
                      name="excluded"
                      value={chart.excluded ? "false" : "true"}
                    />
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
                        chart.excluded
                          ? "button-metal"
                          : "border border-ember-300/40 text-ember-300"
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
          <div className="order-7">
            <AdminLiveCountsDisclosure
              roundNumber={currentRoundNumber}
              action={getAdminLiveCountsAction}
            />
          </div>
          <section className="metal-panel order-6 rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Voting Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Round {currentRoundNumber}
                </h2>
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
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">
                  Ballots submitted
                </p>
                <p
                  className="mt-2 text-3xl font-black text-white"
                  data-count={votingSnapshot.eligibleCount}
                  data-testid="admin-voting-eligible-count"
                >
                  {votingSnapshot.submittedCount} / {votingSnapshot.eligibleCount}
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">
                  Ban selections cast
                </p>
                <p className="mt-2 text-3xl font-black text-white">
                  {votingSnapshot.banSelectionsCast}
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Extension</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {votingSnapshot.extensionUsed ? "Used" : "Ready"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminActionButton
                action={openVotingAction}
                className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                disabled={!canControl || !votingSnapshot.canOpen}
                fields={{ roundNumber: currentRoundNumber }}
              >
                Open Voting
              </AdminActionButton>
              <AdminActionButton
                action={pauseVotingAction}
                className="rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 disabled:opacity-40"
                disabled={!canControl || !votingSnapshot.canPause}
                fields={{ roundNumber: currentRoundNumber }}
              >
                Pause
              </AdminActionButton>
              <AdminActionButton
                action={resumeVotingAction}
                className="rounded border border-metal-700 px-3 py-2 text-xs font-bold uppercase text-metal-300 disabled:opacity-40"
                disabled={!canControl || !votingSnapshot.canResume}
                fields={{ roundNumber: currentRoundNumber }}
              >
                Resume
              </AdminActionButton>
              <AdminActionButton
                action={closeVotingAction}
                className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                disabled={!canControl || !votingSnapshot.canClose}
                fields={{ roundNumber: currentRoundNumber }}
              >
                Close Voting
              </AdminActionButton>
            </div>
          </section>
          <section className="metal-panel order-9 rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Result Reveal Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Round {currentRoundNumber}
                </h2>
              </div>
              <p className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                {result?.revealPhase.replaceAll("_", " ") ?? "not computed"}
              </p>
            </div>
            <p className="mt-4 rounded border border-ember-300/25 bg-black/25 p-3 text-sm text-metal-300">
              Advancing reveal phases changes what public screens may show. Confirm the stage is
              ready before each click.
            </p>
            <div className="mt-3 grid gap-2 rounded border border-metal-700 bg-black/25 p-3 text-sm md:grid-cols-2">
              <p className="text-metal-300">
                Current phase:{" "}
                <span className="font-bold text-white">
                  {revealPhaseLabel(result?.revealPhase)}
                </span>
              </p>
              <p className="text-metal-300">
                Next action:{" "}
                <span className="font-bold text-ember-300">
                  {nextRevealActionLabel(result?.revealPhase)}
                </span>
              </p>
              {finalStageShown ? (
                <p className="text-metal-300 md:col-span-2">
                  Public release:{" "}
                  <span className="font-bold text-ember-300">
                    {finalResultsReleased
                      ? "Phones and results released"
                      : "Holding phones until stage completion is confirmed"}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminActionButton
                action={computeResultsAction}
                className="button-metal rounded px-3 py-2 text-xs font-bold uppercase disabled:opacity-40"
                disabled={
                  !canControl || votingSnapshot.status !== "voting_closed" || Boolean(result)
                }
                fields={{ roundNumber: currentRoundNumber }}
              >
                Compute Results
              </AdminActionButton>
              <AdminActionButton
                action={advanceResultRevealAction}
                className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                disabled={!canControl || !result || result.revealPhase === "final"}
                fields={{ roundNumber: currentRoundNumber }}
              >
                {nextRevealActionLabel(result?.revealPhase)}
              </AdminActionButton>
              <AdminActionButton
                action={releaseFinalResultsAction}
                className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 disabled:opacity-40"
                disabled={!canControl || !finalStageAwaitingPublicRelease}
                fields={{ roundNumber: currentRoundNumber }}
              >
                Confirm Stage Reveal Complete
              </AdminActionButton>
            </div>
            <div className="mt-4">
              <PrivateCsvDownload
                roundNumber={currentRoundNumber}
                enabled={canControl && finalResultsReleased}
                disabledReason={
                  !canControl
                    ? "Take host control to download the private ballot CSV."
                    : "Available after the stage final reveal is confirmed and public results are released."
                }
                autoDownloadKey={
                  finalResultsReleased && result?.finalRevealedAt
                    ? `${result.id}:${result.finalRevealedAt}`
                    : null
                }
                action={downloadPrivateCsvAction}
              />
            </div>
          </section>
          <div className="order-8">
            <ManualBallotForm
              action={manualBallotAction}
              roundNumber={currentRoundNumber}
              players={votingSnapshot.eligiblePlayers}
              draws={currentRoundDraws}
              existingPlayerIds={submittedPlayerIds}
              canControl={canControl}
              canSubmitManualBallot={
                votingSnapshot.canAcceptManualBallot &&
                (!result || result.revealPhase === "computed")
              }
            />
          </div>
          <section className="order-10 grid gap-4 xl:grid-cols-3">
            <form action={reopenVotingAction}>
              <input type="hidden" name="roundNumber" value={currentRoundNumber} />
              <DangerousActionDialog
                action={`reopen Round ${currentRoundNumber} voting`}
                consequence="invalidate any computed unrevealed result and allow ballot edits for the chosen duration"
                disabled={!canReopenVoting}
                passwordId="reopen-voting-password"
                summaryItems={[
                  { label: "Round", fieldName: "roundNumber" },
                  { label: "Duration", fieldName: "durationMinutes" },
                ]}
              >
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="durationMinutes"
                >
                  Reopen duration
                </label>
                <select
                  id="durationMinutes"
                  name="durationMinutes"
                  disabled={!canReopenVoting}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="1">1 minute</option>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                </select>
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="reopen-reason"
                >
                  Audit reason
                </label>
                <textarea
                  id="reopen-reason"
                  name="reason"
                  required
                  disabled={!canReopenVoting}
                  rows={3}
                  className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-white"
                />
                {reopenDisabledReason ? (
                  <p className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300">
                    {reopenDisabledReason}
                  </p>
                ) : null}
                <button
                  className="button-metal mt-4 w-full rounded px-4 py-2 font-bold uppercase disabled:opacity-40"
                  disabled={!canReopenVoting}
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
                summaryItems={[{ label: "Round", fieldName: "roundNumber" }]}
              >
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="reset-round"
                >
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
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="reset-round-reason"
                >
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
                summaryItems={[
                  { label: "Round", fieldName: "roundNumber" },
                  { label: "Chart", fieldName: "resultTarget" },
                ]}
              >
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="resultTarget"
                >
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
                <label
                  className="mt-4 block text-sm font-semibold text-metal-300"
                  htmlFor="override-reason"
                >
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
          <section className="metal-panel order-4 rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Draw Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Draw Current Round
                </h2>
              </div>
              <RerollFullRoundConfirmation
                canControl={canControl}
                currentRoundNumber={currentRoundNumber}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {currentRoundDrawControls.map((control) => (
                <DrawControlCard
                  key={control.set.displayLabel}
                  canControl={canControl}
                  control={control}
                  includeRerollControls
                />
              ))}
            </div>
            <details className="mt-4 rounded border border-metal-700 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-black uppercase text-ember-300">
                Secondary all-round draw controls
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {secondaryDrawControls.map((control) => (
                  <DrawControlCard
                    key={control.set.displayLabel}
                    canControl={canControl}
                    control={control}
                    includeRerollControls
                  />
                ))}
              </div>
              <div className="mt-4">
                <RerollFullRoundConfirmation
                  canControl={canControl}
                  currentRoundNumber={currentRoundNumber}
                  selectRound
                />
              </div>
            </details>
          </section>
          <section
            className="metal-panel order-5 rounded-lg p-4"
            data-testid="admin-stage-reveal-check"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Stage Reveal Check
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">
                  Reveal Drawn Charts
                </h2>
              </div>
              <a
                className="rounded border border-ember-300/40 px-3 py-2 text-xs font-bold uppercase text-ember-300 hover:border-ember-300 hover:text-white"
                href="/stage"
                target="_blank"
              >
                Open Stage
              </a>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className={`rounded border p-3 ${readinessToneClass(currentRoundDrawsReady)}`}>
                <p className="text-xs uppercase tracking-[0.16em] text-ember-300">Draw status</p>
                <p
                  className={`mt-2 text-2xl font-black uppercase ${readinessTextClass(currentRoundDrawsReady)}`}
                >
                  {currentRoundDrawsReady ? "Both drawn" : `${currentRoundDrawnCount} / 2 drawn`}
                </p>
              </div>
              <div className="rounded border border-metal-700 bg-black/25 p-3 md:col-span-2">
                <p className="text-sm font-bold text-white">
                  {currentRoundDrawsReady
                    ? "Verify the projector has shown both seven-chart rows before opening voting."
                    : "Draw both current-round sets before the projector can reveal the complete voting slate."}
                </p>
                <p className="mt-2 text-xs text-metal-300">
                  The stage reveal uses the existing `/stage` screen and keeps the required two
                  horizontal rows of seven charts.
                </p>
              </div>
            </div>
          </section>
          <section className="metal-panel order-last rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Roster
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">Players</h2>
              </div>
              <p
                className="rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm text-metal-300"
                data-count={activeCount}
                data-testid="admin-active-player-count"
              >
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
                    <tr
                      key={player.id}
                      className="border-t border-metal-700 bg-black/20"
                      data-active={player.active ? "true" : "false"}
                      data-player-username={player.startggUsername}
                      data-testid="admin-roster-row"
                    >
                      <td className="p-3 font-semibold text-white">{player.startggUsername}</td>
                      <td className="p-3 text-metal-300">
                        {player.active ? "Active" : "Inactive"}
                        {player.hasTournamentHistory ? (
                          <span className="mt-1 block text-xs text-metal-400">History locked</span>
                        ) : null}
                      </td>
                      <td className="grid gap-2 p-3">
                        <form
                          action={editPlayerUsernameAction}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <input type="hidden" name="playerId" value={player.id} />
                          <input
                            name="startggUsername"
                            defaultValue={player.startggUsername}
                            disabled={!canControl || player.hasTournamentHistory}
                            className="min-w-0 rounded border border-metal-700 bg-black/30 px-2 py-1 text-xs text-white disabled:opacity-40"
                          />
                          <button
                            className="rounded border border-metal-700 px-3 py-1 text-xs font-bold uppercase text-metal-300 hover:border-ember-300/50 hover:text-white disabled:opacity-40"
                            disabled={!canControl || player.hasTournamentHistory}
                            type="submit"
                          >
                            Save Name
                          </button>
                        </form>
                        <form action={setPlayerActiveStatusAction}>
                          <input type="hidden" name="playerId" value={player.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={player.active ? "false" : "true"}
                          />
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              Session
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Admin Access</h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AdminInactivityTimer expiresAt={session.expiresAt} />
              <form action={adminLogoutAction}>
                <button className="rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                  Log Out
                </button>
              </form>
            </div>
            <DebugSnapshotDownload action={downloadDebugSnapshotAction} disabled={!canControl} />
          </section>
          <section className="metal-panel rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
              Audit
            </p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">Recent Actions</h2>
            <div className="mt-4 grid gap-2">
              {auditRecords.length === 0 ? (
                <p className="text-sm text-metal-300">
                  No admin actions recorded in this server process yet.
                </p>
              ) : (
                auditRecords.map((record) => (
                  <article
                    key={record.id}
                    className="rounded border border-metal-700 bg-black/25 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-white">{record.action.replaceAll("_", " ")}</p>
                      <p className="font-mono text-xs text-metal-300">{record.createdAt}</p>
                    </div>
                    <p className="mt-1 text-metal-300">{record.summary}</p>
                    {record.reason ? (
                      <p className="mt-1 text-xs text-ember-300">Reason: {record.reason}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-metal-400">
                      Session {record.sessionId.slice(0, 8)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
          <form action={addInactivePlayerToCurrentRoundAction}>
            <input type="hidden" name="roundNumber" value={currentRoundNumber} />
            <DangerousActionDialog
              action="add an inactive player to current round eligibility"
              consequence="make that player eligible for the selected current round"
              disabled={!canControl}
              summaryItems={[
                { label: "Player", fieldName: "playerId" },
                { label: "Round", fieldName: "roundNumber" },
              ]}
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
              <p className="mt-4 rounded border border-metal-700 bg-black/25 px-3 py-2 text-sm font-bold uppercase text-metal-300">
                Round {currentRoundNumber}
              </p>
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
