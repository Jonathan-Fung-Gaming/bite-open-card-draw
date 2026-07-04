"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { STAGE_PUBLIC_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

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

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (deferDuringTiebreak && activeTiebreakRevealIsRunning()) {
        return;
      }

      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [deferDuringTiebreak, enabled, intervalMs, router]);

  return (
    <span
      aria-hidden="true"
      data-defer-during-tiebreak={deferDuringTiebreak ? "true" : "false"}
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-testid="stage-auto-refresh"
      hidden
    />
  );
}
