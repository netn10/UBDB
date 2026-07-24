"use client";
// Shared "no Universes Within version yet" tile treatment: un-reskinned art
// dims + desaturates (restored on hover) with a corner tag. One place = consistent.

/** A card is "dimmed" when the dim toggle is on and it has zero reskins. */
export function isDimmed(count: number | undefined, dim: boolean): boolean {
  return dim && (count ?? 0) === 0;
}

/** Applied to the <img> only, so overlay tags/badges stay crisp. */
export const dimImgClass =
  "grayscale opacity-50 transition duration-200 group-hover:grayscale-0 group-hover:opacity-100";

/** Corner label; render as an absolute child of a `relative` tile. */
export function NoUwTag() {
  return (
    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-card bg-frame/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-dark/90 ring-1 ring-gold/50 backdrop-blur-sm">
      No UW Yet
    </span>
  );
}
