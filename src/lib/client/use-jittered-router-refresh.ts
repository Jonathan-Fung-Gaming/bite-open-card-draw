"use client";

import { useEffect } from "react";

type JitteredRouterRefreshOptions = {
  enabled: boolean;
  intervalMs: number;
  jitterMs: number;
  shouldDefer?: () => boolean;
};

export function useJitteredRouterRefresh(
  refresh: () => void,
  { enabled, intervalMs, jitterMs, shouldDefer }: JitteredRouterRefreshOptions,
) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let intervalId: number | null = null;
    const jitterDelayMs = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
    const refreshIfReady = () => {
      if (shouldDefer?.()) {
        return;
      }

      refresh();
    };
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(refreshIfReady, intervalMs);
    }, jitterDelayMs);

    return () => {
      window.clearTimeout(timeoutId);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, intervalMs, jitterMs, refresh, shouldDefer]);
}
