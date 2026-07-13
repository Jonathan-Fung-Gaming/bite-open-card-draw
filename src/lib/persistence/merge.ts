import {
  cloneOperationalStateSnapshot,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { resultRevealPhaseRank } from "@/lib/results/reveal-phase-order";
import {
  createDefaultPublicStateGenerationSnapshot,
  type PublicStateGenerationRecord,
  type PublicStateGenerationStoreSnapshot,
} from "@/lib/round/public-state-generation";
import type { RoundBallot } from "@/lib/vote/ballot";

type MergeInput = {
  baseline: OperationalStateSnapshot | null;
  current: OperationalStateSnapshot;
  latest: OperationalStateSnapshot | null;
};

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

function changed<T>(baseline: T | undefined, current: T | undefined) {
  return stableJson(baseline ?? null) !== stableJson(current ?? null);
}

function byKey<T>(items: readonly T[], keyFor: (item: T) => string) {
  return new Map(items.map((item) => [keyFor(item), item]));
}

function reconcileByKey<T>(
  baselineItems: readonly T[],
  currentItems: readonly T[],
  latestItems: readonly T[],
  keyFor: (item: T) => string,
  resolve: (current: T, latest: T | undefined) => T = (current) => current,
) {
  const baseline = byKey(baselineItems, keyFor);
  const current = byKey(currentItems, keyFor);
  const merged = byKey(latestItems, keyFor);

  for (const [key, baselineItem] of baseline) {
    if (!current.has(key)) {
      merged.delete(key);
      continue;
    }

    const currentItem = current.get(key);

    if (changed(baselineItem, currentItem)) {
      merged.set(key, resolve(currentItem as T, merged.get(key)));
    }
  }

  for (const [key, currentItem] of current) {
    if (!baseline.has(key)) {
      merged.set(key, resolve(currentItem, merged.get(key)));
    }
  }

  return [...merged.values()];
}

function unionByKey<T>(items: readonly T[][], keyFor: (item: T) => string) {
  const merged = new Map<string, T>();

  for (const group of items) {
    for (const item of group) {
      merged.set(keyFor(item), item);
    }
  }

  return [...merged.values()];
}

function ballotKey(ballot: RoundBallot) {
  return `${ballot.roundNumber}:${ballot.playerId}`;
}

function ballotTime(ballot: RoundBallot) {
  const parsed = Date.parse(ballot.submittedAt);

  return Number.isFinite(parsed) ? parsed : 0;
}

function latestBallot(current: RoundBallot, latest: RoundBallot | undefined) {
  if (!latest) {
    return current;
  }

  if (current.revision > latest.revision) {
    return current;
  }

  if (current.revision < latest.revision) {
    return latest;
  }

  return ballotTime(current) >= ballotTime(latest) ? current : latest;
}

function resultTime(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function publicStateGenerationTime(record: PublicStateGenerationRecord) {
  const parsed = record.updatedAt ? Date.parse(record.updatedAt) : NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function mergePublicStateGenerations(
  ...snapshots: Array<PublicStateGenerationStoreSnapshot | null | undefined>
): PublicStateGenerationStoreSnapshot {
  const merged = new Map<number, PublicStateGenerationRecord>();

  for (const snapshot of snapshots) {
    const rounds = snapshot?.rounds ?? createDefaultPublicStateGenerationSnapshot().rounds;

    for (const record of rounds) {
      const existing = merged.get(record.roundNumber);
      const shouldReplace =
        !existing ||
        record.generation > existing.generation ||
        (record.generation === existing.generation &&
          publicStateGenerationTime(record) >= publicStateGenerationTime(existing));

      if (shouldReplace) {
        merged.set(record.roundNumber, {
          ...record,
          activeDraws: record.activeDraws.map((draw) => ({ ...draw })),
          tiebreakStarts: record.tiebreakStarts.map((start) => ({ ...start })),
        });
      }
    }
  }

  return {
    rounds: [...merged.values()].sort((left, right) => left.roundNumber - right.roundNumber),
  };
}

function monotonicResult(
  current: RoundResultSnapshot,
  latest: RoundResultSnapshot | undefined,
): RoundResultSnapshot {
  if (!latest) {
    return current;
  }

  const currentRank = resultRevealPhaseRank(current.revealPhase);
  const latestRank = resultRevealPhaseRank(latest.revealPhase);

  if (currentRank > latestRank) {
    return current;
  }

  if (currentRank < latestRank) {
    return latest;
  }

  const chosen =
    resultTime(current.revealPhaseStartedAt) >= resultTime(latest.revealPhaseStartedAt)
      ? current
      : latest;
  const other = chosen === current ? latest : current;

  return {
    ...chosen,
    finalRevealedAt: chosen.finalRevealedAt ?? other.finalRevealedAt,
    sets: [
      {
        ...chosen.sets[0],
        winnerRevealStartedAt:
          chosen.sets[0].winnerRevealStartedAt ?? other.sets[0].winnerRevealStartedAt,
      },
      {
        ...chosen.sets[1],
        winnerRevealStartedAt:
          chosen.sets[1].winnerRevealStartedAt ?? other.sets[1].winnerRevealStartedAt,
      },
    ],
  };
}

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sortByRound<T extends { roundNumber: number }>(items: T[]) {
  return items.sort((left, right) => left.roundNumber - right.roundNumber);
}

function sortDraws<T extends { roundNumber: number; setOrder: number; version: number }>(
  items: T[],
) {
  return items.sort(
    (left, right) =>
      left.roundNumber - right.roundNumber ||
      left.setOrder - right.setOrder ||
      left.version - right.version,
  );
}

function resolveHostLock(
  baseline: OperationalStateSnapshot["hostLock"],
  current: OperationalStateSnapshot["hostLock"],
  latest: OperationalStateSnapshot["hostLock"],
) {
  if (!changed(baseline, current)) {
    return latest;
  }

  if (!changed(baseline, latest)) {
    return current;
  }

  if (!current.lock) {
    return latest;
  }

  if (!latest.lock) {
    return current;
  }

  if (current.lock.ownerSessionId !== latest.lock.ownerSessionId) {
    return current.lock.acquiredAt >= latest.lock.acquiredAt ? current : latest;
  }

  return current.lock.heartbeatAt >= latest.lock.heartbeatAt ? current : latest;
}

export function mergeOperationalStateSnapshots({
  baseline,
  current,
  latest,
}: MergeInput): OperationalStateSnapshot {
  if (!latest || !baseline) {
    const merged = cloneOperationalStateSnapshot(current);

    merged.publicStateGeneration = mergePublicStateGenerations(
      baseline?.publicStateGeneration,
      current.publicStateGeneration,
      latest?.publicStateGeneration,
    );

    return merged;
  }

  const merged = cloneOperationalStateSnapshot(latest);

  merged.schemaVersion = current.schemaVersion;
  merged.savedAt = current.savedAt;
  merged.publicStateGeneration = mergePublicStateGenerations(
    baseline.publicStateGeneration,
    current.publicStateGeneration,
    latest.publicStateGeneration,
  );

  merged.audit.records = sortByCreatedAtDesc(
    unionByKey(
      [baseline.audit.records, latest.audit.records, current.audit.records],
      (record) => record.id,
    ),
  );

  merged.hostLock = resolveHostLock(baseline.hostLock, current.hostLock, latest.hostLock);

  merged.roster.players = reconcileByKey(
    baseline.roster.players,
    current.roster.players,
    latest.roster.players,
    (player) => player.id,
  ).sort((left, right) => left.startggUsername.localeCompare(right.startggUsername));
  merged.roster.currentRoundEligibility = sortByRound(
    reconcileByKey(
      baseline.roster.currentRoundEligibility,
      current.roster.currentRoundEligibility,
      latest.roster.currentRoundEligibility,
      (entry) => `${entry.roundNumber}:${entry.playerId}`,
    ),
  );

  merged.draw.drawHistory = sortDraws(
    reconcileByKey(
      baseline.draw.drawHistory,
      current.draw.drawHistory,
      latest.draw.drawHistory,
      (draw) => draw.id,
    ),
  );
  merged.draw.chartExclusions = reconcileByKey(
    baseline.draw.chartExclusions ?? [],
    current.draw.chartExclusions ?? [],
    latest.draw.chartExclusions ?? [],
    (exclusion) => exclusion.chartKey,
  ).sort((left, right) => left.chartKey.localeCompare(right.chartKey));
  merged.draw.excludedChartKeys = merged.draw.chartExclusions
    ?.filter((exclusion) => exclusion.excluded)
    .map((exclusion) => exclusion.chartKey)
    .sort();

  if (changed(baseline.draw.selectedSongKeys, current.draw.selectedSongKeys)) {
    merged.draw.selectedSongKeys = [...current.draw.selectedSongKeys].sort();
  }

  merged.votingWindow.windows = sortByRound(
    reconcileByKey(
      baseline.votingWindow.windows,
      current.votingWindow.windows,
      latest.votingWindow.windows,
      (window) => String(window.roundNumber),
    ),
  );

  merged.ballot.ballots = sortByRound(
    reconcileByKey(
      baseline.ballot.ballots,
      current.ballot.ballots,
      latest.ballot.ballots,
      ballotKey,
      latestBallot,
    ),
  );
  merged.ballot.ballotInvalidations = reconcileByKey(
    baseline.ballot.ballotInvalidations ?? [],
    current.ballot.ballotInvalidations ?? [],
    latest.ballot.ballotInvalidations ?? [],
    (record) => record.id,
  ).sort((left, right) => right.invalidatedAt.localeCompare(left.invalidatedAt));
  merged.ballot.phoneStatus = sortByRound(
    reconcileByKey(
      baseline.ballot.phoneStatus,
      current.ballot.phoneStatus,
      latest.ballot.phoneStatus,
      (entry) => String(entry.roundNumber),
    ),
  );
  merged.ballot.presenceClaims = reconcileByKey(
    baseline.ballot.presenceClaims ?? [],
    current.ballot.presenceClaims ?? [],
    latest.ballot.presenceClaims ?? [],
    (claim) => `${claim.roundNumber}:${claim.playerId}:${claim.deviceId}`,
  ).sort((left, right) => left.claimedAt.localeCompare(right.claimedAt));
  merged.ballot.deviceBindings = reconcileByKey(
    baseline.ballot.deviceBindings ?? [],
    current.ballot.deviceBindings ?? [],
    latest.ballot.deviceBindings ?? [],
    (binding) => binding.deviceId,
  ).sort((left, right) => left.boundAt.localeCompare(right.boundAt));

  merged.result.results = sortByRound(
    reconcileByKey(
      baseline.result.results,
      current.result.results,
      latest.result.results,
      (result) => String(result.roundNumber),
      monotonicResult,
    ),
  );

  if (changed(baseline.roundState, current.roundState)) {
    merged.roundState = cloneOperationalStateSnapshot(current).roundState;
  }

  return merged;
}
