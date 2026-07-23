// MTG color-pie helpers. Single source for WUBRG identity → tint mapping,
// mirroring how real card frames pick a color: mono = that hue, multi = gold,
// colorless = artifact steel.

export const WUBRG = ["W", "U", "B", "R", "G"] as const;
export type Mana = (typeof WUBRG)[number];

// SSOT for saturated identity dots (JS inline styles). These values are
// mirrored by hand in tailwind.config.js `colors.mana` (used as utility
// classes + the app-wide danger token `mana-r`). Keep the two in sync.
// NOTE: ManaCost.tsx uses a SEPARATE, intentionally-pale palette for in-cost
// symbols — do not fold it in here.
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

/** Frame tint for a card's color identity — the spine/glow color on a tile. */
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
