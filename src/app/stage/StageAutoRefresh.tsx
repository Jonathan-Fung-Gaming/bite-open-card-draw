"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJitteredRouterRefresh } from "@/lib/client/use-jittered-router-refresh";
import { STAGE_LIVE_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type StageAutoRefreshProps = {
  deferDuringStageDrawReveal?: boolean;
  deferDuringTiebreak?: boolean;
  enabled?: boolean;
  intervalMs?: number;
  jitterMs?: number;
  leading?: boolean;
  refreshOnStageTiebreakRevealComplete?: boolean;
};

function activeTiebreakRevealIsRunning() {
  return Boolean(
    document.querySelector(
      [
        '[data-testid="rune-wheel"][data-reveal-timing-valid="true"][data-winner-revealed="false"]',
        '[data-testid="fallback-tiebreak-reveal"][data-reveal-timing-valid="true"][data-winner-revealed="false"]',
      ].join(","),
    ),
  );
}

function activeStageDrawRevealIsRunning() {
  return Boolean(
    document.querySelector('[data-testid="stage-set-row"][data-reveal-complete="false"]'),
  );
}

export function StageAutoRefresh({
  deferDuringStageDrawReveal = false,
  deferDuringTiebreak = false,
  enabled = true,
  intervalMs = STAGE_LIVE_REFRESH_INTERVAL_MS,
  jitterMs = 0,
  leading = false,
  refreshOnStageTiebreakRevealComplete = false,
}: StageAutoRefreshProps) {
  const router = useRouter();

  useJitteredRouterRefresh(router.refresh, {
    enabled,
    intervalMs,
    jitterMs,
    leading,
    shouldDefer:
      deferDuringTiebreak || deferDuringStageDrawReveal
        ? () =>
            (deferDuringTiebreak && activeTiebreakRevealIsRunning()) ||
            (deferDuringStageDrawReveal && activeStageDrawRevealIsRunning())
        : undefined,
  });

  useEffect(() => {
    if (!enabled || !refreshOnStageTiebreakRevealComplete) {
      return undefined;
    }

    const refreshAfterStageTiebreak = () => router.refresh();

    window.addEventListener("stage-tiebreak-reveal-complete", refreshAfterStageTiebreak);

    return () =>
      window.removeEventListener("stage-tiebreak-reveal-complete", refreshAfterStageTiebreak);
  }, [enabled, refreshOnStageTiebreakRevealComplete, router]);

  return (
    <span
      aria-hidden="true"
      data-defer-during-stage-draw-reveal={deferDuringStageDrawReveal ? "true" : "false"}
      data-defer-during-tiebreak={deferDuringTiebreak ? "true" : "false"}
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-refresh-jitter-ms={String(jitterMs)}
      data-refresh-on-stage-tiebreak-reveal-complete={
        refreshOnStageTiebreakRevealComplete ? "true" : "false"
      }
      data-testid="stage-auto-refresh"
      hidden
    />
  );
}
