"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { STAGE_PUBLIC_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

type StageAutoRefreshProps = {
  enabled?: boolean;
};

export function StageAutoRefresh({ enabled = true }: StageAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, STAGE_PUBLIC_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, router]);

  return null;
}
