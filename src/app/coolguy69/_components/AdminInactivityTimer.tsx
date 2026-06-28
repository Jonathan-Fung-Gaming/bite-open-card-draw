"use client";

import { useEffect, useState } from "react";

type AdminInactivityTimerProps = {
  expiresAt: number;
};

export function AdminInactivityTimer({ expiresAt }: AdminInactivityTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="rounded border border-metal-700 bg-black/25 px-3 py-2 font-mono text-sm text-metal-300">
      Session {minutes}:{seconds}
    </div>
  );
}
