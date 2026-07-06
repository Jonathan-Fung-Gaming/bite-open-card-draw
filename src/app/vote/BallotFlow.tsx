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
    };

    return typeof parsed.playerId === "string" && typeof parsed.startggUsername === "string"
      ? {
          playerId: parsed.playerId,
          startggUsername: parsed.startggUsername,
        }
      : null;
  } catch {
    return null;
  }
}

function rememberIdentity(player: EligiblePlayerSnapshot) {
  window.localStorage.setItem(
    IDENTITY_STORAGE_KEY,
    JSON.stringify({
      playerId: player.id,
      startggUsername: player.startggUsername,
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

function voterPresenceClaimKey(
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  deviceId: string,
) {
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
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState(() => emptyChoices(draws));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(null);
  const [presenceWarningReadyToContinueKey, setPresenceWarningReadyToContinueKey] = useState<
    string | null
  >(null);
  const [presencePending, setPresencePending] = useState(false);
  const [existingBallot, setExistingBallot] = useState<PublicEditableBallot | null>(null);
  const [existingBallotLookup, setExistingBallotLookup] = useState<PublicBallotLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [liveCanSubmit, setLiveCanSubmit] = useState(initialCanSubmit);
  const [liveStatusLabel, setLiveStatusLabel] = useState(statusLabel);
  const [liveStatus, setLiveStatus] = useState<VotingRoundStatus>(status);
  const [liveTimerText, setLiveTimerText] = useState(timerText);
  const [liveTurnoutText, setLiveTurnoutText] = useState(turnoutText);
  const [isPending, startTransition] = useTransition();
  const initializedIdentityRef = useRef(false);
  const lastPresenceClaimRef = useRef<{ claimedAtMs: number; key: string } | null>(null);
  const lookupRequestRef = useRef(0);
  const refreshRequestedRef = useRef(false);
  const confirmedRef = useRef(false);
  const existingBallotRef = useRef<PublicEditableBallot | null>(null);
  const existingBallotLookupExistsRef = useRef(false);
  const savedAtRef = useRef<string | null>(null);
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const alreadySubmitted = existingBallotLookup?.exists === true;
  const isPaused = liveStatus === "voting_paused";
  const changesUnavailableCopy = isPaused
    ? "Voting is paused. The host has frozen the timer and ballot changes. Your selections on this phone are still here; leave this page open and continue after voting resumes."
    : "Voting is not accepting ballot changes right now.";
  const editingServerConfirmedBallot = confirmed && !savedAt && Boolean(existingBallot);
  const currentDraw = draws[step];
  const currentChoice = choices[step];
  const canSubmit = choices.every(
    (choice) =>
      (choice.noBans && choice.bannedChartIds.length === 0) ||
      (!choice.noBans && choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2),
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

  const loadExistingBallot = useCallback(
    async (
      playerId: string,
      options: { autoConfirmExisting?: boolean; resetWhenMissing?: boolean } = {},
    ) => {
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
          setChoices(choicesFromBallot(draws, ballot));
          setSavedAt(ballot.submittedAt);
          setStep(0);
          setMessage(`Loaded saved revision ${ballot.revision}.`);

          if (options.autoConfirmExisting) {
            setConfirmed(true);
          }
        } else if (options.resetWhenMissing || lookup.exists) {
          const draft = readBallotDraft(roundNumber, playerId, draws);

          if (draft.status === "loaded") {
            setChoices(draft.choices);
            setStep(draft.step);
            setMessage(
              "Restored unsaved ballot selections from this device. Review them before submitting.",
            );
            if (options.autoConfirmExisting) {
              setConfirmed(true);
            }
          } else {
            setChoices(emptyChoices(draws));
            setStep(0);
            setMessage(
              draft.status === "stale"
                ? "The drawn charts changed, so unsaved selections on this device were cleared. Please vote on the current chart sets."
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
    [draws, roundNumber],
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
            `Another active device has already claimed ${player.startggUsername}. You can continue, but the latest valid submitted ballot will count.`,
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
      return `A ballot already exists for this start.gg username from ${existingBallot.submittedAt}. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
    }

    return `A ballot already exists for this start.gg username. Only continue if you are ${selectedPlayer.startggUsername}. A second phone can replace the prior ballot; the latest valid submitted ballot will count.`;
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
    if (initializedIdentityRef.current) {
      return;
    }

    const remembered = readRememberedIdentity();

    if (!remembered) {
      initializedIdentityRef.current = true;
      return;
    }

    const rememberedPlayer =
      players.find((player) => player.id === remembered.playerId) ??
      players.find((player) => player.startggUsername === remembered.startggUsername);

    if (!rememberedPlayer) {
      return;
    }

    initializedIdentityRef.current = true;
    setSelectedPlayerId(rememberedPlayer.id);
    void loadExistingBallot(rememberedPlayer.id, {
      autoConfirmExisting: true,
      resetWhenMissing: true,
    });
  }, [loadExistingBallot, players]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_VOTE_LIVE_POLLING === "true") {
      return undefined;
    }

    let cancelled = false;

    async function poll() {
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

        setLiveCanSubmit(state.canSubmit);
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

        if (state.canSubmit) {
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
            setMessage(
              "The chart draw changed after your ballot was saved. Your previous ballot was invalidated; please review the current chart sets and submit again.",
            );
            router.refresh();
          }
        }

        if (!state.canSubmit && state.status === "voting_paused") {
          setMessage(changesUnavailableCopy);
          return;
        }

        if (!state.canSubmit && !refreshRequestedRef.current) {
          refreshRequestedRef.current = true;
          setMessage(
            "Voting state changed. Ballot changes are disabled while this phone refreshes.",
          );
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          setMessage(
            "Could not refresh voting status. Server validation still protects submissions.",
          );
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
    roundNumber,
    router,
    selectedPlayerId,
  ]);

  useEffect(() => {
    if (!hydrated || !confirmed || !selectedPlayerId || savedAt) {
      return;
    }

    writeBallotDraft({
      roundNumber,
      playerId: selectedPlayerId,
      draws,
      choices,
      step,
    });
  }, [choices, confirmed, draws, hydrated, roundNumber, savedAt, selectedPlayerId, step]);

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
        const ballot = await submitRoundBallotAction({
          roundNumber,
          playerId: selectedPlayer.id,
          playerStartggUsername: selectedPlayer.startggUsername,
          deviceId: getDeviceId(),
          editToken: getBallotEditToken(roundNumber, selectedPlayer.id),
          choices,
        });

        rememberIdentity(selectedPlayer);
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
        setMessage(`Saved revision ${ballot.revision}.`);
      } catch (error) {
        const hadServerConfirmedBallot =
          Boolean(existingBallot) || Boolean(savedAt) || existingBallotLookup?.exists === true;

        if (existingBallot) {
          setChoices(choicesFromBallot(draws, existingBallot));
          setSavedAt(existingBallot.submittedAt);
        }

        setMessage(
          error instanceof Error
            ? formatBallotSaveFailureMessage(error.message, hadServerConfirmedBallot)
            : formatBallotSaveFailureMessage("Save failed.", hadServerConfirmedBallot),
        );
      }
    });
  }

  function changeUsernameBeforeSubmit() {
    if (selectedPlayerId) {
      clearBallotDraft(roundNumber, selectedPlayerId);
    }

    forgetRememberedIdentity();
    setSelectedPlayerId("");
    setConfirmed(false);
    setStep(0);
    setChoices(emptyChoices(draws));
    setSavedAt(null);
    setExistingBallot(null);
    setExistingBallotLookup(null);
    setPresenceWarning(null);
    setPresenceWarningReadyToContinueKey(null);
    setMessage("Choose the correct start.gg username before submitting.");
    setSelectionMessage(null);
  }

  const identityCorrection =
    selectedPlayer && !savedAt && !alreadySubmitted && !existingBallot ? (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-metal-700 bg-black/25 p-2">
        <p className="text-xs font-bold text-metal-300 sm:text-sm">
          Voting as <span className="text-white">{selectedPlayer.startggUsername}</span>
        </p>
        <button
          className="min-h-9 rounded border border-ember-300/35 px-3 py-2 text-xs font-black uppercase text-ember-300"
          onClick={changeUsernameBeforeSubmit}
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
          disabled={!hydrated}
          value={selectedPlayerId}
          onChange={(event) => {
            const playerId = event.target.value;

            lookupRequestRef.current += 1;
            setSelectedPlayerId(playerId);
            setConfirmed(false);
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
        {selectedPlayer ? (
          <p className="mt-4 rounded border border-ember-300/20 bg-black/25 p-3 text-sm font-semibold text-ember-300">
            Are you sure you are voting as {selectedPlayer.startggUsername}?
          </p>
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
            !hydrated || !selectedPlayer || lookupPending || presencePending || !liveCanSubmit
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
            setConfirmed(true);
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

  if (savedAt) {
    return (
      <section className="metal-panel rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Ballot Saved
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">
          {selectedPlayer?.startggUsername}
        </h1>
        <p className="mt-3 text-metal-300">
          Server-confirmed ballot. This ballot remains valid unless a later save succeeds.
        </p>
        <p className="mt-2 text-metal-300">Server-confirmed timestamp: {savedAt}</p>
        {presenceWarningBanner}
        <div className="mt-5 grid gap-3">
          {choices.map((choice, index) => {
            const draw = draws.find((candidate) => candidate.id === choice.drawId);

            return (
              <div key={choice.drawId} className="rounded border border-metal-700 bg-black/25 p-3">
                <p className="font-bold text-white">{choice.displayLabel}</p>
                <p className="mt-1 text-sm text-metal-300">{describeChoice(draw, choice)}</p>
                {liveCanSubmit ? (
                  <button
                    className="mt-3 min-h-11 rounded border border-ember-300/35 px-4 py-3 text-sm font-black uppercase text-ember-300"
                    onClick={() => {
                      setSavedAt(null);
                      setStep(index);
                      setSelectionMessage(null);
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
            {isPaused
              ? "Voting is paused. Your saved ballot remains valid; edits resume when the host resumes."
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
        {editingServerConfirmedBallot ? (
          <p
            className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
            data-testid="saved-edit-draft-warning"
            role="status"
          >
            Editing unsaved changes. Your previous server-confirmed ballot remains valid until this
            save succeeds.
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
            onClick={() => setStep(1)}
            type="button"
          >
            Back
          </button>
          <button
            className="button-metal min-h-11 rounded px-4 py-3 font-black uppercase disabled:opacity-40"
            disabled={!canSubmit || isPending || !liveCanSubmit}
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
      {editingServerConfirmedBallot ? (
        <p
          className="mt-4 rounded border border-ember-300/30 bg-ember-900/20 p-3 text-sm font-bold text-ember-300"
          data-testid="saved-edit-draft-warning"
          role="status"
        >
          Editing unsaved changes. Your previous server-confirmed ballot remains valid until this
          save succeeds.
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
              aria-label={`Ban ${chart.name} (${chart.displayDifficulty})`}
              aria-pressed={selected}
              className={clsx(
                "relative min-h-24 min-w-0 overflow-hidden rounded border bg-furnace-900 text-left disabled:opacity-55 sm:min-h-56",
                selected
                  ? "border-ember-300 shadow-ember-tight"
                  : "border-metal-700 bg-black/25",
              )}
              data-chart-image-path={imagePath}
              data-chart-id={chart.id}
              data-chart-name={chart.name}
              data-testid="ballot-chart-card"
              onClick={() => toggleBan(chart.id)}
              disabled={!liveCanSubmit}
              type="button"
            >
              <ChartArtImage
                src={imagePath}
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                testId="ballot-chart-image"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/10" />
              {selected ? (
                <span className="absolute inset-0 border-2 border-ember-300/80" />
              ) : null}
              <span className="relative flex min-h-24 flex-col justify-between p-2 sm:min-h-56 sm:p-3">
                <span className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase text-ember-300 sm:gap-2 sm:text-xs">
                  <span>{chart.displayDifficulty}</span>
                  <span
                    className={clsx(
                      "rounded border px-1 py-0.5 font-black sm:px-1.5",
                      selected
                        ? "border-ember-300 bg-ember-900/65 text-white"
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
            disabled={!liveCanSubmit}
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
              Explicit zero-ban choice
            </span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
        <button
          className="min-h-11 rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300 disabled:opacity-40 sm:px-4 sm:py-3 sm:text-base"
          disabled={step === 0}
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
