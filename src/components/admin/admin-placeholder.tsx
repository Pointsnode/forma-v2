// ADM-0 ships the shell; each screen is a titled placeholder until its phase lands.
export function AdminPlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <h1 className="font-display text-[26px] text-ink">{title}</h1>
      <p className="mt-2 text-[14px] text-text-meta">This screen ships in {phase}.</p>
    </div>
  );
}
