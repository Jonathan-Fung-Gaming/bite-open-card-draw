"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const RESULTS_REFRESH_INTERVAL_MS = 2000;

export function ResultsAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      router.refresh();
    }, RESULTS_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [router]);

  return null;
}
