"use client";

import { useEffect } from "react";

type JitteredRouterRefreshOptions = {
  deferredRetryMs?: number;
  enabled: boolean;
  intervalMs: number;
  jitterMs: number;
  leading?: boolean;
  shouldDefer?: () => boolean;
};

export function useJitteredRouterRefresh(
  refresh: () => void,
  {
    deferredRetryMs = 500,
    enabled,
    intervalMs,
    jitterMs,
    leading = false,
    shouldDefer,
  }: JitteredRouterRefreshOptions,
) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let intervalId: number | null = null;
    let retryTimeoutId: number | null = null;
    let refreshInFlight = false;
    const jitterDelayMs = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
    const releaseInFlight = () => {
      refreshInFlight = false;
    };
    const scheduleDeferredRetry = () => {
      if (retryTimeoutId !== null) {
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        refreshIfReady();
      }, deferredRetryMs);
    };
    const refreshIfReady = () => {
      if (shouldDefer?.()) {
        scheduleDeferredRetry();
        return;
      }

      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      refresh();
      window.setTimeout(releaseInFlight, Math.min(Math.max(intervalMs, 250), 2_000));
    };

    if (leading) {
      refreshIfReady();
    }

    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(refreshIfReady, intervalMs);
    }, jitterDelayMs);

    return () => {
      window.clearTimeout(timeoutId);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }

      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [deferredRetryMs, enabled, intervalMs, jitterMs, leading, refresh, shouldDefer]);
}
