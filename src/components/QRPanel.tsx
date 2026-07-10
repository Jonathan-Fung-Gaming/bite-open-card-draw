import { QrCode } from "lucide-react";
import QRCode from "qrcode";
import clsx from "clsx";
import { buildPublicRouteUrl, formatShortEventUrl } from "@/lib/public-url";

type QRPanelProps = {
  roomPath?: string;
  compact?: boolean;
};

export async function QRPanel({ roomPath = "/room", compact = false }: QRPanelProps) {
  let roomUrl: string;
  let qrSvg: string;

  try {
    roomUrl = buildPublicRouteUrl(roomPath);
    qrSvg = await QRCode.toString(roomUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: {
        dark: "#080706",
        light: "#ffffff",
      },
    });
  } catch {
    return (
      <section
        className="metal-panel rounded-lg border border-ember-300/45 p-4"
        data-testid="room-qr-setup-error"
      >
        <div className="flex items-center gap-3 text-ember-300">
          <QrCode aria-hidden="true" className="h-6 w-6" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">Room QR unavailable</p>
        </div>
        <p className="mt-4 text-sm font-bold text-white">
          Ask the host to set the public event link, then refresh this display before audience
          entry.
        </p>
      </section>
    );
  }

  const shortRoomUrl = formatShortEventUrl(roomUrl);

  return (
    <section
      className={clsx("metal-panel rounded-lg", compact ? "p-2" : "p-4")}
      data-testid="room-qr-panel"
    >
      <div className="flex items-center gap-3 text-ember-300">
        <QrCode aria-hidden="true" className={compact ? "h-5 w-5" : "h-6 w-6"} />
        <p className="text-xs font-semibold uppercase tracking-[0.22em]">
          Scan to vote or view charts
        </p>
      </div>
      <div
        className={clsx(
          "mx-auto flex aspect-square w-full items-center justify-center rounded-md border border-ember-300/25 bg-white text-furnace-950 shadow-ember-tight",
          compact ? "mt-2 max-w-44 p-1.5" : "mt-4 max-w-72 p-3",
        )}
        data-qr-target={roomUrl}
        data-testid="room-qr-link"
      >
        <span
          aria-label={`QR code for ${shortRoomUrl}`}
          className="qr-code-svg block w-full"
          data-testid="room-qr-code"
          role="img"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>
      <p
        className={clsx(
          "break-words text-center font-mono font-black text-white",
          compact ? "mt-1 text-xs" : "mt-3 text-base",
        )}
        data-testid="room-short-url"
      >
        {shortRoomUrl}
      </p>
    </section>
  );
}
