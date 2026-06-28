import Image from "next/image";
import clsx from "clsx";

type TournamentLogoProps = {
  className?: string;
  priority?: boolean;
};

export function TournamentLogo({ className, priority = false }: TournamentLogoProps) {
  return (
    <div className={clsx("relative h-20 w-44 sm:h-24 sm:w-56", className)}>
      <Image
        src="/brand/tournament-logo.png"
        alt="Pump It Up Open Stage tournament logo"
        fill
        priority={priority}
        sizes="(max-width: 640px) 176px, 224px"
        className="object-contain drop-shadow-[0_0_18px_rgba(255,122,26,0.45)]"
      />
    </div>
  );
}
