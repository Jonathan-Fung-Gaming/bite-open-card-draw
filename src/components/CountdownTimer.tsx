type CountdownTimerProps = {
  label: string;
  minutes: string;
  caption?: string;
};

export function CountdownTimer({ label, minutes, caption }: CountdownTimerProps) {
  return (
    <div className="metal-panel rounded-lg px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">{label}</p>
      <div className="mt-2 font-mono text-5xl font-black tabular-nums text-white sm:text-7xl">{minutes}</div>
      {caption ? <p className="mt-2 text-sm text-metal-300">{caption}</p> : null}
    </div>
  );
}
