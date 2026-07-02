"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshHostLockAction } from "../actions";

type HostHeartbeatProps = {
  active: boolean;
};

export function HostHeartbeat({ active }: HostHeartbeatProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active || process.env.NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT === "true") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshHostLockAction()
        .then((refreshed) => {
          if (!refreshed) {
            router.refresh();
          }
        })
        .catch(() => {
          router.refresh();
        });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [active, router]);

  return null;
}
