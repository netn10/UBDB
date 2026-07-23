# UBDB Magical Frontend — Design Spec

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan
**Scope:** Four additive frontend pieces — (1) Welcome page, (2) About page, (3) Binder view, (4) Route-change loading — plus a mechanical `/` → `/search` routing migration.

---

## 1. Goals

Turn UBDB from "clean and functional" into "magical" without touching business logic. Every change is additive or a mechanical link-repoint. No API, fetch, state, or handler logic changes.

**Sacred (never modified):** `searchCards`/`getCard`/`getReskins`/`getRandom` and all `lib/` logic, URL-param state flow, theme/settings logic, DFC face resolution.

**Success criteria:**
- Arriving at `/` feels cinematic; no dead flat landing.
- `/about` explains what UBDB is, editorially, and is linked from nav + footer.
- Binder view flips 3×3 sheets of the current result set as a 4th toggle, search/sort/filter untouched.
- Clicking any nav/card link shows a loading affordance.
- `next build` green; all existing routes still work.

---

## 2. Routing Migration — `/` → `/search`

The current `/` **is** the search app (idle masthead + `Results`). It moves to `/search`; `/` becomes the Welcome page.

### Move
- `src/app/page.tsx` → its `Results` + `Masthead` logic relocates to **`src/app/search/page.tsx`** (verbatim logic; only the internal `router.push` targets change to `/search?...`). The big idle `Masthead` is dropped on `/search` (Welcome now owns arrival); idle `/search` shows a slim one-line prompt instead.
- New `src/app/page.tsx` = Welcome (section 3).

### Repoint table (grep-verified 2026-07-18)
| File:line | Current | New |
|---|---|---|
| `search/page.tsx` (was page.tsx:71) | `router.push(`/?${next}`)` | `router.push(`/search?${next}`)` |
| `components/Header.tsx:19` (SearchForm) | `/?${next}` | `/search?${next}` |
| `components/Header.tsx:47` (ColorPie) | `/?${next}` | `/search?${next}` |
| `components/Header.tsx:80` (logo) | `href="/"` | stays `"/"` (logo → Welcome home — intended) |
| `app/advanced/page.tsx:168` | `/?q=…` | `/search?q=…` |
| `app/franchises/page.tsx:19` | `/?q=…` | `/search?q=…` |
| `app/card/[id]/page.tsx:107` (← Back) | `href="/"` | `href="/search"` (back to the app) |
| `app/card/[id]/page.tsx:116` (franchise chip) | `/?q=…` | `/search?q=…` |
| `app/random/route.ts` (error fallback) | redirect `/` | stays `/` (Welcome on error — fine) |

Card-detail links (`/card/[id]`) and suggest links are unaffected.

---

## 3. Welcome Page — `src/app/page.tsx`

Cinematic client component. Full-viewport hero, then a featured showcase, then entry.

### 3.1 Hero
- Giant Cinzel `UBDB` wordmark (`clamp` to viewport scale, larger than the current 5–6xl masthead), animated tracking-in.
- Mana-pie pips animate in one at a time (reuse `.pip-in` + `MANA_HEX`, WUBRG). Pips are clickable → `/search?ci=<letter>`.
- Tagline (existing copy, upsized).
- **Ambient enchantment behind hero:** warm animated aura (slow-drifting radial gradient) + drifting mana "motes" (small blurred dots, `MANA_HEX` colors, CSS keyframe float, `pointer-events:none`, behind content). Grain already ships globally. All motion gated by `prefers-reduced-motion`.

### 3.2 Featured showcase
- A fanned "hand" of ~5–7 real cards, fetched client-side via existing helpers (`getRandom` in a small loop, or a `searchCards` call for a random/recent slice — planner picks the cheapest existing path; **no new API**).
- Cards fan with rotation offsets; parallax-tilt toward cursor (subtle `rotateY/rotateX`, capped). Each card links to `/card/[id]`.
- Loading/empty: if fetch fails, showcase is simply omitted (Welcome still renders). No error surfaced to user here.

### 3.3 Entry
- Primary CTA button `Enter the database →` → `/search`.
- Live count line "*N cards · M reskins*" — derived from an existing call (e.g. `searchCards` total; reskin total if cheaply available, else omit the reskin half). If the count call fails, the line is hidden. **No new endpoint.**
- Scroll reveals on showcase + entry (reuse `.card-rise` or a `data-`-driven reveal; no new JS framework).

### 3.4 Both themes
Light (cardstock) and dark (frame) both styled; aura tuned per theme like the existing body gradient.

---

## 4. About Page — `src/app/about/page.tsx`

Editorial, content-focused, generous whitespace, big Cinzel headings. Static (can be a server component — no client state needed).

Sections:
1. **Hero** — "What is UBDB?" big-type intro.
2. **The mission** — Universes Beyond reskin database; community-curated; never-for-profit.
3. **How it works** — search-syntax cheatsheet (`t:`, `id:`, `cmc<=`, `fr:` — mirror the placeholder examples already in the search box), what a reskin is, the suggest-a-design flow.
4. **Credits** — Scryfall attribution (card data), open-source note.

Linked from: Header nav (`components/Header.tsx` nav list) and Footer (`components/Footer.tsx`).

---

## 5. Binder View — `src/components/BinderView.tsx`

A 4th `ViewMode` rendering the current result set as flippable 3×3 binder sheets.

### 5.1 Wiring
- Add `"binder"` to the `ViewMode` union in `components/ResultViews.tsx`.
- Add a `binder` button to the view toggle row in `search/page.tsx` (the `["grid","list","text"]` array → add `"binder"`). Persisted like the others via the existing `localStorage("view")` logic (sacred — unchanged).
- `ResultViews`: when `view==="binder"`, render `<BinderView cards={cards} />` and return (mirrors the `view==="grid"` early return).

### 5.2 Sheet pagination (client-side, no API)
- Chunk `cards` into sheets of **9** (3×3). Local `useState` sheet index. Server-side Prev/Next pagination (in `search/page.tsx`) is unchanged and wraps the whole thing.
- DFC: front face only, one pocket per card (ignore `splitDfcTiles` in this view to keep the 3×3 grid intact). Pocket links to `/card/[id]`.

### 5.3 Flip mechanics
- Container has CSS `perspective`. Active sheet on top; advancing peels it (`rotateY`, snap easing `--ease-snap`) to reveal the next sheet beneath. Back sheets stack with a small offset for depth.
- Advance: `↞ ↠` buttons + keyboard ←/→ (a local `keydown` listener added/removed in `useEffect`, scoped to this component). "Sheet X / N" counter.
- `prefers-reduced-motion` → instant swap, no rotate (media rule already globally reduces durations; component also guards the transform).

### 5.4 Aesthetic
- Each pocket: card image behind a **plastic-sleeve gloss** (fixed diagonal highlight gradient + faint inner shadow). Pocket border tinted by color identity via `identityTint` (consistent with grid tiles). Hover: pocket lifts, gloss shifts.
- Binder chrome: warm `frame`/leather edge, **ring-holes down the left binding spine**, gold page-corner. Restrained skeuomorph.

---

## 6. Route-Change Loading

Two layers:
1. **`src/app/loading.tsx`** (+ per-heavy-segment `loading.tsx` if needed, e.g. `card/[id]`): Next route-segment Suspense fallback — a themed "Loading…" / shimmer so navigation isn't blank.
2. **Slim gold top-progress bar**: a small client component in the root layout that shows a thin animated bar during navigation, driven by `next/navigation` (`useLinkStatus` on links, or router event/pathname-change detection). Appears on link click, completes on route settle. Reduced-motion → static bar or omitted.

No third-party progress library — hand-rolled to stay dependency-free (current deps: next, react, jszip only).

---

## 7. Component Boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `app/page.tsx` (Welcome) | Cinematic landing + entry | `lib/api` (featured/count, read-only), `lib/colors` |
| `app/about/page.tsx` | Static editorial about | none (static) |
| `app/search/page.tsx` | The moved search app | unchanged from current page.tsx (targets repointed) |
| `components/BinderView.tsx` | 3×3 flippable sheets | `lib/colors` (`identityTint`), `lib/api` (`getImageSrc`) |
| `components/TopProgress.tsx` | Nav progress bar | `next/navigation` |
| `app/loading.tsx` | Segment fallback | none |

---

## 8. Verification (no test suite)

- `npx tsc --noEmit` clean + `next build` green (all routes).
- Dev-server drive:
  - `/` renders hero + motes + featured hand; pips → `/search?ci=`; CTA → `/search`; reduced-motion kills motion.
  - `/about` renders all sections; nav + footer links reach it.
  - `/search` works exactly as old `/` did; binder toggle appears; flip via buttons + keyboard; pocket → detail; sort/filter/pagination intact.
  - Every repointed link lands on `/search?...` with correct params (franchise chip, advanced builder, ColorPie, search form, ← Back).
  - Top-progress bar shows on link click; `loading.tsx` fallback shows on slow segment.
  - Both themes.
- Fresh `.next` (prod build + dev share the dir → wipe `.next` before dev to avoid stale-chunk errors).

---

## 9. Risk & Rollback

- Highest-risk item is the routing migration (many link edits). Mitigation: the grep table in §2 is the complete touch list; verify each post-edit.
- All other pieces are new files or one enum value — isolated.
- Repo is **not** git → no auto-rollback. Changes stay additive; keep old logic verbatim when moving to `/search`.

---

## 10. Out of Scope (YAGNI)

- Holo-foil tilt, coverflow, drag-to-flip — explicitly deferred (can layer later).
- No new API endpoints, no new dependencies, no data model changes.
- No changes to admin/decklist/suggest page internals beyond link repoints where listed.
