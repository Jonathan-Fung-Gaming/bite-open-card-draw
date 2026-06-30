import Image from "next/image";
import clsx from "clsx";

type TournamentLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "standard" | "compact";
};

export function TournamentLogo({ className, priority = false, size = "standard" }: TournamentLogoProps) {
  return (
    <div
      className={clsx(
        "relative",
        size === "compact" ? "h-12 w-28 sm:h-14 sm:w-36" : "h-20 w-44 sm:h-24 sm:w-56",
        className,
      )}
    >
      <Image
        src="/brand/tournament-logo.png"
        alt="Pump It Up Open Stage tournament logo"
        fill
        priority={priority}
        sizes={size === "compact" ? "(max-width: 640px) 112px, 144px" : "(max-width: 640px) 176px, 224px"}
        className="pointer-events-none object-contain drop-shadow-[0_0_18px_rgba(255,122,26,0.45)]"
      />
    </div>
  );
}
