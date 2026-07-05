"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshHostLockAction } from "../actions";

type HostHeartbeatProps = {
  expiresAt: number | null;
  heartbeatAt: number | null;
  ownerSessionId: string | null;
  serverNowMs: number;
  status: "inactive" | "active" | "readonly";
};

const HOST_LOCK_TTL_MS = 30 * 60_000;

function sessionPrefix(sessionId: string | null) {
  return sessionId ? sessionId.slice(0, 8) : "none";
}

function formatSeconds(ms: number | null) {
  if (ms === null) {
    return "n/a";
  }

  const seconds = Math.max(0, Math.ceil(ms / 1000));

  return `${seconds}s`;
}

function statusCopy(status: HostHeartbeatProps["status"], failed: boolean) {
  if (failed) {
    return "Heartbeat check failed; refreshing";
  }

  switch (status) {
    case "active":
      return "Heartbeat OK";
    case "readonly":
      return "Read-only until takeover";
    default:
      return "No active heartbeat";
  }
}

export function HostHeartbeat({
  expiresAt,
  heartbeatAt,
  ownerSessionId,
  serverNowMs,
  status,
}: HostHeartbeatProps) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState(heartbeatAt);
  const [lockExpiresAt, setLockExpiresAt] = useState(expiresAt);
  const [failed, setFailed] = useState(false);
  const active = status === "active";

  useEffect(() => {
    setLastHeartbeatAt(heartbeatAt);
    setLockExpiresAt(expiresAt);
    setFailed(false);
  }, [expiresAt, heartbeatAt, status]);

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
        .then((refreshed) => {
          if (!refreshed) {
            setFailed(true);
            router.refresh();
            return;
          }

          const confirmedAt = Date.now();

          setLastHeartbeatAt(confirmedAt);
          setLockExpiresAt(confirmedAt + HOST_LOCK_TTL_MS);
          setFailed(false);
        })
        .catch(() => {
          setFailed(true);
          router.refresh();
        });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [active, router]);

  const heartbeatAgeMs = lastHeartbeatAt === null ? null : nowMs - lastHeartbeatAt;
  const expiresInMs = lockExpiresAt === null ? null : lockExpiresAt - nowMs;

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
          {statusCopy(status, failed)}
        </p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Owner session</dt>
          <dd className="mt-1 break-all font-mono text-white">{sessionPrefix(ownerSessionId)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Last heartbeat</dt>
          <dd className="mt-1 font-mono text-white">{formatSeconds(heartbeatAgeMs)} ago</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-[0.14em] text-metal-400">Takeover window</dt>
          <dd className="mt-1 font-mono text-white">
            {status === "inactive" ? "available now" : `in ${formatSeconds(expiresInMs)}`}
          </dd>
        </div>
      </dl>
      <p className="mt-3 break-words text-xs text-metal-300">
        {active
          ? "This browser sends a heartbeat every 5 seconds. If it stops, other admin browsers can take over when the lock expires."
          : status === "readonly"
            ? "Another admin browser owns the lock. Force takeover needs the admin password and an audit reason until the heartbeat expires."
            : "No browser currently owns host control. Take host control before running tournament actions."}
      </p>
    </div>
  );
}
