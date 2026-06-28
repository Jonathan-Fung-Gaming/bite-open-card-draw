import { AdminLayout, DangerousActionDialog, HostLockBadge, TournamentLogo } from "@/components";
import { adminState } from "@/lib/server/admin-state";
import { getAdminSessionFromCookies } from "@/lib/server/admin-auth";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";
import {
  addInactivePlayerToCurrentRoundAction,
  addPlayerAction,
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
  pauseVotingAction,
  rerollFullRoundAction,
  rerollOneChartAction,
  rerollRoundSetAction,
  resumeVotingAction,
  setPlayerActiveStatusAction,
  takeHostControlAction,
} from "./actions";
import { AdminInactivityTimer } from "./_components/AdminInactivityTimer";
import { HostHeartbeat } from "./_components/HostHeartbeat";
import { ManualBallotForm } from "./_components/ManualBallotForm";
import { PrivateCsvDownload } from "./_components/PrivateCsvDownload";
import { getRoundDrawRecords, getSubmittedPlayerIdsForRound, getVotingRoundSnapshot } from "@/lib/server/voting-round";
import { formatVotingTime } from "@/lib/vote/voting-window";

type AdminPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

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

  const hostSnapshot = adminState.hostLockStore.getSnapshot(session.sessionId);
  const players = adminState.rosterStore.listPlayers();
  const inactivePlayers = players.filter((player) => !player.active);
  const activeCount = adminState.rosterStore.getActivePlayerCount();
  const canControl = hostSnapshot.status === "active";
  const currentRoundNumber = 1;
  const votingSnapshot = getVotingRoundSnapshot(currentRoundNumber);
  const currentRoundDraws = getRoundDrawRecords(currentRoundNumber);
  const submittedPlayerIds = getSubmittedPlayerIdsForRound(currentRoundNumber);
  const result = adminState.resultStore.getRoundResult(currentRoundNumber);
  const drawControls = ROUND_SET_DEFINITIONS.map((set) => ({
    set,
    activeDraw: adminState.drawStateStore.getActiveDraw(set.roundNumber, set.setOrder),
    historyCount: adminState.drawStateStore.getDrawHistory(set.roundNumber, set.setOrder).length,
  }));

  return (
    <AdminLayout hostStatus={hostSnapshot.status}>
      <HostHeartbeat active={hostSnapshot.status === "active"} />
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          {error ? (
            <section className="rounded-lg border border-ember-500/35 bg-ember-900/20 p-4 text-sm text-ember-300">
              {error}
            </section>
          ) : null}
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
            canSubmitManualBallot={votingSnapshot.canAcceptManualBallot && !result}
          />
          <section className="metal-panel rounded-lg p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
                  Draw Controls
                </p>
                <h2 className="mt-1 text-2xl font-black uppercase text-white">All Rounds</h2>
              </div>
              <form action={rerollFullRoundAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
              <form action={takeHostControlAction}>
                <button className="button-metal rounded px-4 py-2 font-bold uppercase" type="submit">
                  Take Host Control
                </button>
              </form>
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
