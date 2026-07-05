"use client";

import { useRouter } from "next/navigation";
import { useJitteredRouterRefresh } from "@/lib/client/use-jittered-router-refresh";
import { PUBLIC_REFRESH_JITTER_MS, VOTE_PAGE_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type VoteAutoRefreshProps = {
  intervalMs?: number;
  enabled?: boolean;
};

export function VoteAutoRefresh({
  intervalMs = VOTE_PAGE_REFRESH_INTERVAL_MS,
  enabled = true,
}: VoteAutoRefreshProps) {
  const router = useRouter();

  useJitteredRouterRefresh(router.refresh, {
    enabled,
    intervalMs,
    jitterMs: PUBLIC_REFRESH_JITTER_MS,
  });

  return (
    <span
      aria-hidden="true"
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-refresh-jitter-ms={String(PUBLIC_REFRESH_JITTER_MS)}
      data-testid="vote-auto-refresh"
      hidden
    />
  );
}
