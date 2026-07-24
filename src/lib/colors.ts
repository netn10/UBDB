// MTG color-pie helpers: WUBRG identity → tint. Mono = that hue, multi = gold, colorless = steel.

export const WUBRG = ["W", "U", "B", "R", "G"] as const;
export type Mana = (typeof WUBRG)[number];

// Saturated identity dots (inline styles), mirrored by hand in tailwind.config.js
// `colors.mana`; keep in sync. ManaCost.tsx uses a separate pale palette, don't fold in.
export const MANA_HEX: Record<Mana, string> = {
  W: "#F8F2D8",
  U: "#3A7DC4",
  B: "#4A4A52",
  R: "#C6483E",
  G: "#4E8C5B",
};

export const MANA_LABEL: Record<Mana, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const GOLD = "#C9A227";
const STEEL = "#8A8172";

/** Frame tint for a card's color identity: the spine/glow color on a tile. */
export function identityTint(identity: string[]): string {
  const colors = identity.filter((c): c is Mana => (WUBRG as readonly string[]).includes(c));
  if (colors.length === 0) return STEEL; // colorless / artifact
  if (colors.length === 1) return MANA_HEX[colors[0]];
  return GOLD; // multicolor
}

/** Normalize a `ci` URL param (e.g. "wu") into ordered uppercase mana letters. */
export function parseCi(ci: string | null | undefined): Mana[] {
  if (!ci) return [];
  const set = new Set(ci.toUpperCase().split(""));
  return WUBRG.filter((c) => set.has(c));
}

/** Serialize selected pips back to a `ci` param value, WUBRG-ordered, lowercase. */
export function serializeCi(colors: Mana[]): string {
  return WUBRG.filter((c) => colors.includes(c)).join("").toLowerCase();
}
