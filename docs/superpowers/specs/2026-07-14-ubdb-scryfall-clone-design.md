# UBDB — Scryfall-Style Clone — Design

**Date:** 2026-07-14
**Status:** Approved design, pre-plan
**Extends:** `2026-07-14-ubdb-design.md` (backbone slice 1, shipped)
**Supersedes:** the visual/search portions of the original spec's browse flow.

## Purpose

Rebuild UBDB's browse + search + card experience to the depth and look of
[Scryfall](https://scryfall.com), scoped to Magic's Universes Beyond (UB) cards
and their community Universes Within (UW) reskins. "Very robust, full clone":
image-first card grid, a real Scryfall-style query parser, view toggles, sort,
pagination, and rich card pages.

The read-only backbone (Scryfall sync → git JSON → Flask → Next) from slice 1 is
already shipped and stays. This design layers a proper search engine and a
Scryfall visual language on top of it.

## Scope refinement (2026-07-14) — UB-only, no within-universe version

The database contains ONLY Universes Beyond cards that have **no** Universes
Within (normal-Magic) equivalent — i.e. cards that debuted in Universes Beyond
and are not reprints of existing Magic cards. A card like Abrade (a normal card
reprinted in a UB product) is excluded, because its "within-universe" version is
the original card and it needs no community reskin.

Detection uses Scryfall's per-printing `reprint` flag, captured during sync at
no extra API cost: an oracle is kept iff at least one of its UB printings has
`reprint == False` (an original UB debut). Equivalent to the Scryfall query
`is:ub not:reprint game:paper`. This reduced the snapshot from ~4283 to **3091**
cards. Known edge (rare, accepted): a UB-born card that later received an
official within-universe reprint is still kept.

## Locked Decisions

- **Scope:** full Scryfall clone (not a visual reskin, not middle-ground).
- **Search engine:** backend query parser in Flask (server-side source of truth),
  not client-side filtering. 4273 cards is small; server-side is the authentic
  Scryfall architecture and keeps sort/pagination/query-syntax in one place.
- **Theme:** dark default (UBDB's existing identity) + a light-mode toggle in the
  header. Light mirrors real Scryfall's near-white UI.
- **Delivery:** one implementation plan, four ordered tasks (slices 2–5), each
  independently verifiable.
- **Reskin submit / moderation / export** (original spec) are untouched here and
  land in later slices.

## Architecture

Unchanged stack: Next.js 14 + Tailwind (front), Flask + on-disk git JSON (back),
Scryfall-synced `data/ub_cards/cards.json` as read-only source, `image-proxy` for
cross-origin card art. No live per-request Scryfall calls; sync script only.

Four slices:

1. **Data enrichment** — sync more Scryfall fields so real filters are possible.
2. **Backend search engine** — query parser + `/api/search` + sort + pagination.
3. **Scryfall visual shell + grid results** — header/footer, theme, image grid,
   view toggles, pagination, mana symbols.
4. **Rich card page + franchises + random + advanced-search form.**

---

## Slice 2 — Data enrichment

The slice-1 snapshot only carries `oracle_id, name, oracle_text, mana_cost,
type_line, ub_franchises, official_uw_image, art_uri, prints[]`. Scryfall search
needs more. Extend `scripts/sync_ub_cards.py` and the data model.

### Card-level fields to add
`colors` (array of `W U B R G`), `color_identity`, `cmc` (float; Scryfall's
`mana_value`), `rarity` (from the representative print), `power`, `toughness`,
`loyalty`, `keywords` (array), `layout`, `released_at` (earliest print date).

### Print-level fields to add
Per entry in `prints[]`: `rarity`, `released_at`, and the full image set —
`image_small`, `image_normal`, `image_art_crop`, `image_png` (was only a single
`art_uri`). The card page renders the **full card image** (`image_normal`), not
the art crop.

### Notes
- Numeric fields (`cmc`, `power`, `toughness`, `loyalty`) preserved as given by
  Scryfall; `*` power/toughness kept as string, excluded from numeric comparisons
  (treated as non-matching for `pow>=N`).
- Double-faced cards (`layout` = `modal_dfc` / `transform`): capture `card_faces`
  images where a top-level `image_uris` is absent, so front art still resolves.
- `art_uri` (slice-1 thumb key) kept as an alias of `image_normal` for backward
  compatibility with existing frontend code until slice 3 replaces it.

**Tests (pytest, extends `scripts/tests/test_normalize.py`):** new fields mapped;
missing `power`/`toughness` → `None`; `*` P/T preserved as string; DFC image
fallback via `card_faces`; `released_at` = earliest across prints; rarity present.

---

## Slice 3 — Backend search engine

A Scryfall-style query parser in Flask. Parse the `q` string into an ordered list
of predicates, apply them (implicit AND) against `_CARDS`, sort, paginate.

### Grammar (v1)
- **Bare words** → case-insensitive substring match on `name`.
- **`t:` / `type:`** → substring on `type_line`.
- **`o:` / `oracle:`** → substring on `oracle_text`.
- **`c:` / `color:`** → color set match over `colors` (letters `wubrg`, plus
  `c`/colorless). Supports `=`, `>=`, `<=`, `>`, `<` set-comparison semantics
  (Scryfall's color operators).
- **`id:` / `identity:`** → same comparators over `color_identity`.
- **`cmc:` / `mv:`, `pow:`, `tou:`, `loy:`** → numeric comparison
  (`< <= > >= = !=`); non-numeric card values never match.
- **`r:` / `rarity:`** → exact rarity (`common|uncommon|rare|mythic|special|bonus`),
  with `>= <=` ordering by rarity rank.
- **`set:` / `e:`** → any `prints[].set` code equals value.
- **`franchise:` / `fr:`** (UBDB-specific) → substring on any `ub_franchises`
  entry; quoted multi-word supported (`fr:"warhammer 40k"`).
- **`is:reskinned` / `has:reskin`** (UBDB-specific) → card has ≥1 approved reskin.
- **Negation:** leading `-` on any predicate inverts it (`-t:land`).
- **Quoting:** `"..."` groups multi-word values.
- **Out of scope for v1 (stretch):** `OR`, parentheses, regex `/.../`, `f:`
  legality (no legalities synced yet). Unknown operators produce a `warnings[]`
  entry and are ignored — never a 500.

### Sorting & pagination
- `order` ∈ `name | cmc | rarity | released | franchise` (default `name`).
- `dir` ∈ `asc | desc` (default `asc`).
- `page` (1-based), `page_size` (default 60, max 175 — Scryfall's page size).

### API
`GET /api/search?q=&order=&dir=&page=&page_size=` →
```
{ "cards": [ ...full card objects... ],
  "total": N, "page": P, "page_size": S, "has_more": bool,
  "warnings": [ "unknown operator: foo:" ] }
```
Existing `/api/cards/<oracle_id>` stays (now returns enriched payload).
`/api/search-index` may be retired once the frontend moves to `/api/search`.

**Tests (pytest):** tokenizer (quotes, negation, operator split); each operator
(name, type, oracle, color =/>=, cmc numeric, rarity ordering, set, franchise,
is:reskinned); implicit AND of two predicates; negation; unknown operator →
warning + ignored; sort by each key both directions; pagination math
(`has_more`, page bounds); empty query → all cards page 1.

---

## Slice 4 — Scryfall visual shell + grid results

Turn the plain page into the Scryfall look and wire it to `/api/search`.

### Global chrome
- **Header:** UBDB wordmark/logo, a fat search input (submits `q` to the results
  page), primary nav (Cards · Franchises · Random · Reskins), and a **theme
  toggle** (dark default ↔ light). Sticky.
- **Footer:** open-source / never-for-profit note, Scryfall data attribution,
  link to source.
- **Theme:** dark is default; toggle flips a `data-theme`/`class` on `<html>`,
  persisted to `localStorage`. Tailwind `dark:` variants; a small token set
  (bg, surface, border, text, accent) for both modes. Light target ≈ Scryfall's
  near-white.

### Results page (`/` and `/search?q=...`)
- **Image-first grid** of real card images (Scryfall signature) via `image-proxy`
  + `image_normal`. Responsive columns, hover lift.
- **View toggle:** Grid (images) · List (compact row: name, mana pips, type,
  franchise) · Text (dense name-only). Persisted per user.
- **Sort dropdown** (name/cmc/rarity/released/franchise) + direction.
- **Result header:** total count, active query echo, pagination (prev/next +
  page numbers) driven by `/api/search` `page`/`has_more`.
- **Mana symbols:** self-hosted `mana` webfont (Andrew Gioia, MIT/OFL) so
  `{2}{W}{U}` renders as colored pips offline — no external CDN (CSP/offline safe).

### Notes
- The current client-side substring search in `page.tsx` is replaced by fetches
  to `/api/search` (debounced). Query string is the URL source of truth
  (`/search?q=...&order=...&page=...`) so results are shareable/back-button-safe.

---

## Slice 5 — Rich card page + franchises + random + advanced search

### Card detail page (`/card/<oracle_id>`)
Rebuilt to Scryfall depth:
- Full card image (`image_normal`) left; details right.
- Name, mana pips, type line, oracle text, P/T or loyalty, rarity, franchise
  badges (each links to `fr:` search).
- **All prints** list (set name, code, collector #, rarity, release date).
- **Universes Within reskins** section: approved reskins, recommended first;
  "Suggest a design" placeholder when none (submit lands in a later slice).
- **Prev / Next** within the current result context + a **Random** button.

### Franchises index (`/franchises`)
List every UB franchise with a card count; each links to `franchise:"..."` search.
Backend: `GET /api/franchises` → `[{name, count}]` (derived from `_CARDS`).

### Random (`/random`)
Route that picks a random card and redirects to its card page.
Backend: `GET /api/random` → `{oracle_id}` (or 302). Deterministic seed not
required.

### Advanced search (`/advanced`)
A Scryfall-style form (name, type, oracle text, colors checkboxes, mana value
comparator, rarity, franchise, reskinned-only) that composes a `q` string and
navigates to `/search?q=...`. No new backend — it just builds the query the
slice-3 parser already understands.

**Tests:** backend `/api/franchises` counts, `/api/random` returns a valid
oracle_id; frontend smoke tests on card page render, franchises list, advanced
form → query-string composition.

---

## Error Handling

- Inherits slice-1 guarantees: browse serves the git snapshot; Scryfall etiquette
  (UA + throttle) in sync; image-proxy placeholder on art failure.
- **Search:** malformed/unknown operators never 500 — collected into
  `warnings[]` and surfaced to the user as a dismissible note; the rest of the
  query still runs.
- **Empty results:** a "no cards matched" state with the parsed query echoed and
  any warnings, plus a link to reset.
- **Numeric edge cases:** `*` power/toughness and null numerics are excluded from
  numeric comparisons rather than throwing.

## Testing

- **Backend (pytest):** enrichment mapping (slice 2), full parser + sort +
  pagination coverage (slice 3), franchises/random endpoints (slice 5). Match the
  cube/slice-1 pytest setup (seeded deterministic dataset via `UB_CARDS_JSON`).
- **Frontend:** `npm run build` type-clean at every slice; smoke checks on grid
  render + view toggle (slice 4) and card page + advanced form (slice 5).

## Non-Goals / Deferred

- Query `OR` / parentheses / regex operators (v1 is AND + negation).
- `f:` legality operator (no legalities synced).
- Reskin submit, auth, moderation, proxy export — original spec, later slices.
- In-browser card creator, upvotes, designer messaging — original deferred set.
- Server-side rendering of search (results are client-fetched from `/api/search`;
  SSR/SEO of result pages is a later concern).

## Dependencies added

- Frontend: self-hosted `mana` + `keyrune` webfont assets (MIT/OFL), vendored
  into `public/fonts` — no runtime CDN.
- No new backend runtime deps (parser is stdlib); pytest already present.
