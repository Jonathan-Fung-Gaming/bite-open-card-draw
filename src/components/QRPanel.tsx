import Link from "next/link";
import { QrCode } from "lucide-react";

type QRPanelProps = {
  roomPath?: string;
};

export function QRPanel({ roomPath = "/room" }: QRPanelProps) {
  return (
    <section className="metal-panel rounded-lg p-4">
      <div className="flex items-center gap-3 text-ember-300">
        <QrCode aria-hidden="true" className="h-6 w-6" />
        <p className="text-xs font-semibold uppercase tracking-[0.22em]">Room Access</p>
      </div>
      <Link
        href={roomPath}
        className="mt-4 flex aspect-square max-h-56 items-center justify-center rounded-md border border-ember-300/25 bg-white p-5 text-furnace-950"
      >
        <QrCode aria-label="QR placeholder for room access" className="h-24 w-24" strokeWidth={1.5} />
      </Link>
      <p className="mt-3 text-center font-mono text-sm text-metal-300">{roomPath}</p>
    </section>
  );
}
