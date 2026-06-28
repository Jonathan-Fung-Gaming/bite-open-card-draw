import { randomUUID } from "node:crypto";

export type RosterPlayer = {
  id: string;
  startggUsername: string;
  normalizedUsername: string;
  active: boolean;
  hasTournamentHistory: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CurrentRoundEligibilityEntry = {
  playerId: string;
  roundNumber: 1 | 2 | 3 | 4;
  reason: string;
  addedAt: string;
};

export function normalizeStartggUsername(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export class RosterStore {
  private players = new Map<string, RosterPlayer>();
  private currentRoundEligibility: CurrentRoundEligibilityEntry[] = [];

  listPlayers() {
    return [...this.players.values()].sort((left, right) =>
      left.startggUsername.localeCompare(right.startggUsername),
    );
  }

  getActivePlayerCount() {
    return this.listPlayers().filter((player) => player.active).length;
  }

  getPlayer(playerId: string) {
    return this.players.get(playerId) ?? null;
  }

  createOrUpdatePlayer(input: {
    playerId?: string;
    startggUsername: string;
    active?: boolean;
    now?: string;
  }) {
    const now = input.now ?? new Date().toISOString();
    const normalizedUsername = normalizeStartggUsername(input.startggUsername);

    if (!normalizedUsername) {
      throw new Error("start.gg username is required.");
    }

    const existing = input.playerId ? this.players.get(input.playerId) : null;
    const active = input.active ?? existing?.active ?? true;
    const duplicateActive = this.listPlayers().find(
      (player) =>
        player.id !== input.playerId && player.active && active && player.normalizedUsername === normalizedUsername,
    );

    if (duplicateActive) {
      throw new Error(`Active start.gg username already exists: ${input.startggUsername.trim()}`);
    }

    if (existing?.hasTournamentHistory && existing.normalizedUsername !== normalizedUsername) {
      throw new Error("Cannot edit a start.gg username after tournament history exists.");
    }

    const player: RosterPlayer = {
      id: existing?.id ?? randomUUID(),
      startggUsername: input.startggUsername.trim(),
      normalizedUsername,
      active,
      hasTournamentHistory: existing?.hasTournamentHistory ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.players.set(player.id, player);

    return player;
  }

  bulkImport(usernames: string[], now = new Date().toISOString()) {
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const username of usernames.map((value) => value.trim()).filter(Boolean)) {
      try {
        const existing = this.listPlayers().find(
          (player) => player.normalizedUsername === normalizeStartggUsername(username),
        );

        if (existing) {
          results.skipped += 1;
          continue;
        }

        this.createOrUpdatePlayer({ startggUsername: username, active: true, now });
        results.created += 1;
      } catch (error) {
        results.errors.push(error instanceof Error ? error.message : "Unknown roster import error");
      }
    }

    return results;
  }

  setPlayerActiveStatus(playerId: string, active: boolean, now = new Date().toISOString()) {
    const player = this.players.get(playerId);

    if (!player) {
      throw new Error("Player not found.");
    }

    if (active) {
      const duplicateActive = this.listPlayers().find(
        (candidate) =>
          candidate.id !== playerId &&
          candidate.active &&
          candidate.normalizedUsername === player.normalizedUsername,
      );

      if (duplicateActive) {
        throw new Error(`Active start.gg username already exists: ${player.startggUsername}`);
      }
    }

    const updated = {
      ...player,
      active,
      updatedAt: now,
    };

    this.players.set(playerId, updated);

    return updated;
  }

  addPlayerToCurrentRoundEligibility(input: {
    playerId: string;
    roundNumber: 1 | 2 | 3 | 4;
    reason: string;
    now?: string;
  }) {
    const player = this.players.get(input.playerId);

    if (!player) {
      throw new Error("Player not found.");
    }

    if (!input.reason.trim()) {
      throw new Error("Audit reason is required.");
    }

    const existing = this.currentRoundEligibility.find(
      (entry) => entry.playerId === input.playerId && entry.roundNumber === input.roundNumber,
    );

    if (existing) {
      return existing;
    }

    const entry = {
      playerId: input.playerId,
      roundNumber: input.roundNumber,
      reason: input.reason.trim(),
      addedAt: input.now ?? new Date().toISOString(),
    };

    this.currentRoundEligibility.push(entry);

    return entry;
  }

  listCurrentRoundEligibility() {
    return [...this.currentRoundEligibility];
  }
}
