"use client";

import { useEffect } from "react";
import { refreshAdminSessionAction } from "../actions";

const ADMIN_SESSION_HEARTBEAT_MS = 60_000;

export function AdminSessionHeartbeat() {
  useEffect(() => {
    const refresh = () => {
      void refreshAdminSessionAction();
    };
    const interval = window.setInterval(refresh, ADMIN_SESSION_HEARTBEAT_MS);

    refresh();

    return () => window.clearInterval(interval);
  }, []);

  return null;
}
