"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_INSPECTION_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type ChartsAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export function ChartsAutoRefresh({
  enabled = true,
  intervalMs = PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
}: ChartsAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs, router]);

  return (
    <span
      aria-hidden="true"
      data-refresh-enabled={enabled ? "true" : "false"}
      data-refresh-interval-ms={String(intervalMs)}
      data-testid="charts-auto-refresh"
      hidden
    />
  );
}
