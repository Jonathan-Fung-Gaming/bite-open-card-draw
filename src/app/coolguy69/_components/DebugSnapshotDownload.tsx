"use client";

import { useCallback, useState, useTransition } from "react";

type DebugSnapshotDownloadProps = {
  action: () => Promise<{
    filename: string;
    json: string;
  }>;
};

function downloadJsonFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DebugSnapshotDownload({ action }: DebugSnapshotDownloadProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startDownload = useCallback(() => {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await action();

        downloadJsonFile(result.filename, result.json);
        setMessage(`Downloaded ${result.filename}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Debug snapshot download failed.");
      }
    });
  }, [action, isPending]);

  return (
    <div className="mt-3 rounded border border-metal-700 bg-black/25 p-3">
      <button
        className="w-full rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300 disabled:opacity-40"
        disabled={isPending}
        onClick={startDownload}
        type="button"
      >
        Download debug snapshot
      </button>
      {message ? <p className="mt-2 text-xs text-metal-300">{message}</p> : null}
    </div>
  );
}
