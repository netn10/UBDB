# UBDB MTG-Native Reskin — Design

Date: 2026-07-16
Goal: replace the generic "AI-slop" SaaS look (purple accent, system font, uniform gray rounded cards) with a distinctive MTG-native visual identity. UI + UX pass, no backend/data changes.

## Thesis
Universes Beyond cards are premium, gold-framed crossover cards. The app should read like an official Magic tool. **Signature = MTG's color pie (W/U/B/R/G):** it is both the brand mark and the primary color filter. A card's color identity tints its own tile — structure encodes truth.

## Token system

### Palette (Tailwind `theme.extend.colors`)
| token | light | dark | role |
|---|---|---|---|
| `cardstock` | `#E9E1CE` | — | ground (aged card-border cream, deliberately not slop `#F4F1EA`) |
| `frame` (frame-black) | — | `#14110C` | dark ground (warm frame black) |
| `surface` | `#F3EEE0` | `#221C13` | panels / header bar |
| `ink` | `#1B160E` | `#E7DFCB` | text (sepia-black, MTG rules-text warmth) |
| `gold` (legend-gold) | `#C9A227` | `#D8B23A` | accent — MTG gold/multicolor legendary frame |

Mana pip colors (identity only, never app chrome): W `#F8F2D8` · U `#3A7DC4` · B `#4A4A52` · R `#C6483E` · G `#4E8C5B`. Defined as `mana.w/u/b/r/g` in Tailwind.

### Type (free Google Fonts via `next/font/google`)
- Display / wordmark / structural labels: **Cinzel** (inscriptional caps ≈ Beleren titles / Trajan). CSS var `--font-display`.
- Card names + body: **Spectral** (transitional serif ≈ MPlantin rules text). CSS var `--font-body`, applied to `body`.
- Mana / CMC / data: **IBM Plex Mono**. CSS var `--font-mono`.

## Signature: color-pie filter
- Header shows a row of 5 WUBRG pips = brand mark + filter.
- Pips toggle a dedicated `ci` URL param (e.g. `ci=wu`). Free-text stays in `q`.
- `page.tsx` composes the effective search query: `q` + (if `ci` set) ` id:<ci>` before calling `searchCards`. Backend already supports `id:` (color identity, subset match).
- Active pips glow in their mana color + gold ring; inactive are muted.

## Layout / chrome
- **Header** (`Header.tsx`): surface bar, Cinzel `UBDB` wordmark in gold, pip row as signature. Search input restyled (gold focus ring, no gray box).
- **Card tiles** (`CardGrid.tsx`, `DfcTile.tsx`): drop uniform `rounded-xl` + gray border + drop-shadow. MTG card corner radius, a thin **color-identity spine/glow** keyed to `color_identity` (gold for multicolor, gray for colorless). Hover = gold hairline frame + subtle lift (replace translate-up).
- **Controls** (`page.tsx`, `ResultViews.tsx` list): gold-outline pills; active = filled gold. Pager likewise.
- **Initial state**: small Cinzel masthead + pip pie when no query, instead of dropping straight into a grid.

## Scope (files)
`tailwind.config.js`, `src/app/globals.css`, `src/app/layout.tsx` (fonts), `src/components/Header.tsx`, `src/components/CardGrid.tsx`, `src/components/DfcTile.tsx`, `src/components/ResultViews.tsx`, `src/app/page.tsx`. New helper: color-identity → tint mapping (small `src/lib/colors.ts`).

No backend, no data, no search-grammar changes.

## Out of scope / YAGNI
- No new deps beyond Google fonts.
- No franchise/card-detail redesign beyond inherited tokens (they get the new palette/type for free via globals; bespoke layout deferred).
- No animation beyond hover + reduced-motion-safe focus.

## Quality floor
Responsive to mobile, visible keyboard focus (gold ring), `prefers-reduced-motion` respected, both light/dark themed.

## Constraints
Per owner rule: no auto-commit, no AI/Claude mentions in any artifact or commit.
