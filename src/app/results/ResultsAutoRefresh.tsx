"use client";

import { useRouter } from "next/navigation";
import { useJitteredRouterRefresh } from "@/lib/client/use-jittered-router-refresh";
import {
  RESULTS_LIVE_REFRESH_INTERVAL_MS,
  RESULTS_LIVE_REFRESH_JITTER_MS,
} from "@/lib/vote/phone-view";

type ResultsAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export function ResultsAutoRefresh({
  enabled = true,
  intervalMs = RESULTS_LIVE_REFRESH_INTERVAL_MS,
}: ResultsAutoRefreshProps) {
  const router = useRouter();

  useJitteredRouterRefresh(router.refresh, {
    enabled,
    intervalMs,
    jitterMs: RESULTS_LIVE_REFRESH_JITTER_MS,
  });

  return (
    <span
      aria-hidden="true"
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-refresh-jitter-ms={String(RESULTS_LIVE_REFRESH_JITTER_MS)}
      data-testid="results-auto-refresh"
      hidden
    />
  );
}
