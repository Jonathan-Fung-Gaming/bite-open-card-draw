"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_INSPECTION_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type RoomAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export function RoomAutoRefresh({
  enabled = true,
  intervalMs = PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
}: RoomAutoRefreshProps) {
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
      data-testid="room-auto-refresh"
      hidden
    />
  );
}
