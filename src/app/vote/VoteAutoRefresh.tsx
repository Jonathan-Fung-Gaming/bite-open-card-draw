"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type VoteAutoRefreshProps = {
  intervalMs?: number;
};

export function VoteAutoRefresh({ intervalMs = 2000 }: VoteAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [intervalMs, router]);

  return null;
}
