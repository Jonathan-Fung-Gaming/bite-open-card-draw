import { AlertTriangle } from "lucide-react";

type DangerousActionDialogProps = {
  action: string;
  consequence: string;
};

export function DangerousActionDialog({ action, consequence }: DangerousActionDialogProps) {
  return (
    <section className="rounded-lg border border-ember-500/35 bg-ember-900/20 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ember-300" />
        <div>
          <p className="font-bold text-white">You are about to {action}.</p>
          <p className="mt-1 text-sm text-metal-300">This will {consequence}.</p>
        </div>
      </div>
      <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor="danger-password">
        Admin password
      </label>
      <input
        id="danger-password"
        type="password"
        disabled
        placeholder="Required before destructive actions"
        className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-metal-300"
      />
    </section>
  );
}
