"use client";

import { useRouter } from "next/navigation";
import { useJitteredRouterRefresh } from "@/lib/client/use-jittered-router-refresh";
import {
  PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
  PUBLIC_REFRESH_JITTER_MS,
} from "@/lib/vote/phone-view";

type RoomAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

export function RoomAutoRefresh({
  enabled = true,
  intervalMs = PUBLIC_INSPECTION_REFRESH_INTERVAL_MS,
}: RoomAutoRefreshProps) {
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
      data-testid="room-auto-refresh"
      hidden
    />
  );
}
