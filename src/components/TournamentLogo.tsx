import Image from "next/image";
import clsx from "clsx";

type TournamentLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "standard" | "compact" | "mobile-compact";
};

export function TournamentLogo({
  className,
  priority = false,
  size = "standard",
}: TournamentLogoProps) {
  const sizeClasses =
    size === "compact"
      ? "h-12 w-28 sm:h-14 sm:w-36"
      : size === "mobile-compact"
        ? "h-10 w-24 sm:h-24 sm:w-56"
        : "h-20 w-44 sm:h-24 sm:w-56";
  const responsiveSizes =
    size === "compact"
      ? "(max-width: 640px) 112px, 144px"
      : size === "mobile-compact"
        ? "(max-width: 640px) 96px, 224px"
        : "(max-width: 640px) 176px, 224px";

  return (
    <div className={clsx("relative", sizeClasses, className)}>
      <Image
        src="/brand/tournament-logo-web.png"
        alt="Pump It Up Open Stage tournament logo"
        width={512}
        height={339}
        priority={priority}
        sizes={responsiveSizes}
        className="pointer-events-none h-full w-full object-contain drop-shadow-[0_0_18px_rgba(255,122,26,0.45)]"
      />
    </div>
  );
}
