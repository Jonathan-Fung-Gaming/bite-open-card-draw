"use client";

import * as React from "react";
import { TournamentLogo } from "@/components";

type StageErrorProps = {
  reset: () => void;
};

export const STAGE_ERROR_AUTO_RETRY_SECONDS = 5;

type StageErrorRetryTimers = Pick<
  Window,
  "clearInterval" | "clearTimeout" | "setInterval" | "setTimeout"
>;

export function scheduleStageErrorAutoRetry(
  reset: () => void,
  setSecondsUntilRetry: React.Dispatch<React.SetStateAction<number>>,
  timers: StageErrorRetryTimers = window,
) {
  const retryTimer = timers.setTimeout(reset, STAGE_ERROR_AUTO_RETRY_SECONDS * 1000);
  const countdownTimer = timers.setInterval(() => {
    setSecondsUntilRetry((current) => Math.max(1, current - 1));
  }, 1000);

  return () => {
    timers.clearTimeout(retryTimer);
    timers.clearInterval(countdownTimer);
  };
}

export default function StageError({ reset }: StageErrorProps) {
  const [secondsUntilRetry, setSecondsUntilRetry] = React.useState(STAGE_ERROR_AUTO_RETRY_SECONDS);

  React.useEffect(() => {
    return scheduleStageErrorAutoRetry(reset, setSecondsUntilRetry);
  }, [reset]);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <section className="metal-panel w-full max-w-2xl rounded-lg border border-ember-300/45 p-6 text-center">
        <TournamentLogo priority className="mx-auto" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
          Stage display
        </p>
        <h1 className="mt-2 text-3xl font-black uppercase text-white">Stage view interrupted</h1>
        <p className="mt-3 text-sm text-metal-300">
          Tournament state is still server-authoritative. This projector display retries
          automatically; if it stays interrupted, refresh the projector browser after the host
          confirms the admin console is healthy.
        </p>
        <p
          className="mt-4 rounded border border-ember-300/30 bg-black/25 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-ember-200"
          data-testid="stage-error-auto-retry"
        >
          Auto-retrying in {secondsUntilRetry} seconds
        </p>
        <button
          className="button-metal mt-5 rounded px-4 py-3 text-sm font-black uppercase"
          onClick={reset}
          type="button"
        >
          Retry Stage View
        </button>
      </section>
    </main>
  );
}
