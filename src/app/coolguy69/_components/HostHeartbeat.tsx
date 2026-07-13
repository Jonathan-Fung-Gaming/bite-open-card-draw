"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshHostLockAction } from "../actions";
import { ADMIN_SESSION_REFRESHED_EVENT } from "./AdminSessionHeartbeat";

type HostHeartbeatProps = {
  heartbeatAt: number | null;
  serverNowMs: number;
  status: "inactive" | "active" | "recoverable" | "readonly";
};

const HEARTBEAT_STALE_AFTER_MS = 15_000;

function formatSeconds(ms: number | null) {
  if (ms === null) {
    return "n/a";
  }

  const seconds = Math.max(0, Math.ceil(ms / 1000));

  return `${seconds}s`;
}

function statusCopy(
  status: HostHeartbeatProps["status"],
  failed: boolean,
  heartbeatAgeMs: number | null,
) {
  if (failed) {
    return "Heartbeat check failed; ownership retained";
  }

  switch (status) {
    case "active":
      return heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_STALE_AFTER_MS
        ? "Heartbeat missing; ownership retained"
        : "Heartbeat healthy";
    case "recoverable":
      return "Restore required";
    case "readonly":
      return heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_STALE_AFTER_MS
        ? "Heartbeat missing; owner retained"
        : "Owner heartbeat observed";
    default:
      return "No active owner";
  }
}

export function HostHeartbeat({ heartbeatAt, serverNowMs, status }: HostHeartbeatProps) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState(heartbeatAt);
  const [failed, setFailed] = useState(false);
  const active = status === "active";

  useEffect(() => {
    setLastHeartbeatAt(heartbeatAt);
    setFailed(false);
  }, [heartbeatAt, status]);

  useEffect(() => {
    const baseNowMs = serverNowMs;
    const basePerformanceMs = window.performance.now();
    const interval = window.setInterval(() => {
      setNowMs(baseNowMs + window.performance.now() - basePerformanceMs);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [serverNowMs]);

  useEffect(() => {
    if (!active || process.env.NEXT_PUBLIC_E2E_DISABLE_HOST_HEARTBEAT === "true") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshHostLockAction()
        .then((result) => {
          if (!result.ok) {
            setFailed(true);
            router.refresh();
            return;
          }

          setLastHeartbeatAt(result.heartbeatAt);
          setFailed(false);
          window.dispatchEvent(
            new CustomEvent(ADMIN_SESSION_REFRESHED_EVENT, {
              detail: { expiresAt: result.sessionExpiresAt },
            }),
          );
        })
        .catch(() => {
          setFailed(true);
          router.refresh();
        });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [active, router]);

  const heartbeatAgeMs = lastHeartbeatAt === null ? null : nowMs - lastHeartbeatAt;

  return (
    <div
      className="mt-4 rounded border border-metal-700 bg-black/25 p-3 text-sm"
      data-testid="host-heartbeat-confidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
          Heartbeat confidence
        </p>
        <p className="rounded border border-metal-700 bg-black/35 px-2 py-1 text-xs font-bold uppercase text-metal-300">
          {statusCopy(status, failed, heartbeatAgeMs)}
        </p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Owner</dt>
          <dd className="mt-1 break-words text-white">
            {status === "inactive"
              ? "none"
              : status === "readonly"
                ? "another browser"
                : "this browser"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Last heartbeat</dt>
          <dd className="mt-1 font-mono text-white">{formatSeconds(heartbeatAgeMs)} ago</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Ownership</dt>
          <dd className="mt-1 font-mono text-white">
            {status === "inactive" ? "unowned" : "retained until release or force"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 break-words text-xs text-metal-300">
        {active
          ? "This verified host sends a health heartbeat every 5 seconds and renews its admin session. A missed heartbeat never releases ownership."
          : status === "recoverable"
            ? "Ownership is retained, but this browser must rotate its host credential with Restore before tournament controls are enabled."
            : status === "readonly"
              ? "Another admin browser owns the lock. Force takeover always needs the shared password, a warning confirmation, and an audit reason."
              : "No browser currently owns host control. Take host control before running tournament actions."}
      </p>
    </div>
  );
}
