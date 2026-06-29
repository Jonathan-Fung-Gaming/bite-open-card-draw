"use client";

import { useCallback, useState, useTransition } from "react";

type DebugSnapshotDownloadProps = {
  action: (formData: FormData) => Promise<{
    filename: string;
    json: string;
  }>;
  disabled?: boolean;
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

export function DebugSnapshotDownload({ action, disabled = false }: DebugSnapshotDownloadProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startDownload = useCallback((formData: FormData) => {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await action(formData);

        downloadJsonFile(result.filename, result.json);
        setMessage(`Downloaded ${result.filename}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Debug snapshot download failed.");
      }
    });
  }, [action, isPending]);

  return (
    <form action={startDownload} className="mt-3 rounded border border-metal-700 bg-black/25 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
        Redacted debug backup
      </p>
      <p className="mt-2 text-xs text-metal-300">
        Requires active host control and password re-entry. Blocked while voting is active or paused.
      </p>
      <input
        name="adminPassword"
        type="password"
        required
        disabled={disabled || isPending}
        placeholder="Admin password"
        className="mt-3 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-white"
      />
      <button
        className="mt-3 w-full rounded border border-metal-700 px-3 py-2 text-sm font-bold uppercase text-metal-300 disabled:opacity-40"
        disabled={disabled || isPending}
        type="submit"
      >
        Download redacted snapshot
      </button>
      {message ? <p className="mt-2 text-xs text-metal-300">{message}</p> : null}
    </form>
  );
}
