import { cx } from "@/components/ui";

// The plate glyph (mock C): a menu letter in a circle. Themed via semantic tokens so it works
// on night AND resolves to bone on the print sheet (data-theme="bone"). The whole vocabulary
// is the glyph — no colored fills. standard = 1px taupe ring; dietary = wine double-ring (the
// gap uses the surface token so it blends on any ground); empty = dashed hairline, no letter.
export type GlyphVariant = "standard" | "dietary" | "empty";

export function PlateGlyph({ letter, variant = "standard", size = 20, className }: {
  letter?: string; variant?: GlyphVariant; size?: number; className?: string;
}) {
  if (variant === "empty") {
    return <span style={{ width: size, height: size }} className={cx("inline-block shrink-0 rounded-full border border-dashed border-hairline-token align-middle", className)} />;
  }
  const dietary = variant === "dietary";
  const fs = Math.round(size * 0.58 * 100) / 100;
  return (
    <span
      style={{
        width: size, height: size, fontSize: fs,
        boxShadow: dietary ? "0 0 0 1.5px var(--color-surface-card), 0 0 0 2.5px var(--color-wine)" : undefined,
      }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border align-middle font-display leading-none text-text-primary",
        dietary ? "border-wine" : "border-taupe",
        className,
      )}
    >
      {letter}
    </span>
  );
}
