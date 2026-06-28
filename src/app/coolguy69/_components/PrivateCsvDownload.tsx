"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type PrivateCsvDownloadProps = {
  roundNumber: 1 | 2 | 3 | 4;
  enabled: boolean;
  autoDownloadKey: string | null;
  action: (roundNumber: 1 | 2 | 3 | 4) => Promise<{
    filename: string;
    csv: string;
  }>;
};

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function PrivateCsvDownload({ roundNumber, enabled, autoDownloadKey, action }: PrivateCsvDownloadProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  const startDownload = useCallback(() => {
    if (!enabled || isPending) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await action(roundNumber);

        downloadTextFile(result.filename, result.csv);
        setMessage(`Downloaded ${result.filename}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Private CSV download failed.");
      }
    });
  }, [action, enabled, isPending, roundNumber]);

  useEffect(() => {
    if (!enabled || !autoDownloadKey || autoStarted.current) {
      return;
    }

    const storageKey = `bite-open-private-csv:${autoDownloadKey}`;

    if (window.localStorage.getItem(storageKey) === "done") {
      return;
    }

    autoStarted.current = true;
    window.localStorage.setItem(storageKey, "done");
    startDownload();
  }, [autoDownloadKey, enabled, startDownload]);

  return (
    <div className="rounded border border-metal-700 bg-black/25 p-3">
      <button
        className="button-metal w-full rounded px-4 py-2 text-sm font-bold uppercase disabled:opacity-40"
        disabled={!enabled || isPending}
        onClick={startDownload}
        type="button"
      >
        Download private ballot CSV
      </button>
      {message ? <p className="mt-2 text-xs text-metal-300">{message}</p> : null}
    </div>
  );
}
