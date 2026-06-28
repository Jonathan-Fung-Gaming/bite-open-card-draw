"use client";

import { useEffect } from "react";
import { refreshHostLockAction } from "../actions";

type HostHeartbeatProps = {
  active: boolean;
};

export function HostHeartbeat({ active }: HostHeartbeatProps) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshHostLockAction();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [active]);

  return null;
}
