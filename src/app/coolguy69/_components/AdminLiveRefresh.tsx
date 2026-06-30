"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ADMIN_LIVE_REFRESH_MS = 5000;

function activeElementIsEditing() {
  const element = document.activeElement;

  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLSelectElement) {
    return true;
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

export function AdminLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || activeElementIsEditing()) {
        return;
      }

      router.refresh();
    }, ADMIN_LIVE_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
