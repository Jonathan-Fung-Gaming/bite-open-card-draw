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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrivateCsvDownload({
  roundNumber,
  enabled,
  autoDownloadKey,
  action,
}: PrivateCsvDownloadProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoAttemptedKeyRef = useRef<string | null>(null);

  const startDownload = useCallback(
    (onSuccess?: () => void) => {
      if (!enabled || isPending) {
        return;
      }

      startTransition(async () => {
        try {
          const result = await action(roundNumber);

          downloadTextFile(result.filename, result.csv);
          onSuccess?.();
          setMessage(`Downloaded ${result.filename}.`);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? `${error.message} Refresh or use the manual download button to retry.`
              : "Private CSV download failed. Refresh or use the manual download button to retry.",
          );
        }
      });
    },
    [action, enabled, isPending, roundNumber],
  );

  useEffect(() => {
    if (!enabled || !autoDownloadKey) {
      return;
    }

    const storageKey = `bite-open-private-csv:${autoDownloadKey}`;

    if (window.localStorage.getItem(storageKey) === "done") {
      return;
    }

    if (autoAttemptedKeyRef.current === autoDownloadKey) {
      return;
    }

    autoAttemptedKeyRef.current = autoDownloadKey;
    startDownload(() => window.localStorage.setItem(storageKey, "done"));
  }, [autoDownloadKey, enabled, startDownload]);

  return (
    <div className="rounded border border-metal-700 bg-black/25 p-3">
      <button
        className="button-metal w-full rounded px-4 py-2 text-sm font-bold uppercase disabled:opacity-40"
        disabled={!enabled || isPending}
        onClick={() => startDownload()}
        type="button"
      >
        Download private ballot CSV
      </button>
      {!enabled ? (
        <p className="mt-2 text-xs text-metal-300">
          Available after the final two-chart reveal finishes on stage.
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-metal-300" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
