"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { ChartArtImage } from "@/components";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { BallotSetChoice, PublicBallotLookup, PublicEditableBallot } from "@/lib/vote/ballot";
import {
  formatBallotSaveFailureMessage,
  VOTE_LIVE_POLL_INTERVAL_MS,
  VOTER_PRESENCE_REFRESH_INTERVAL_MS,
} from "@/lib/vote/phone-view";
import type { EligiblePlayerSnapshot, VotingRoundStatus } from "@/lib/vote/voting-window";
import {
  activeDrawGenerationFromDraws,
  classifyVoteLiveProjectionChange,
  compareVoteLiveGeneration,
  isStaleBallotStateError,
  reconcileChoicesForActiveDraws,
  shouldAcceptVoteLivePoll,
  shouldRequestVoteRouteRefresh,
} from "@/lib/vote/live-generation";
import {
  claimVoterPresenceAction,
  getExistingBallotAction,
  getVoteLiveStateAction,
  submitRoundBallotAction,
} from "./actions";

export type BallotFlowProps = {
  closesAt: string | null;
  eligibleCount: number;
  remainingMs: number;
  roundNumber: 1 | 2 | 3 | 4;
  players: EligiblePlayerSnapshot[];
  publicStateGeneration: number;
  draws: DrawRecord[];
  serverNowMs: number;
  statusLabel: string;
  status: VotingRoundStatus;
  submittedCount: number;
  timerText: string;
  turnoutText: string;
  canSubmit: boolean;
  onLiveStateChange?: (state: VoteLiveState) => void;
};

export type VoteLiveState = {
  canSubmit: boolean;
  closesAt: string | null;
  eligibleCount: number;
  remainingMs: number;
  serverNowMs: number;
  status: VotingRoundStatus;
  statusLabel: string;
  submittedCount: number;
  timerText: string;
  turnoutText: string;
};

const IDENTITY_STORAGE_KEY = "bite-open-card-draw:startgg-identity:v1";
const DEVICE_STORAGE_KEY = "bite-open-card-draw:device-id:v1";
const EDIT_TOKEN_STORAGE_KEY = "bite-open-card-draw:ballot-edit-tokens:v1";
const DRAFT_STORAGE_KEY = "bite-open-card-draw:ballot-drafts:v1";
const IDENTITY_CONFIRMATION_STORAGE_PREFIX = "bite-open-card-draw:identity-confirmation-seen:v1";
const BAN_INSTRUCTION_STORAGE_PREFIX = "bite-open-card-draw:ban-instruction-seen:v1";
const BAN_INSTRUCTION_PAUSE_MS = 2_000;
const BAN_INSTRUCTION_FADE_MS = 900;
const STALE_BALLOT_REFRESH_MESSAGE =
  "Voting state changed before your ballot could save. Your selections remain here while the latest chart state loads.";
const REROLL_BALLOT_MESSAGE =
  "The chart draw changed. Your identity is preserved; review the current chart sets and submit a new ballot.";
const INVALIDATED_BALLOT_MESSAGE =
  "The chart draw changed after your ballot was saved. Your previous ballot was invalidated; please review the current chart sets and submit again.";

function preserveConfirmedBallotGuidance(current: string | null, fallback: string) {
  return current === REROLL_BALLOT_MESSAGE || current === INVALIDATED_BALLOT_MESSAGE
    ? current
    : fallback;
}

function staleBallotRefreshMessage(current: string | null) {
  return preserveConfirmedBallotGuidance(current, STALE_BALLOT_REFRESH_MESSAGE);
}

type StoredBallotDraft = {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  drawIds: string[];
  choices: BallotSetChoice[];
  step: number;
  updatedAt: string;
};

type PresenceClaimResult = {
  claimKey: string;
  hasOtherActiveDevice: boolean;
  ok: boolean;
};

function emptyChoices(draws: DrawRecord[]): BallotSetChoice[] {
  return draws.map((draw) => ({
    drawId: draw.id,
    roundSetId: draw.roundSetId,
    displayLabel: draw.displayLabel,
    noBans: false,
    bannedChartIds: [],
  }));
}

function readRememberedIdentity() {
  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      playerId?: unknown;
      startggUsername?: unknown;
      locked?: unknown;
    };

    return typeof parsed.playerId === "string" && typeof parsed.startggUsername === "string"
      ? {
          playerId: parsed.playerId,
          startggUsername: parsed.startggUsername,
          locked: parsed.locked === true,
        }
      : null;
  } catch {
    return null;
  }
}

function rememberIdentity(player: EligiblePlayerSnapshot, locked = false) {
  const existing = readRememberedIdentity();

  window.localStorage.setItem(
    IDENTITY_STORAGE_KEY,
    JSON.stringify({
      playerId: player.id,
      startggUsername: player.startggUsername,
      locked:
        locked ||
        Boolean(
          existing?.locked &&
          (existing.playerId === player.id || existing.startggUsername === player.startggUsername),
        ),
    }),
  );
}

function forgetRememberedIdentity() {
  window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
}

function getDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);

  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }

  return deviceId;
}

function voterPresenceClaimKey(roundNumber: 1 | 2 | 3 | 4, playerId: string, deviceId: string) {
  return `${roundNumber}:${playerId}:${deviceId}`;
}

function editTokenKey(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return `${roundNumber}:${playerId}`;
}

function readStoredEditTokens() {
  try {
    const raw = window.localStorage.getItem(EDIT_TOKEN_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeStoredEditTokens(tokens: Record<string, string>) {
  window.localStorage.setItem(EDIT_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

function readBallotEditToken(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return readStoredEditTokens()[editTokenKey(roundNumber, playerId)] ?? null;
}

function getBallotEditToken(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  const key = editTokenKey(roundNumber, playerId);
  const tokens = readStoredEditTokens();
  const existing = tokens[key];

  if (existing) {
    return existing;
  }

  const token = window.crypto.randomUUID();
  writeStoredEditTokens({
    ...tokens,
    [key]: token,
  });

  return token;
}

function draftKey(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return `${roundNumber}:${playerId}`;
}

function flowKey(
  prefix: string,
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  draws: readonly DrawRecord[],
) {
  return [prefix, roundNumber, playerId, draws.map((draw) => draw.id).join(",")].join(":");
}

function identityConfirmationKey(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return [IDENTITY_CONFIRMATION_STORAGE_PREFIX, roundNumber, playerId].join(":");
}

function banInstructionKey(
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  draws: readonly DrawRecord[],
) {
  return flowKey(BAN_INSTRUCTION_STORAGE_PREFIX, roundNumber, playerId, draws);
}

function hasSeenIdentityConfirmation(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  try {
    return window.sessionStorage.getItem(identityConfirmationKey(roundNumber, playerId)) === "1";
  } catch {
    return false;
  }
}

function markIdentityConfirmationSeen(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  try {
    window.sessionStorage.setItem(identityConfirmationKey(roundNumber, playerId), "1");
  } catch {
    // The checkbox still gates this render even if session storage is unavailable.
  }
}

function hasSeenBanInstruction(
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  draws: readonly DrawRecord[],
) {
  try {
    return window.sessionStorage.getItem(banInstructionKey(roundNumber, playerId, draws)) === "1";
  } catch {
    return false;
  }
}

function markBanInstructionSeen(
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  draws: readonly DrawRecord[],
) {
  try {
    window.sessionStorage.setItem(banInstructionKey(roundNumber, playerId, draws), "1");
  } catch {
    // If session storage is unavailable, the instruction still behaves correctly for this render.
  }
}

function readStoredDrafts(): Record<string, StoredBallotDraft> {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, StoredBallotDraft>;

    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredDrafts(drafts: Record<string, StoredBallotDraft>) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function clearBallotDraft(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  const drafts = readStoredDrafts();
  delete drafts[draftKey(roundNumber, playerId)];
  writeStoredDrafts(drafts);
}

function writeBallotDraft(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  draws: DrawRecord[];
  choices: BallotSetChoice[];
  step: number;
}) {
  const drafts = readStoredDrafts();

  writeStoredDrafts({
    ...drafts,
    [draftKey(input.roundNumber, input.playerId)]: {
      roundNumber: input.roundNumber,
      playerId: input.playerId,
      drawIds: input.draws.map((draw) => draw.id),
      choices: input.choices.map((choice) => ({
        ...choice,
        bannedChartIds: [...choice.bannedChartIds],
      })),
      step: input.step,
      updatedAt: new Date().toISOString(),
    },
  });
}

function choicesForDraws(draws: DrawRecord[], sourceChoices: readonly BallotSetChoice[]) {
  return draws.map((draw) => {
    const existing = sourceChoices.find((choice) => choice?.drawId === draw.id);
    const chartIds = new Set(draw.charts.map((chart) => chart.id));
    const bannedChartIds =
      existing?.bannedChartIds.filter((chartId) => chartIds.has(chartId)) ?? [];

    return {
      drawId: draw.id,
      roundSetId: draw.roundSetId,
      displayLabel: draw.displayLabel,
      noBans: Boolean(existing?.noBans) && bannedChartIds.length === 0,
      bannedChartIds,
    };
  });
}

function choicesFromBallot(draws: DrawRecord[], ballot: PublicEditableBallot) {
  return choicesForDraws(draws, ballot.choices);
}

function readBallotDraft(roundNumber: 1 | 2 | 3 | 4, playerId: string, draws: DrawRecord[]) {
  const draft = readStoredDrafts()[draftKey(roundNumber, playerId)];

  if (!draft || draft.roundNumber !== roundNumber || draft.playerId !== playerId) {
    return { status: "missing" as const };
  }

  const drawIds = draws.map((draw) => draw.id);
  const hasCurrentDraws =
    draft.drawIds.length === drawIds.length &&
    draft.drawIds.every((drawId, index) => drawId === drawIds[index]);

  if (!hasCurrentDraws) {
    clearBallotDraft(roundNumber, playerId);

    return { status: "stale" as const };
  }

  return {
    status: "loaded" as const,
    choices: choicesForDraws(draws, draft.choices),
    step: Math.min(Math.max(draft.step, 0), draws.length),
  };
}

function describeChoice(draw: DrawRecord | undefined, choice: BallotSetChoice) {
  if (choice.noBans) {
    return "No bans for this set";
  }

  if (!draw || choice.bannedChartIds.length === 0) {
    return `${choice.bannedChartIds.length} ban selection(s)`;
  }

  const names = choice.bannedChartIds.map((chartId) => {
    const chart = draw.charts.find((candidate) => candidate.id === chartId);

    return chart ? chart.name : chartId;
  });

  return names.join(", ");
}

function selectedBanCharts(draw: DrawRecord | undefined, choice: BallotSetChoice) {
  if (!draw || choice.noBans) {
    return [];
  }

  return choice.bannedChartIds
    .map((chartId) => draw.charts.find((candidate) => candidate.id === chartId))
    .filter((chart): chart is DrawRecord["charts"][number] => Boolean(chart));
}

function feedbackRole(message: string) {
  return /failed|could not|not open|disabled|warning|another active device/i.test(message)
    ? "alert"
    : "status";
}

export function BallotFlow({
  closesAt,
  eligibleCount,
  roundNumber,
  players,
  publicStateGeneration,
  draws,
  serverNowMs,
  statusLabel,
  status,
  submittedCount,
  remainingMs,
  timerText,
  turnoutText,
  canSubmit: initialCanSubmit,
  onLiveStateChange,
}: BallotFlowProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => emptyChoices(draws));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [banInstructionVisible, setBanInstructionVisible] = useState(false);
  const [banInstructionFading, setBanInstructionFading] = useState(false);
  const [banInstructionControlsPaused, setBanInstructionControlsPaused] = useState(false);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(null);
  const [presenceWarningReadyToContinueKey, setPresenceWarningReadyToContinueKey] = useState<
    string | null
  >(null);
  const [presencePending, setPresencePending] = useState(false);
  const [existingBallot, setExistingBallot] = useState<PublicEditableBallot | null>(null);
  const [existingBallotLookup, setExistingBallotLookup] = useState<PublicBallotLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [deviceIdentityLocked, setDeviceIdentityLocked] = useState(false);
  const [unavailableLockedIdentity, setUnavailableLockedIdentity] = useState<{
    playerId: string;
    startggUsername: string;
  } | null>(null);
  const [liveCanSubmit, setLiveCanSubmit] = useState(initialCanSubmit);
  const [liveProjectionRefreshing, setLiveProjectionRefreshing] = useState(false);
  const [liveStatusLabel, setLiveStatusLabel] = useState(statusLabel);
  const [liveStatus, setLiveStatus] = useState<VotingRoundStatus>(status);
  const [liveTimerText, setLiveTimerText] = useState(timerText);
  const [liveTurnoutText, setLiveTurnoutText] = useState(turnoutText);
  const [isPending, startTransition] = useTransition();
  const initializedIdentityRef = useRef(false);
  const lastPresenceClaimRef = useRef<{ claimedAtMs: number; key: string } | null>(null);
  const lookupRequestRef = useRef(0);
  const pollRequestSequenceRef = useRef(0);
  const acceptedPollRef = useRef({
    generation: {
      generation: publicStateGeneration,
      activeDraws: activeDrawGenerationFromDraws(draws),
    },
    requestSequence: 0,
  });
  const refreshRequestedRef = useRef(false);
  const routeRefreshAttemptRef = useRef<{
    attemptedAtMs: number;
    targetGeneration: number;
  } | null>(null);
  const banInstructionTimersRef = useRef<number[]>([]);
  const confirmedRef = useRef(false);
  const existingBallotRef = useRef<PublicEditableBallot | null>(null);
  const existingBallotLookupExistsRef = useRef(false);
  const savedAtRef = useRef<string | null>(null);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const alreadySubmitted = existingBallotLookup?.exists === true;
  const isPaused = liveStatus === "voting_paused";
  const changesUnavailableCopy = liveProjectionRefreshing
    ? "Voting state is updating. Your selections and saved ballot remain unchanged."
    : isPaused
      ? "Voting is paused. Your selections are still here; continue after voting resumes."
      : "Voting is not accepting ballot changes right now.";
  const editingSavedBallot = confirmed && !savedAt && Boolean(existingBallot);
  const ballotControlsDisabled = !liveCanSubmit || banInstructionControlsPaused;
  const currentDraw = draws[step];
  const currentChoice = choices[step];
  const canSubmit = choices.every(
    (choice) =>
      (choice.noBans && choice.bannedChartIds.length === 0) ||
      (!choice.noBans && choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2),
  );
  const requestRouteRefresh = useCallback(
    (targetGeneration: number) => {
      const nowMs = Date.now();

      refreshRequestedRef.current = true;
      if (
        !shouldRequestVoteRouteRefresh({
          lastAttempt: routeRefreshAttemptRef.current,
          nowMs,
          retryAfterMs: VOTE_LIVE_POLL_INTERVAL_MS,
          targetGeneration,
        })
      ) {
        return;
      }

      routeRefreshAttemptRef.current = { attemptedAtMs: nowMs, targetGeneration };
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    confirmedRef.current = confirmed;
  }, [confirmed]);

  useEffect(() => {
    existingBallotRef.current = existingBallot;
  }, [existingBallot]);

  useEffect(() => {
    existingBallotLookupExistsRef.current = existingBallotLookup?.exists === true;
  }, [existingBallotLookup?.exists]);

  useEffect(() => {
    savedAtRef.current = savedAt;
  }, [savedAt]);

  useEffect(
    () => () => {
      banInstructionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      banInstructionTimersRef.current = [];
    },
    [],
  );

  const startBanInstructionIfNeeded = useCallback(
    (playerId: string) => {
      if (hasSeenBanInstruction(roundNumber, playerId, draws)) {
        return;
      }

      banInstructionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      banInstructionTimersRef.current = [];
      setBanInstructionVisible(true);
      setBanInstructionFading(false);
      setBanInstructionControlsPaused(true);

      const fadeTimer = window.setTimeout(() => {
        setBanInstructionControlsPaused(false);
        setBanInstructionFading(true);
      }, BAN_INSTRUCTION_PAUSE_MS);
      const hideTimer = window.setTimeout(() => {
        markBanInstructionSeen(roundNumber, playerId, draws);
        setBanInstructionVisible(false);
        setBanInstructionFading(false);
      }, BAN_INSTRUCTION_PAUSE_MS + BAN_INSTRUCTION_FADE_MS);

      banInstructionTimersRef.current = [fadeTimer, hideTimer];
    },
    [draws, roundNumber],
  );

  const loadExistingBallot = useCallback(
    async (playerId: string, options: { resetWhenMissing?: boolean } = {}) => {
      const requestId = ++lookupRequestRef.current;

      setLookupPending(true);

      try {
        const lookup = await getExistingBallotAction(
          roundNumber,
          playerId,
          getBallotEditToken(roundNumber, playerId),
        );
        const ballot = lookup.ballot;

        if (requestId !== lookupRequestRef.current) {
          return;
        }

        setExistingBallotLookup(lookup);
        setExistingBallot(ballot);

        if (ballot) {
          const ballotPlayer = players.find((player) => player.id === playerId);

          if (ballotPlayer) {
            rememberIdentity(ballotPlayer, true);
            setDeviceIdentityLocked(true);
          }
          setChoices(choicesFromBallot(draws, ballot));
          setSavedAt(ballot.submittedAt);
          setStep(0);
          setMessage(null);
        } else if (options.resetWhenMissing || lookup.exists) {
          const draft = readBallotDraft(roundNumber, playerId, draws);

          if (draft.status === "loaded") {
            setChoices(draft.choices);
            setStep(draft.step);
            setMessage("Restored your unsaved selections. Review them before submitting.");
          } else {
            setChoices(emptyChoices(draws));
            setStep(0);
            setMessage(
              draft.status === "stale"
                ? "The chart sets changed, so your unsaved selections were cleared."
                : null,
            );
          }
          setSavedAt(null);
        }
      } catch (error) {
        if (requestId === lookupRequestRef.current) {
          setMessage(error instanceof Error ? error.message : "Could not load saved ballot.");
        }
      } finally {
        if (requestId === lookupRequestRef.current) {
          setLookupPending(false);
        }
      }
    },
    [draws, players, roundNumber],
  );

  const claimPresence = useCallback(
    async (player: EligiblePlayerSnapshot): Promise<PresenceClaimResult> => {
      const deviceId = getDeviceId();
      const claimKey = voterPresenceClaimKey(roundNumber, player.id, deviceId);

      try {
        const presence = await claimVoterPresenceAction({
          roundNumber,
          playerId: player.id,
          deviceId,
        });

        lastPresenceClaimRef.current = { claimedAtMs: Date.now(), key: claimKey };

        if (presence.hasOtherActiveDevice) {
          setPresenceWarning(
            `${player.startggUsername} is already active on another device. You can continue; the latest submitted ballot counts.`,
          );
        } else {
          setPresenceWarning(null);
        }

        return {
          claimKey,
          hasOtherActiveDevice: presence.hasOtherActiveDevice,
          ok: true,
        };
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not claim voter presence.");
        return {
          claimKey,
          hasOtherActiveDevice: false,
          ok: false,
        };
      }
    },
    [roundNumber],
  );

  const claimPresenceIfStale = useCallback(
    async (player: EligiblePlayerSnapshot) => {
      const deviceId = getDeviceId();
      const claimKey = voterPresenceClaimKey(roundNumber, player.id, deviceId);
      const lastClaim = lastPresenceClaimRef.current;

      if (lastClaim && lastClaim.key === claimKey && Date.now() - lastClaim.claimedAtMs <= 5_000) {
        return true;
      }

      const claim = await claimPresence(player);
      return claim.ok;
    },
    [claimPresence, roundNumber],
  );

  const warning = useMemo(() => {
    if (!selectedPlayer || !alreadySubmitted) {
      return null;
    }

    if (existingBallotLookup?.canEdit && existingBallot) {
      return `A ballot already exists for this start.gg username from ${existingBallot.submittedAt}. Only continue if you are ${selectedPlayer.startggUsername}. A newer submitted ballot will replace the prior one.`;
    }

    return `A ballot already exists for this start.gg username. Only continue if you are ${selectedPlayer.startggUsername}. A newer submitted ballot will replace the prior one.`;
  }, [alreadySubmitted, existingBallot, existingBallotLookup, selectedPlayer]);

  useEffect(() => {
    setLiveCanSubmit(initialCanSubmit);
    setLiveStatusLabel(statusLabel);
    setLiveStatus(status);
    setLiveTimerText(timerText);
    setLiveTurnoutText(turnoutText);
    onLiveStateChange?.({
      canSubmit: initialCanSubmit,
      closesAt,
      eligibleCount,
      remainingMs,
      serverNowMs,
      status,
      statusLabel,
      submittedCount,
      timerText,
      turnoutText,
    });
  }, [
    closesAt,
    eligibleCount,
    initialCanSubmit,
    onLiveStateChange,
    remainingMs,
    serverNowMs,
    status,
    statusLabel,
    submittedCount,
    timerText,
    turnoutText,
  ]);

  useEffect(() => {
    setChoices((current) => choicesForDraws(draws, current));
    setStep((current) => Math.min(current, draws.length));
  }, [draws]);

  useEffect(() => {
    const renderedGeneration = {
      generation: publicStateGeneration,
      activeDraws: activeDrawGenerationFromDraws(draws),
    };

    if (compareVoteLiveGeneration(renderedGeneration, acceptedPollRef.current.generation) >= 0) {
      const catchUpChange = classifyVoteLiveProjectionChange(
        acceptedPollRef.current.generation,
        renderedGeneration,
      );

      acceptedPollRef.current = {
        generation: renderedGeneration,
        requestSequence: acceptedPollRef.current.requestSequence,
      };
      refreshRequestedRef.current = false;
      routeRefreshAttemptRef.current = null;
      setLiveProjectionRefreshing(false);
      setMessage((current) => {
        if (current !== STALE_BALLOT_REFRESH_MESSAGE) {
          return current;
        }

        return catchUpChange === "draws" ? REROLL_BALLOT_MESSAGE : null;
      });
    }
  }, [draws, publicStateGeneration]);

  useEffect(() => {
    if (initializedIdentityRef.current) {
      return;
    }

    const remembered = readRememberedIdentity();

    if (!remembered) {
      initializedIdentityRef.current = true;
      return;
    }

    setDeviceIdentityLocked(remembered.locked);

    const rememberedPlayer =
      players.find((player) => player.id === remembered.playerId) ??
      players.find((player) => player.startggUsername === remembered.startggUsername);

    if (!rememberedPlayer) {
      initializedIdentityRef.current = true;
      if (remembered.locked) {
        setUnavailableLockedIdentity({
          playerId: remembered.playerId,
          startggUsername: remembered.startggUsername,
        });
      }
      return;
    }

    initializedIdentityRef.current = true;
    setUnavailableLockedIdentity(null);
    setSelectedPlayerId(rememberedPlayer.id);
    if (hasSeenIdentityConfirmation(roundNumber, rememberedPlayer.id)) {
      setIdentityConfirmed(true);
      setConfirmed(true);
    }
    void loadExistingBallot(rememberedPlayer.id, {
      resetWhenMissing: true,
    });
  }, [draws, loadExistingBallot, players, roundNumber]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true") {
      return undefined;
    }

    let cancelled = false;

    async function poll() {
      const requestSequence = ++pollRequestSequenceRef.current;

      try {
        const state = await getVoteLiveStateAction(
          roundNumber,
          selectedPlayerId || undefined,
          selectedPlayerId
            ? (readBallotEditToken(roundNumber, selectedPlayerId) ?? undefined)
            : undefined,
        );

        if (cancelled) {
          return;
        }

        const nextGeneration = {
          generation: state.generation,
          activeDraws: state.activeDraws,
        };

        if (
          !shouldAcceptVoteLivePoll({
            acceptedGeneration: acceptedPollRef.current.generation,
            acceptedRequestSequence: acceptedPollRef.current.requestSequence,
            nextGeneration,
            nextRequestSequence: requestSequence,
          })
        ) {
          return;
        }

        acceptedPollRef.current = {
          generation: nextGeneration,
          requestSequence,
        };

        const renderedGeneration = {
          generation: publicStateGeneration,
          activeDraws: activeDrawGenerationFromDraws(draws),
        };
        const projectionChange = classifyVoteLiveProjectionChange(
          renderedGeneration,
          nextGeneration,
        );

        if (projectionChange === "draws") {
          setChoices((current) => reconcileChoicesForActiveDraws(current, state.activeDraws));
          setExistingBallot(null);
          setExistingBallotLookup(null);
          setSavedAt(null);
          setLiveCanSubmit(false);
          setLiveProjectionRefreshing(true);
          setMessage(REROLL_BALLOT_MESSAGE);
          requestRouteRefresh(state.generation);
          return;
        }

        if (projectionChange === "generation") {
          setLiveProjectionRefreshing(true);
          requestRouteRefresh(state.generation);
        }

        setLiveCanSubmit(state.canSubmit && projectionChange === "none");
        setLiveStatus(state.status);
        setLiveStatusLabel(state.statusLabel);
        setLiveTimerText(state.timerText);
        setLiveTurnoutText(state.turnoutText);
        onLiveStateChange?.({
          canSubmit: state.canSubmit,
          closesAt: state.closesAt,
          eligibleCount: state.eligibleCount,
          remainingMs: state.remainingMs,
          serverNowMs: Date.parse(state.serverNow),
          status: state.status,
          statusLabel: state.statusLabel,
          submittedCount: state.submittedCount,
          timerText: state.timerText,
          turnoutText: state.turnoutText,
        });

        if (state.canSubmit && projectionChange === "none") {
          refreshRequestedRef.current = false;
        }

        if (state.eligibleCount !== players.length) {
          router.refresh();
        }

        if (state.existingBallotLookup) {
          const ballot = state.existingBallotLookup.ballot;
          const hadServerConfirmedBallot =
            Boolean(existingBallotRef.current) ||
            Boolean(savedAtRef.current) ||
            existingBallotLookupExistsRef.current;

          setExistingBallotLookup(state.existingBallotLookup);
          setExistingBallot(ballot);

          if (ballot && (savedAtRef.current || !confirmedRef.current)) {
            setChoices(choicesFromBallot(draws, ballot));
            setSavedAt(ballot.submittedAt);
          } else if (!state.existingBallotLookup.exists && hadServerConfirmedBallot) {
            setSavedAt(null);
            setChoices(emptyChoices(draws));
            clearBallotDraft(roundNumber, selectedPlayerId);
            setMessage(INVALIDATED_BALLOT_MESSAGE);
            router.refresh();
          }
        }

        if (!state.canSubmit && state.status === "voting_paused") {
          setMessage((current) => preserveConfirmedBallotGuidance(current, changesUnavailableCopy));
          return;
        }

        if (!state.canSubmit && !refreshRequestedRef.current) {
          refreshRequestedRef.current = true;
          setMessage((current) =>
            preserveConfirmedBallotGuidance(
              current,
              "Voting state changed. Ballot changes are disabled while this phone refreshes.",
            ),
          );
          router.refresh();
        }
      } catch {
        if (!cancelled && requestSequence >= acceptedPollRef.current.requestSequence) {
          setMessage("Could not refresh voting status. Please keep this page open and try again.");
        }
      }
    }

    void poll();

    const interval = window.setInterval(() => {
      void poll();
    }, VOTE_LIVE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    changesUnavailableCopy,
    draws,
    onLiveStateChange,
    players.length,
    publicStateGeneration,
    requestRouteRefresh,
    roundNumber,
    router,
    selectedPlayerId,
  ]);

  useEffect(() => {
    if (
      !hydrated ||
      !confirmed ||
      !selectedPlayerId ||
      savedAt ||
      lookupPending ||
      !existingBallotLookup
    ) {
      return;
    }

    writeBallotDraft({
      roundNumber,
      playerId: selectedPlayerId,
      draws,
      choices,
      step,
    });
  }, [
    choices,
    confirmed,
    draws,
    existingBallotLookup,
    hydrated,
    lookupPending,
    roundNumber,
    savedAt,
    selectedPlayerId,
    step,
  ]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true") {
      return undefined;
    }

    if (!confirmed || !selectedPlayer || !liveCanSubmit) {
      return undefined;
    }

    const player = selectedPlayer;
    const claimKey = `${roundNumber}:${player.id}:${getDeviceId()}`;
    const lastClaim = lastPresenceClaimRef.current;

    if (!lastClaim || lastClaim.key !== claimKey || Date.now() - lastClaim.claimedAtMs > 5_000) {
      void claimPresenceIfStale(player);
    }

    const interval = window.setInterval(() => {
      void claimPresenceIfStale(player);
    }, VOTER_PRESENCE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [claimPresenceIfStale, confirmed, liveCanSubmit, roundNumber, selectedPlayer]);

  function updateChoice(nextChoice: BallotSetChoice) {
    setChoices((current) => current.map((choice, index) => (index === step ? nextChoice : choice)));
  }

  function toggleBan(chartId: string) {
    if (!currentChoice) {
      return;
    }

    const exists = currentChoice.bannedChartIds.includes(chartId);

    if (!exists && currentChoice.bannedChartIds.length >= 2) {
      setSelectionMessage(`Only 2 bans can be selected for ${currentChoice.displayLabel}.`);
      return;
    }

    const bannedChartIds = exists
      ? currentChoice.bannedChartIds.filter((id) => id !== chartId)
      : [...currentChoice.bannedChartIds, chartId];

    setSelectionMessage(null);

    updateChoice({
      ...currentChoice,
      noBans: false,
      bannedChartIds,
    });
  }

  function submit() {
    if (!selectedPlayer || !canSubmit || !liveCanSubmit) {
      if (!liveCanSubmit) {
        setMessage(changesUnavailableCopy);
      }

      return;
    }

    startTransition(async () => {
      try {
        const result = await submitRoundBallotAction({
          roundNumber,
          playerId: selectedPlayer.id,
          playerStartggUsername: selectedPlayer.startggUsername,
          deviceId: getDeviceId(),
          editToken: getBallotEditToken(roundNumber, selectedPlayer.id),
          expectedGeneration: publicStateGeneration,
          choices,
        });

        if (result.status === "stale") {
          setLiveCanSubmit(false);
          setLiveProjectionRefreshing(true);
          setMessage(staleBallotRefreshMessage);
          requestRouteRefresh(acceptedPollRef.current.generation.generation);
          return;
        }

        const ballot = result.ballot;

        rememberIdentity(selectedPlayer, true);
        setDeviceIdentityLocked(true);
        clearBallotDraft(roundNumber, selectedPlayer.id);
        setExistingBallot(ballot);
        setExistingBallotLookup({
          exists: true,
          revision: ballot.revision,
          canEdit: true,
          warning: null,
          ballot,
        });
        setSavedAt(ballot.submittedAt);
        setMessage(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Save failed.";

        if (isStaleBallotStateError(errorMessage)) {
          setLiveCanSubmit(false);
          setLiveProjectionRefreshing(true);
          setMessage(staleBallotRefreshMessage);
          requestRouteRefresh(acceptedPollRef.current.generation.generation);
          return;
        }

        const hadServerConfirmedBallot =
          Boolean(existingBallot) || Boolean(savedAt) || existingBallotLookup?.exists === true;

        if (existingBallot) {
          setChoices(choicesFromBallot(draws, existingBallot));
          setSavedAt(existingBallot.submittedAt);
        }

        setMessage(formatBallotSaveFailureMessage(errorMessage, hadServerConfirmedBallot));
      }
    });
  }

  function changeUsernameBeforeSubmit() {
    if (deviceIdentityLocked) {
      return;
    }

    if (selectedPlayerId) {
      clearBallotDraft(roundNumber, selectedPlayerId);
    }

    forgetRememberedIdentity();
    setSelectedPlayerId("");
    setConfirmed(false);
    setIdentityConfirmed(false);
    setStep(0);
    setChoices(emptyChoices(draws));
    setSavedAt(null);
    setExistingBallot(null);
    setExistingBallotLookup(null);
    setPresenceWarning(null);
    setPresenceWarningReadyToContinueKey(null);
    setUnavailableLockedIdentity(null);
    setMessage("Choose the correct start.gg username before submitting.");
    setSelectionMessage(null);
  }

  const identityCorrection =
    selectedPlayer && !deviceIdentityLocked && !savedAt && !alreadySubmitted && !existingBallot ? (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-metal-700 bg-black/25 p-2">
        <p className="text-xs font-bold text-metal-300 sm:text-sm">
          Voting as <span className="text-white">{selectedPlayer.startggUsername}</span>
        </p>
        <button
          className="min-h-9 rounded border border-ember-300/35 px-3 py-2 text-xs font-black uppercase text-ember-300"
          onClick={changeUsernameBeforeSubmit}
          disabled={banInstructionControlsPaused}
          type="button"
        >
          Change username
        </button>
      </div>
    ) : null;

  const presenceWarningBanner = presenceWarning ? (
    <p
      className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
      role="alert"
    >
      {presenceWarning}
    </p>
  ) : null;

  if (draws.length !== 2) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-lg font-bold text-metal-300">
          Both chart sets must be drawn before voting opens.
        </p>
      </section>
    );
  }

  if (hydrated && unavailableLockedIdentity) {
    return (
      <section className="metal-panel rounded-lg p-5" data-testid="device-identity-locked">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Device identity locked
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          Voting as {unavailableLockedIdentity.startggUsername}
        </h1>
        <p className="mt-3 rounded border border-red-500/35 bg-red-950/25 p-3 text-sm font-bold text-red-300">
          This device has already submitted a ballot as this start.gg username. That player is not
          eligible for the current round, so this device cannot vote as someone else. Ask an admin
          for help if this is unexpected.
        </p>
      </section>
    );
  }

  if (!confirmed) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <div className="mb-5 grid gap-2 rounded border border-metal-700 bg-black/25 p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
              {liveStatusLabel}
            </p>
            <p className="mt-1 text-sm text-metal-300">{liveTurnoutText}</p>
          </div>
          <p className="font-mono text-3xl font-black tabular-nums text-white">{liveTimerText}</p>
        </div>
        {!liveCanSubmit ? (
          <p className="mb-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            {changesUnavailableCopy}
          </p>
        ) : null}
        <label
          className="text-sm font-bold uppercase tracking-[0.16em] text-ember-300"
          htmlFor="startgg-username"
        >
          Select your start.gg username
        </label>
        <select
          id="startgg-username"
          className="mt-3 w-full rounded border border-metal-700 bg-black/35 px-3 py-3 text-white"
          disabled={!hydrated || deviceIdentityLocked}
          value={selectedPlayerId}
          onChange={(event) => {
            const playerId = event.target.value;

            lookupRequestRef.current += 1;
            setSelectedPlayerId(playerId);
            setConfirmed(false);
            setIdentityConfirmed(false);
            setSavedAt(null);
            setExistingBallot(null);
            setExistingBallotLookup(null);
            setPresenceWarning(null);
            setPresenceWarningReadyToContinueKey(null);
            setChoices(emptyChoices(draws));
            setStep(0);
            setMessage(null);
            setSelectionMessage(null);
            if (playerId) {
              void loadExistingBallot(playerId, { resetWhenMissing: true });
            } else {
              setLookupPending(false);
            }
          }}
        >
          <option value="">Choose username</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.startggUsername}
            </option>
          ))}
        </select>
        {deviceIdentityLocked && selectedPlayer ? (
          <p
            className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm font-bold text-metal-300"
            data-testid="device-identity-locked"
          >
            This device is locked to {selectedPlayer.startggUsername} after its first submitted
            ballot.
          </p>
        ) : null}
        {selectedPlayer ? (
          <p className="mt-4 rounded border border-ember-300/20 bg-black/25 p-3 text-sm font-semibold text-ember-300">
            Are you sure you are voting as {selectedPlayer.startggUsername}?
          </p>
        ) : null}
        {selectedPlayer ? (
          <label
            className="mt-3 flex min-h-11 items-center gap-3 rounded border border-metal-700 bg-black/25 p-3 text-sm font-bold text-white"
            data-testid="identity-confirmation-checkbox"
          >
            <input
              className="h-5 w-5 shrink-0 accent-[#ff3b3b]"
              type="checkbox"
              checked={identityConfirmed}
              disabled={!hydrated || lookupPending || presencePending || !liveCanSubmit}
              onChange={(event) => setIdentityConfirmed(event.target.checked)}
            />
            <span className="min-w-0 break-words">
              I confirm that I am{" "}
              <span className="text-ember-300">{selectedPlayer.startggUsername}</span>
            </span>
          </label>
        ) : null}
        {warning ? (
          <p
            className="mt-3 rounded border border-metal-700 bg-black/25 p-3 text-sm text-metal-300"
            role="alert"
          >
            {warning}
          </p>
        ) : null}
        {presenceWarningBanner}
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role={feedbackRole(message)}>
            {message}
          </p>
        ) : null}
        <button
          className="button-metal mt-5 w-full rounded px-4 py-3 font-black uppercase disabled:opacity-40"
          disabled={
            !hydrated ||
            !selectedPlayer ||
            !identityConfirmed ||
            lookupPending ||
            presencePending ||
            !liveCanSubmit
          }
          onClick={async () => {
            if (!selectedPlayer) {
              return;
            }

            setPresencePending(true);
            const claim = await claimPresence(selectedPlayer);
            setPresencePending(false);

            if (!claim.ok) {
              setPresenceWarningReadyToContinueKey(null);
              return;
            }

            if (
              claim.hasOtherActiveDevice &&
              presenceWarningReadyToContinueKey !== claim.claimKey
            ) {
              setPresenceWarningReadyToContinueKey(claim.claimKey);
              return;
            }

            setPresenceWarningReadyToContinueKey(null);
            rememberIdentity(selectedPlayer);
            markIdentityConfirmationSeen(roundNumber, selectedPlayer.id);
            setConfirmed(true);
            if (!savedAt && !existingBallot && step < draws.length) {
              startBanInstructionIfNeeded(selectedPlayer.id);
            }
          }}
          type="button"
        >
          {presencePending
            ? "Checking username"
            : lookupPending
              ? "Checking saved ballot"
              : "Confirm"}
        </button>
      </section>
    );
  }

  if (lookupPending) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Round {roundNumber} ballot
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">Checking saved ballot</h1>
        {selectedPlayer ? (
          <p className="mt-3 text-metal-300">Voting as {selectedPlayer.startggUsername}</p>
        ) : null}
      </section>
    );
  }

  if (savedAt) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Round {roundNumber} ballot
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          Ballot successfully submitted.
        </h1>
        {selectedPlayer ? (
          <p className="mt-3 text-metal-300">Voting as {selectedPlayer.startggUsername}</p>
        ) : null}
        {presenceWarningBanner}
        <div className="mt-5 grid gap-3">
          {choices.map((choice, index) => {
            const draw = draws.find((candidate) => candidate.id === choice.drawId);
            const selectedCharts = selectedBanCharts(draw, choice);

            return (
              <div key={choice.drawId} className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="font-bold text-white">{choice.displayLabel}</p>
                {selectedCharts.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:gap-3">
                    {selectedCharts.map((chart) => {
                      const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

                      return (
                        <article
                          key={chart.id}
                          className="relative min-h-24 min-w-0 overflow-hidden rounded border border-ember-300/35 bg-furnace-900 sm:min-h-56"
                          data-chart-image-path={imagePath}
                          data-chart-id={chart.id}
                          data-chart-name={chart.name}
                          data-testid="saved-ban-chart-card"
                        >
                          <ChartArtImage
                            src={imagePath}
                            className="absolute inset-0 h-full w-full object-cover opacity-90"
                            testId="saved-ban-chart-image"
                          />
                          <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />
                          <span className="relative flex min-h-24 flex-col justify-end p-2 sm:min-h-56 sm:p-3">
                            <span
                              className="block break-words text-[11px] font-black uppercase leading-tight text-white line-clamp-2 sm:text-base sm:line-clamp-3"
                              data-testid="saved-ban-chart-title"
                            >
                              {chart.name}
                            </span>
                            <span className="mt-1 block break-words text-[10px] font-semibold text-metal-300 line-clamp-1 sm:text-sm sm:line-clamp-2">
                              {chart.artist}
                            </span>
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-metal-300">{describeChoice(draw, choice)}</p>
                )}
                {liveCanSubmit ? (
                  <button
                    className="mt-3 min-h-11 rounded border border-ember-300/35 px-4 py-3 text-sm font-black uppercase text-ember-300"
                    onClick={() => {
                      setSavedAt(null);
                      setStep(index);
                      setSelectionMessage(null);
                      if (selectedPlayer) {
                        startBanInstructionIfNeeded(selectedPlayer.id);
                      }
                    }}
                    type="button"
                  >
                    Edit {choice.displayLabel}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role={feedbackRole(message)}>
            {message}
          </p>
        ) : null}
        {liveCanSubmit ? (
          <button
            className="button-metal mt-5 min-h-11 rounded px-4 py-3 font-black uppercase"
            onClick={() => {
              setSavedAt(null);
              setStep(draws.length);
              setSelectionMessage(null);
            }}
            type="button"
          >
            Change vote
          </button>
        ) : (
          <p className="mt-5 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            {liveProjectionRefreshing
              ? "Voting state is updating. Your saved ballot remains valid; edits will resume automatically."
              : isPaused
                ? "Voting is paused. Your saved ballot remains valid; edits resume when voting resumes."
                : "Voting is no longer open for changes."}
          </p>
        )}
      </section>
    );
  }

  if (step >= draws.length) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Review and Submit
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          Round {roundNumber} Ballot
        </h1>
        {identityCorrection}
        {presenceWarningBanner}
        {editingSavedBallot ? (
          <p
            className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
            data-testid="saved-edit-draft-warning"
            role="status"
          >
            Editing your saved ballot. Your saved ballot stays active until you submit again.
          </p>
        ) : null}
        <div className="mt-5 grid gap-3">
          {choices.map((choice, index) => (
            <div key={choice.drawId} className="rounded border border-metal-700 bg-black/25 p-3">
              <p className="font-bold text-white">{choice.displayLabel}</p>
              <p className="mt-1 text-sm text-metal-300">
                {choice.noBans
                  ? "No bans for this set"
                  : describeChoice(
                      draws.find((draw) => draw.id === choice.drawId),
                      choice,
                    )}
              </p>
              <button
                className="mt-3 min-h-11 rounded border border-ember-300/35 px-4 py-3 text-sm font-black uppercase text-ember-300"
                onClick={() => {
                  setStep(index);
                  setSelectionMessage(null);
                  if (selectedPlayer) {
                    startBanInstructionIfNeeded(selectedPlayer.id);
                  }
                }}
                type="button"
              >
                Edit {choice.displayLabel}
              </button>
            </div>
          ))}
        </div>
        {message ? (
          <p className="mt-3 text-sm text-ember-300" role={feedbackRole(message)}>
            {message}
          </p>
        ) : null}
        {!liveCanSubmit ? (
          <p className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
            {changesUnavailableCopy}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded border border-metal-700 px-4 py-3 font-bold uppercase text-metal-300"
            onClick={() => {
              setStep(1);
              if (selectedPlayer) {
                startBanInstructionIfNeeded(selectedPlayer.id);
              }
            }}
            type="button"
          >
            Back
          </button>
          <button
            className="button-metal min-h-11 rounded px-4 py-3 font-black uppercase disabled:opacity-40"
            disabled={!canSubmit || isPending || !liveCanSubmit || banInstructionControlsPaused}
            onClick={submit}
            type="button"
          >
            Submit Ballot
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="metal-panel rounded-lg p-2 sm:p-4">
      {banInstructionVisible ? (
        <div
          className={clsx(
            "fixed inset-0 z-50 grid place-items-center bg-black/65 px-5 transition-opacity duration-700",
            banInstructionFading ? "pointer-events-none opacity-0" : "opacity-100",
          )}
          data-controls-paused={banInstructionControlsPaused ? "true" : "false"}
          data-testid="ban-instruction-popin"
          role="status"
        >
          <div className="max-w-sm rounded border border-red-400/70 bg-black/90 px-5 py-6 text-center shadow-[0_0_36px_rgba(239,68,68,0.34)]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              Ballot instruction
            </p>
            <p className="mt-2 text-3xl font-black uppercase leading-tight text-white">
              Please ban up to two charts
            </p>
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-ember-300">
            Step {step + 1}: Set {step + 1}
          </p>
          <h1 className="mt-0.5 truncate text-xl font-black uppercase text-white sm:mt-1 sm:text-3xl">
            {currentDraw?.displayLabel}
          </h1>
        </div>
        <p
          className="shrink-0 rounded border border-metal-700 bg-black/25 px-2 py-1.5 text-xs font-black uppercase text-white sm:px-3 sm:py-2 sm:text-sm"
          data-testid="ban-selection-counter"
        >
          {currentChoice?.bannedChartIds.length ?? 0}/2 bans selected
        </p>
      </div>
      {identityCorrection}
      {presenceWarningBanner}
      {editingSavedBallot ? (
        <p
          className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
          data-testid="saved-edit-draft-warning"
          role="status"
        >
          Editing your saved ballot. Your saved ballot stays active until you submit again.
        </p>
      ) : null}
      {selectionMessage ? (
        <p
          className="mt-3 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
          data-testid="ban-limit-feedback"
          role="alert"
        >
          {selectionMessage}
        </p>
      ) : null}
      {!liveCanSubmit ? (
        <p className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300">
          {changesUnavailableCopy}
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-3">
        {currentDraw?.charts.map((chart) => {
          const selected = currentChoice?.bannedChartIds.includes(chart.id) ?? false;
          const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

          return (
            <button
              key={chart.id}
              aria-label={`Ban ${chart.name}`}
              aria-pressed={selected}
              className={clsx(
                "relative min-h-24 min-w-0 overflow-hidden rounded border bg-furnace-900 text-left disabled:opacity-55 sm:min-h-56",
                selected
                  ? "border-red-500 shadow-[0_0_22px_rgba(239,68,68,0.42)]"
                  : "border-metal-700 bg-black/25",
              )}
              data-chart-image-path={imagePath}
              data-chart-id={chart.id}
              data-chart-name={chart.name}
              data-testid="ballot-chart-card"
              onClick={() => toggleBan(chart.id)}
              disabled={ballotControlsDisabled}
              type="button"
            >
              <ChartArtImage
                src={imagePath}
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                testId="ballot-chart-image"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />
              {selected ? <span className="absolute inset-0 border-2 border-red-500/90" /> : null}
              <span className="relative flex min-h-24 flex-col justify-between p-2 sm:min-h-56 sm:p-3">
                <span className="flex items-start justify-end gap-1 text-[10px] font-bold uppercase text-ember-300 sm:gap-2 sm:text-xs">
                  <span
                    className={clsx(
                      "rounded border px-1 py-0.5 font-black sm:px-1.5",
                      selected
                        ? "border-red-400 bg-red-950/80 text-white"
                        : "border-metal-700 bg-black/55 text-metal-300",
                    )}
                    data-testid="ban-selected-label"
                  >
                    {selected ? "Ban selected" : "Tap to ban"}
                  </span>
                </span>
                <span>
                  <span className="block break-words text-[11px] font-black uppercase leading-tight text-white line-clamp-2 sm:text-base sm:line-clamp-3">
                    {chart.name}
                  </span>
                  <span className="mt-1 block break-words text-[10px] font-semibold text-metal-300 line-clamp-1 sm:text-sm sm:line-clamp-2">
                    {chart.artist}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        <label
          className={clsx(
            "flex min-h-20 items-center gap-2 rounded border p-2 text-xs font-black text-white sm:min-h-[11rem] sm:gap-3 sm:p-4 sm:text-base",
            currentChoice?.noBans
              ? "border-ember-300 bg-ember-900/35 shadow-ember-tight"
              : "border-ember-300/35 bg-black/25",
          )}
          data-testid="no-bans-choice"
        >
          <input
            className="h-5 w-5 shrink-0 accent-[#ffb95c] sm:h-6 sm:w-6"
            type="checkbox"
            checked={currentChoice?.noBans ?? false}
            disabled={ballotControlsDisabled}
            onChange={(event) => {
              if (!currentChoice) {
                return;
              }

              setSelectionMessage(null);
              updateChoice({
                ...currentChoice,
                noBans: event.target.checked,
                bannedChartIds: [],
              });
            }}
          />
          <span className="min-w-0">
            <span className="block break-words uppercase">No bans for this set</span>
            <span className="mt-1 hidden text-xs font-semibold uppercase text-metal-300 sm:block">
              Select when you want no bans
            </span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
        <button
          className="min-h-11 rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300 disabled:opacity-40 sm:px-4 sm:py-3 sm:text-base"
          disabled={step === 0 || banInstructionControlsPaused}
          onClick={() => {
            setSelectionMessage(null);
            setStep((current) => current - 1);
          }}
          type="button"
        >
          Back
        </button>
        <button
          className="button-metal min-h-11 rounded px-3 py-2 text-sm font-black uppercase disabled:opacity-40 sm:px-4 sm:py-3 sm:text-base"
          disabled={
            !liveCanSubmit ||
            banInstructionControlsPaused ||
            !currentChoice ||
            !(
              (currentChoice.noBans && currentChoice.bannedChartIds.length === 0) ||
              (!currentChoice.noBans && currentChoice.bannedChartIds.length >= 1)
            )
          }
          onClick={() => {
            setSelectionMessage(null);
            setStep((current) => current + 1);
          }}
          type="button"
        >
          {step === 1 ? "Review" : "Next"}
        </button>
      </div>
    </section>
  );
}
