# UBDB — Double-Faced Card Handling — Design

**Date:** 2026-07-14
**Status:** Approved design, pre-plan
**Extends:** `2026-07-14-ubdb-scryfall-clone-design.md`

## Purpose

Handle two-image double-faced cards (DFCs) across UBDB: preview the back face on
hover in the grid, show both faces on the card page, let each face carry its own
Universes Within (UW) reskins, and gate a separate back-face grid tile behind a
user setting.

## Scope

Targets the two layouts that have two distinct card images: `transform` (53
cards) and `modal_dfc` (10 cards) — 63 cards in the current snapshot. Other
multi-part layouts (`meld`, `split`, `adventure`, `saga`, `class`) render as
today (single front image, no back face, no flip).

## Locked Decisions

- **Setting gates a separate back-face tile** in the grid, not the hover-flip.
  Hover-flip always works on a DFC tile. Default: one front tile that hover-flips
  to preview the back. Setting on: the back face also appears as its own tile.
- **Back-face tiles are a display-only expansion** — the frontend splits each DFC
  in the currently visible results into two tiles. Search, sort, pagination, and
  counts stay per-card (a query matches the whole card). No backend search change.
- **Per-face reskins** anchor on `oracle_id` + a `face` index (0 = front/single,
  1 = back). The field is reserved now; actual submission stays deferred with the
  reskin submit slice.
- Target layouts `transform` + `modal_dfc` only.
- Back-tile links deep-link to the card page back section (`#face-back`).
- The setting lives in a header gear popover, persisted to `localStorage`,
  default off.

## Architecture

Unchanged stack. Work is one plan, four tasks: data enrichment, reskin-model +
card-page both-sides, grid hover-flip tile, and the setting + back-tile
expansion.

---

## Slice A — Data enrichment (sync)

Two-image DFCs currently store only the front image (`prints[].image_normal`
resolves via the front-face fallback in `_images`) and discard the back face and
all per-face text. Extend `scripts/sync_ub_cards.py`:

### Card-level `faces[]`
A new `faces` key on every card:
- `[]` (empty) for single-faced cards.
- Length 2 for a two-image DFC (`transform`/`modal_dfc`): each entry
  `{name, mana_cost, type_line, oracle_text, colors, power, toughness, loyalty}`,
  read from Scryfall `card_faces[0]` and `card_faces[1]`. This is print-invariant
  text; missing numeric fields stay `None`, missing text stays `""`/`[]`.

### Print-level back images
Each `prints[]` entry gains `image_back_small` and `image_back_normal`, taken
from `card_faces[1].image_uris` (`small`, then `normal`/`large`/`png`). For
single-faced cards (no `card_faces[1]` images) both are `null`. Existing front
image keys are unchanged.

### Detection
A card is a two-image DFC iff `layout in {"transform", "modal_dfc"}` AND
`card_faces` has two entries each with `image_uris`. `faces` is populated only
then; otherwise `faces == []` and back-image keys are `null`.

**Tests (extends `scripts/tests/test_normalize.py`):** a `transform` fixture
print produces `faces` length 2 with both names and the front/back text;
`image_back_normal` set from `card_faces[1]`; a normal (single-faced) print
produces `faces == []` and `image_back_normal is None`; front card-level fields
(name, mana_cost, power) still come from the front face for DFCs (regression).

---

## Slice B — Reskin model (per face) + card page both-sides

### Reskin model
Add `face` to the reskin schema and the `Reskin` TypeScript type:
`face: number` — `0` for the front (and for all single-faced cards), `1` for the
back. Backend `/api/cards/<id>/reskins` still returns `[]` this slice (submit is
deferred), but responses that later carry reskins include `face`, and the card
page groups by it. Consumers treat a missing/`undefined` `face` as `0`.

### Card page (`/card/<oracle_id>`)
When `card.faces.length === 2`, render two stacked face blocks:
- **Front:** `prints[0].image_normal`, `faces[0]` text (name, mana pips, type,
  oracle, P/T or loyalty), and a reskin section filtered to `face === 0`.
- **Back:** `prints[0].image_back_normal`, `faces[1]` text, and a reskin section
  filtered to `face === 1`. Anchored with `id="face-back"` for deep links.

Each section keeps the existing "recommended first" ordering and a per-face
"Suggest a design" placeholder (disabled — submit is a later slice). When
`faces.length !== 2`, the page renders exactly as today (single face).

**Tests:** frontend build clean; card page shows two reskin sections + two images
for a DFC and one for a normal card; `Reskin.face` present in the type.

---

## Slice C — Grid hover-flip tile

A `DfcTile` component used by `CardGrid`/`ResultViews` when `faces.length === 2`:
- Renders the front image by default (same size/shape as a normal tile).
- On mouse-enter: after a short delay, flips to the back with a CSS 3D
  `rotateY(180deg)` transition, holds the back for **2 seconds**, then flips back
  to the front. Re-hovering restarts the cycle; mouse-leave cancels any pending
  timer and returns to front.
- Uses `image_back_normal` through `getImageSrc` (image-proxy). If the back image
  is missing, no flip (falls back to a static front tile).
- Honors `prefers-reduced-motion: reduce` — no flip animation (static front).
- Timers are cleared on unmount to avoid state updates on an unmounted node.

Non-DFC tiles use the existing image tile unchanged.

**Tests:** `DfcTile` renders front + back `<img>` with the two proxied URLs and a
flip container; build clean. (Timed animation itself is verified by the runtime
smoke check, not a unit test.)

---

## Slice D — Setting + back-face tile expansion

### Setting store
A small client setting persisted to `localStorage` under `ubdb.settings`:
`{ splitDfcTiles: boolean }`, default `false`. A header **gear button** opens a
popover with the toggle *"Show both faces of double-faced cards."* Reading and
writing the setting is centralized in a tiny `useSettings` hook (or module) so
the grid and popover share one source of truth; a change re-renders the grid.

### Back-tile expansion (display-only)
On the results page, when `splitDfcTiles` is on, expand the visible result list:
for each card with `faces.length === 2`, emit a second, back-face tile
immediately after its front tile. The back tile shows `image_back_normal` and
`faces[1].name`, and links to `/card/<oracle_id>#face-back`. When off, DFCs show
a single (hover-flip) tile. Expansion is per rendered page only — it does not
change `total`, pagination, or server results.

**Tests:** with the setting off, a DFC yields one tile; on, two tiles (second
links to `#face-back`); a normal card yields one tile either way; build clean.

---

## Error Handling

- Missing back image → no flip, no back tile (single front tile); card page back
  block omits the image but still shows back text if present.
- A card flagged `transform`/`modal_dfc` but lacking a valid `card_faces[1]`
  image → treated as single-faced (`faces == []`); never throws.
- Reduced-motion users get no animation.
- Timers cleared on unmount / mouse-leave — no setState-after-unmount.

## Testing

- **Backend (pytest):** `faces[]` shape, back-image mapping, single-faced empties,
  front-field regression — extends `scripts/tests/test_normalize.py`.
- **Frontend:** build type-clean each slice; component-shape checks on `DfcTile`,
  the card page two-section render, and the setting expansion; runtime smoke for
  the timed flip.

## Non-Goals / Deferred

- Actual per-face reskin submission / moderation (deferred with the submit slice;
  only the `face` field + per-face sections land now).
- Server-side search over back faces (display-only expansion by decision).
- `meld` / `split` / `adventure` / `saga` special handling (front-only).
- Persisting the setting server-side or across devices (localStorage only).

## Dependencies

None new. Back-image host `cards.scryfall.io` is already in the image-proxy
allowlist.
