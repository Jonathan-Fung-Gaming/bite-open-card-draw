"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VOTE_PAGE_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type VoteAutoRefreshProps = {
  intervalMs?: number;
  enabled?: boolean;
};

export function VoteAutoRefresh({
  intervalMs = VOTE_PAGE_REFRESH_INTERVAL_MS,
  enabled = true,
}: VoteAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, intervalMs, router]);

  return (
    <span
      aria-hidden="true"
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-testid="vote-auto-refresh"
      hidden
    />
  );
}
