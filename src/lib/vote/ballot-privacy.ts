import { createHash, timingSafeEqual } from "node:crypto";
import type { PublicBallotLookup, PublicEditableBallot, RoundBallot } from "./ballot";

export const BALLOT_EDIT_TOKEN_MIN_LENGTH = 16;
export const BALLOT_EDIT_TOKEN_MAX_LENGTH = 128;
export const DUPLICATE_BALLOT_WARNING =
  "A ballot already exists for this start.gg username.";

function isValidEditToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= BALLOT_EDIT_TOKEN_MIN_LENGTH &&
    token.length <= BALLOT_EDIT_TOKEN_MAX_LENGTH
  );
}

export function assertValidBallotEditToken(token: unknown): asserts token is string {
  if (!isValidEditToken(token)) {
    throw new Error("A valid ballot edit token is required.");
  }
}

export function hashBallotEditToken(token: string) {
  assertValidBallotEditToken(token);

  return createHash("sha256").update(token, "utf8").digest("hex");
}

function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isBallotEditTokenAuthorized(ballot: RoundBallot, token: unknown) {
  if (!ballot.editTokenHash || !isValidEditToken(token)) {
    return false;
  }

  return hashesMatch(ballot.editTokenHash, hashBallotEditToken(token));
}

export function toPublicEditableBallot(ballot: RoundBallot): PublicEditableBallot {
  return {
    id: ballot.id,
    roundNumber: ballot.roundNumber,
    playerId: ballot.playerId,
    playerStartggUsername: ballot.playerStartggUsername,
    submittedAt: ballot.submittedAt,
    revision: ballot.revision,
    source: ballot.source,
    manualReason: ballot.manualReason,
    manualOverride: ballot.manualOverride,
    replacedExistingBallot: ballot.replacedExistingBallot,
    choices: ballot.choices.map((choice) => ({
      ...choice,
      bannedChartIds: [...choice.bannedChartIds],
    })),
  };
}

export function buildPublicBallotLookup(
  ballot: RoundBallot | null,
  editToken?: string,
): PublicBallotLookup {
  if (!ballot) {
    return {
      exists: false,
      revision: null,
      canEdit: false,
      warning: null,
      ballot: null,
    };
  }

  const canEdit = isBallotEditTokenAuthorized(ballot, editToken);

  return {
    exists: true,
    revision: ballot.revision,
    canEdit,
    warning: canEdit ? null : DUPLICATE_BALLOT_WARNING,
    ballot: canEdit ? toPublicEditableBallot(ballot) : null,
  };
}
