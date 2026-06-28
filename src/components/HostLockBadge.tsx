import clsx from "clsx";
import { RadioTower } from "lucide-react";

type HostLockBadgeProps = {
  status: "inactive" | "active" | "readonly";
};

const statusCopy = {
  inactive: "Host lock inactive",
  active: "Host control active",
  readonly: "Read-only admin",
} satisfies Record<HostLockBadgeProps["status"], string>;

export function HostLockBadge({ status }: HostLockBadgeProps) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]",
        status === "active" && "border-ember-300/70 bg-ember-900/50 text-ember-300",
        status === "readonly" && "border-metal-500/40 bg-metal-850 text-metal-300",
        status === "inactive" && "border-metal-700 bg-black/25 text-metal-300",
      )}
    >
      <RadioTower aria-hidden="true" className="h-4 w-4" />
      {statusCopy[status]}
    </div>
  );
}
