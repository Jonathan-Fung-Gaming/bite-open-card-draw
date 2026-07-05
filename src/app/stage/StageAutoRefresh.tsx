"use client";

import { useRouter } from "next/navigation";
import { useJitteredRouterRefresh } from "@/lib/client/use-jittered-router-refresh";
import {
  PUBLIC_REFRESH_JITTER_MS,
  STAGE_PUBLIC_REFRESH_INTERVAL_MS,
} from "@/lib/vote/phone-view";

type StageAutoRefreshProps = {
  deferDuringTiebreak?: boolean;
  enabled?: boolean;
  intervalMs?: number;
};

function activeTiebreakRevealIsRunning() {
  return Boolean(
    document.querySelector(
      [
        '[data-testid="rune-wheel"][data-winner-revealed="false"]',
        '[data-testid="fallback-tiebreak-reveal"][data-winner-revealed="false"]',
      ].join(","),
    ),
  );
}

export function StageAutoRefresh({
  deferDuringTiebreak = false,
  enabled = true,
  intervalMs = STAGE_PUBLIC_REFRESH_INTERVAL_MS,
}: StageAutoRefreshProps) {
  const router = useRouter();

  useJitteredRouterRefresh(router.refresh, {
    enabled,
    intervalMs,
    jitterMs: PUBLIC_REFRESH_JITTER_MS,
    shouldDefer: deferDuringTiebreak ? activeTiebreakRevealIsRunning : undefined,
  });

  return (
    <span
      aria-hidden="true"
      data-defer-during-tiebreak={deferDuringTiebreak ? "true" : "false"}
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-refresh-jitter-ms={String(PUBLIC_REFRESH_JITTER_MS)}
      data-testid="stage-auto-refresh"
      hidden
    />
  );
}
