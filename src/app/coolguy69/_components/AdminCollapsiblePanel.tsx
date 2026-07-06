"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import clsx from "clsx";

type AdminCollapsiblePanelProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  eyebrow?: string;
  id: string;
  summary?: ReactNode;
  testId?: string;
  title: string;
};

export function AdminCollapsiblePanel({
  children,
  defaultOpen = false,
  eyebrow,
  id,
  summary,
  testId,
  title,
}: AdminCollapsiblePanelProps) {
  const fallbackId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const storageKey = `bite-open-admin-panel:${id || fallbackId}`;

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored === "open") {
      setOpen(true);
    } else if (stored === "closed") {
      setOpen(false);
    }
  }, [storageKey]);

  return (
    <details
      className="metal-panel rounded-lg p-0"
      data-testid={testId}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;

        setOpen(nextOpen);
        window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
      }}
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:hidden">
        <span className="min-w-0">
          {eyebrow ? (
            <span className="block text-xs font-semibold uppercase text-ember-300">{eyebrow}</span>
          ) : null}
          <span className="mt-1 block break-words text-2xl font-black uppercase text-white">
            {title}
          </span>
          {summary ? <span className="mt-1 block text-sm text-metal-300">{summary}</span> : null}
        </span>
        <span
          className={clsx(
            "shrink-0 rounded border border-metal-700 bg-black/25 px-3 py-2 text-xs font-black uppercase",
            open ? "text-ember-300" : "text-metal-300",
          )}
        >
          {open ? "Collapse" : "Open"}
        </span>
      </summary>
      <div className="border-t border-ember-300/15 p-4">{children}</div>
    </details>
  );
}
