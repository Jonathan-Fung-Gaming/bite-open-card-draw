import Link from "next/link";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";
import { buildPublicRouteUrl, formatShortEventUrl } from "@/lib/public-url";

type QRPanelProps = {
  roomPath?: string;
};

export async function QRPanel({ roomPath = "/room" }: QRPanelProps) {
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
  } catch (error) {
    return (
      <section
        className="metal-panel rounded-lg border border-ember-300/45 p-4"
        data-testid="room-qr-setup-error"
      >
        <div className="flex items-center gap-3 text-ember-300">
          <QrCode aria-hidden="true" className="h-6 w-6" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">QR setup error</p>
        </div>
        <p className="mt-4 text-sm font-bold text-white">
          Configure NEXT_PUBLIC_SITE_URL to the absolute public event origin before using QR entry.
        </p>
        <p className="mt-2 text-xs text-metal-300">
          {error instanceof Error ? error.message : "Could not generate the public room QR code."}
        </p>
      </section>
    );
  }

  const shortRoomUrl = formatShortEventUrl(roomUrl);

  return (
    <section className="metal-panel rounded-lg p-4" data-testid="room-qr-panel">
      <div className="flex items-center gap-3 text-ember-300">
        <QrCode aria-hidden="true" className="h-6 w-6" />
        <p className="text-xs font-semibold uppercase tracking-[0.22em]">Scan to vote or view charts</p>
      </div>
      <Link
        href={roomPath}
        className="mt-4 flex aspect-square w-full max-w-72 items-center justify-center rounded-md border border-ember-300/25 bg-white p-3 text-furnace-950 shadow-ember-tight"
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
      </Link>
      <p
        className="mt-3 break-words text-center font-mono text-base font-black text-white"
        data-testid="room-short-url"
      >
        {shortRoomUrl}
      </p>
    </section>
  );
}
