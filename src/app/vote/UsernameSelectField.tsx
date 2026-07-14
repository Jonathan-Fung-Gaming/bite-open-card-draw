import { ChevronDown } from "lucide-react";

type UsernameOption = {
  id: string;
  startggUsername: string;
};

type UsernameSelectFieldProps = {
  disabled: boolean;
  onChange: (playerId: string) => void;
  players: readonly UsernameOption[];
  value: string;
};

export function UsernameSelectField({
  disabled,
  onChange,
  players,
  value,
}: UsernameSelectFieldProps) {
  return (
    <>
      <label
        className="text-sm font-bold uppercase tracking-[0.16em] text-ember-300"
        htmlFor="startgg-username"
      >
        Select your start.gg username
      </label>
      <div className="relative mt-3">
        <select
          id="startgg-username"
          className="min-h-11 w-full appearance-none truncate rounded border border-metal-700 bg-black/35 py-3 pl-3 pr-12 text-white focus:border-ember-300 focus:outline-none focus:ring-2 focus:ring-ember-300/50 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="startgg-username-select"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose username</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.startggUsername}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ember-300"
          data-testid="startgg-select-chevron"
          focusable="false"
        />
      </div>
    </>
  );
}
