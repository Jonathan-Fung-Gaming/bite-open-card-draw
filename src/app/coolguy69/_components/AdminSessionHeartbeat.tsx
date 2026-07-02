"use client";

import { useEffect, useRef } from "react";
import { refreshAdminSessionAction } from "../actions";

const ADMIN_SESSION_REFRESH_DEBOUNCE_MS = 60_000;
const ADMIN_ACTIVITY_EVENTS = ["pointerdown", "keydown", "submit"] as const;
export const ADMIN_SESSION_REFRESHED_EVENT = "admin-session-refreshed";

export function AdminSessionHeartbeat() {
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_DISABLE_ADMIN_SESSION_HEARTBEAT === "true") {
      return;
    }

    const refreshAfterActivity = () => {
      const now = Date.now();

      if (now - lastRefreshAt.current < ADMIN_SESSION_REFRESH_DEBOUNCE_MS) {
        return;
      }

      lastRefreshAt.current = now;
      void refreshAdminSessionAction()
        .then((result) => {
          if (!result?.expiresAt) {
            return;
          }

          window.dispatchEvent(
            new CustomEvent(ADMIN_SESSION_REFRESHED_EVENT, {
              detail: { expiresAt: result.expiresAt },
            }),
          );
        })
        .catch(() => undefined);
    };

    for (const eventName of ADMIN_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, refreshAfterActivity, { passive: true });
    }

    return () => {
      for (const eventName of ADMIN_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, refreshAfterActivity);
      }
    };
  }, []);

  return null;
}
