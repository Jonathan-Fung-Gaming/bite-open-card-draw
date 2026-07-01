"use client";

import { useEffect, useState } from "react";
import { ADMIN_SESSION_REFRESHED_EVENT } from "./AdminSessionHeartbeat";

type AdminInactivityTimerProps = {
  expiresAt: number;
};

export function AdminInactivityTimer({ expiresAt }: AdminInactivityTimerProps) {
  const [currentExpiresAt, setCurrentExpiresAt] = useState(expiresAt);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    setCurrentExpiresAt(expiresAt);
  }, [expiresAt]);

  useEffect(() => {
    const updateExpiresAt = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const nextExpiresAt = event.detail?.expiresAt;

      if (typeof nextExpiresAt === "number") {
        setCurrentExpiresAt(nextExpiresAt);
      }
    };

    window.addEventListener(ADMIN_SESSION_REFRESHED_EVENT, updateExpiresAt);

    return () => {
      window.removeEventListener(ADMIN_SESSION_REFRESHED_EVENT, updateExpiresAt);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.floor((currentExpiresAt - Date.now()) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentExpiresAt]);

  useEffect(() => {
    if (remainingSeconds > 0) {
      return;
    }

    window.location.assign("/coolguy69");
  }, [remainingSeconds]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="rounded border border-metal-700 bg-black/25 px-3 py-2 font-mono text-sm text-metal-300">
      Session {minutes}:{seconds}
    </div>
  );
}
