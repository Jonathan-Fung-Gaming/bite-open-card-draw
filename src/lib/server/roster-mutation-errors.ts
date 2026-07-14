import "server-only";

export function safeRosterMutationMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (!message) {
    return fallback;
  }

  if (/admin session required/i.test(message)) {
    return "Admin session required. Sign in again and retry.";
  }

  if (/host control is required/i.test(message)) {
    return "Host control is required for this action.";
  }

  if (/unavailable until the Phase 4 database migration is applied/i.test(message)) {
    return "Roster changes are temporarily unavailable while the Phase 4 database migration is applied.";
  }

  if (
    /roster version changed|the roster changed before this update committed|changed before (?:rename|the status update)|updated since/i.test(
      message,
    )
  ) {
    return "The roster changed before this update committed. Refresh and try again.";
  }

  if (/tournament history/i.test(message)) {
    return "Cannot edit a start.gg username after tournament history exists.";
  }

  if (
    /active start\.gg username already exists|duplicate start\.gg usernames|active player already uses that start\.gg username/i.test(
      message,
    )
  ) {
    return "An active player already uses that start.gg username.";
  }

  if (
    /players? (?:were |was )?not found|selected roster player could not be found/i.test(message)
  ) {
    return "A selected roster player could not be found. Refresh and try again.";
  }

  if (/requestId has already been used|roster request could not be retried safely/i.test(message)) {
    return "This roster request could not be retried safely. Refresh and try again.";
  }

  if (/each roster batch may change a player only once|duplicate playerId/i.test(message)) {
    return "Each roster update may change a player only once.";
  }

  if (/start\.gg username must be 100 characters or fewer/i.test(message)) {
    return "start.gg username must be 100 characters or fewer.";
  }

  return fallback;
}
