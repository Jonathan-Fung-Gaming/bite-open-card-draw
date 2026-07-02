"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { STAGE_PUBLIC_REFRESH_INTERVAL_MS } from "@/lib/vote/phone-view";

export function StageAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      router.refresh();
    }, STAGE_PUBLIC_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [router]);

  return null;
}
