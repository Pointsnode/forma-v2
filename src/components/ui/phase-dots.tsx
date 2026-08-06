import { phaseDots, type Phase } from "@/lib/wedding";
import { cx } from "./cn";

const LIGHT = { done: "bg-teal", now: "bg-wine", ahead: "bg-[color:var(--color-hairline-token)]" } as const;
const DARK = { done: "bg-teal", now: "bg-wine", ahead: "bg-hairline-dark" } as const;

/** Four phase dots — sage done · wine current · sand/hairline ahead. */
export function PhaseDots({ phase, dark = false }: { phase: Phase; dark?: boolean }) {
  const map = dark ? DARK : LIGHT;
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px] align-middle">
      {phaseDots(phase).map((s, i) => (
        <i key={i} className={cx("inline-block h-[7px] w-[7px] rounded-[var(--radius)]", map[s])} />
      ))}
    </span>
  );
}
