"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_INSPECTION_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type ResultsAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export function ResultsAutoRefresh({
  enabled = true,
  intervalMs = PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
}: ResultsAutoRefreshProps) {
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

  return null;
}
