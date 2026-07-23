# UBDB Magical Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cinematic Welcome page, an editorial About page, a flippable binder view, and route-change loading to UBDB — additively, moving the search app from `/` to `/search`.

**Architecture:** Next 14 App Router, client components where state is needed, static where not. All new pieces are new files or a single enum addition; the only edits to existing files are mechanical link repoints (`/` → `/search`) and view-toggle wiring. No API/fetch/state logic changes.

**Tech Stack:** Next 14, React 18, Tailwind 3.4 (`darkMode:"class"`), Cinzel/Spectral/IBM Plex Mono via `next/font`. No new dependencies.

## Global Constraints

- **No new dependencies.** Current deps: `next`, `react`, `react-dom`, `jszip` only. Progress bar and animations are hand-rolled.
- **No API/data changes.** Read-only reuse of `searchCards`, `getCard`, `getReskins`, `getRandom`, `getImageSrc` from `src/lib/api.ts`. No new endpoints, no type changes.
- **Sacred = untouched:** all `lib/` logic, URL-param state flow, theme/settings logic, DFC face resolution. Edits limited to `className`, `href`/`router.push` targets, JSX additions, and new files.
- **Design tokens:** warm system — `cardstock`/`frame`/`surface`/`ink`/`gold`/`mana.*`; `rounded-card` (0.375rem); fonts `font-display`/`font-body`/`font-mono`; easing var `--ease-snap` (in `globals.css`). Never introduce raw black/white or Bootstrap-style values.
- **Motion:** everything animated must degrade under `@media (prefers-reduced-motion: reduce)` (a global duration-killer rule already exists in `globals.css`; new transforms must also have a no-motion fallback).
- **Verification (no test suite, no git):** each task gate = `npx tsc --noEmit` clean → `npx next build` green → dev-server drive of the described behavior. Wipe `.next` before `next dev` if a prod build ran (shared dir → stale-chunk crash). "Commit" = optional manual checkpoint; repo is not git.
- **Both themes:** every new surface styled for light (cardstock) and dark (frame).

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/app/search/page.tsx` | Create (moved from `page.tsx`) | The search app (was `/`) |
| `src/app/page.tsx` | Replace | Welcome landing |
| `src/app/about/page.tsx` | Create | Static about page |
| `src/components/BinderView.tsx` | Create | 3×3 flippable sheets |
| `src/components/TopProgress.tsx` | Create | Nav progress bar |
| `src/app/loading.tsx` | Create | Route-segment fallback |
| `src/components/ResultViews.tsx` | Modify | Add `"binder"` to `ViewMode`, route to BinderView |
| `src/components/Header.tsx` | Modify | Repoint search/pie pushes to `/search`; add About nav link |
| `src/components/Footer.tsx` | Modify | Add About link |
| `src/app/layout.tsx` | Modify | Mount `<TopProgress/>` |
| `src/app/globals.css` | Modify | Welcome/binder keyframes + gloss utilities |
| `src/app/advanced/page.tsx` | Modify | Repoint `/?q=` → `/search?q=` |
| `src/app/franchises/page.tsx` | Modify | Repoint `/?q=` → `/search?q=` |
| `src/app/card/[id]/page.tsx` | Modify | Repoint ← Back → `/search`; franchise chip → `/search?q=` |

---

## Task 1: Routing migration — `/` → `/search`

Move the search app to `/search`, repoint every internal link, and drop a minimal Welcome stub at `/` so the site stays whole. The full Welcome comes in Task 4.

**Files:**
- Create: `src/app/search/page.tsx` (content moved verbatim from current `src/app/page.tsx`, with `router.push` targets changed)
- Replace: `src/app/page.tsx` (temporary stub)
- Modify: `src/components/Header.tsx:19`, `:47` (SearchForm + ColorPie pushes)
- Modify: `src/app/advanced/page.tsx:168`
- Modify: `src/app/franchises/page.tsx:19`
- Modify: `src/app/card/[id]/page.tsx:107`, `:116`

**Interfaces:**
- Produces: route `/search` accepting the same query params (`q`, `ci`, `order`, `dir`, `page`) the old `/` accepted. `/` renders a placeholder linking to `/search`.

- [ ] **Step 1: Create `src/app/search/page.tsx`** — copy the entire current `src/app/page.tsx` content into it, then change the one internal push. Inside the `setParam` function, change:

```tsx
    router.push(`/?${next.toString()}`);
```
to:
```tsx
    router.push(`/search?${next.toString()}`);
```
Leave everything else (Masthead, Results, Suspense wrapper, ViewMode logic) identical. (Masthead stays for now; it is trimmed in Task 4.)

- [ ] **Step 2: Replace `src/app/page.tsx` with a stub Welcome:**

```tsx
import Link from "next/link";

export default function Welcome() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <h1 className="font-display text-6xl font-black tracking-[0.22em] text-gold dark:text-gold-dark">
        UBDB
      </h1>
      <p className="max-w-md font-body text-ink/60 dark:text-ink-dark/60">
        The Universes Beyond reskin database.
      </p>
      <Link
        href="/search"
        className="rounded-card border border-gold/50 px-5 py-2 font-display uppercase tracking-wide transition hover:border-gold hover:text-gold"
      >
        Enter the database →
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Repoint `src/components/Header.tsx`** — both pushes (SearchForm `submit`, line ~19; ColorPie `toggle`, line ~47) change from:

```tsx
    router.push(`/?${next.toString()}`);
```
to:
```tsx
    router.push(`/search?${next.toString()}`);
```
Leave the logo `href="/"` (line ~80) as-is — it correctly points to Welcome.

- [ ] **Step 4: Repoint `src/app/advanced/page.tsx:168`** from:

```tsx
    router.push(`/?q=${encodeURIComponent(p.join(" "))}`);
```
to:
```tsx
    router.push(`/search?q=${encodeURIComponent(p.join(" "))}`);
```

- [ ] **Step 5: Repoint `src/app/franchises/page.tsx:19`** from:

```tsx
            <Link href={`/?q=${encodeURIComponent(`fr:"${f.name}"`)}`}
```
to:
```tsx
            <Link href={`/search?q=${encodeURIComponent(`fr:"${f.name}"`)}`}
```

- [ ] **Step 6: Repoint `src/app/card/[id]/page.tsx`** — the ← Back link (line ~107) from `href="/"` to `href="/search"`:

```tsx
        <Link href="/search" className="font-display uppercase tracking-wide text-ink/60 hover:text-gold dark:text-ink-dark/50">← Back</Link>
```
and the franchise chip (line ~116) from `/?q=` to `/search?q=`:
```tsx
          <Link key={f} href={`/search?q=${encodeURIComponent(`fr:"${f}"`)}`}
```

- [ ] **Step 7: Verify** — build and drive:

```bash
rm -rf .next && npx tsc --noEmit && npx next build 2>&1 | tail -20
```
Expected: tsc silent (exit 0), build lists routes including `/` and `/search`. Then `npm run dev`, and confirm:
- `/` shows the stub + "Enter" → `/search`.
- `/search` behaves exactly like the old home (search, sort, color pie, pagination).
- Franchise chip on a card page, the Advanced "search" button, franchises list links, and the header search/pie all land on `/search?...` with correct params.

---

## Task 2: Route-change loading

A segment-level fallback plus a slim gold top-progress bar driven by navigation state.

**Files:**
- Create: `src/app/loading.tsx`
- Create: `src/components/TopProgress.tsx`
- Modify: `src/app/layout.tsx` (mount `<TopProgress/>`)
- Modify: `src/app/globals.css` (progress keyframe)

**Interfaces:**
- Produces: `<TopProgress/>` (default export, client component, no props) mounted once in the layout body.

- [ ] **Step 1: Create `src/app/loading.tsx`:**

```tsx
export default function Loading() {
  return (
    <main className="py-20 text-center font-mono text-sm text-ink/50 dark:text-ink-dark/40">
      Loading…
    </main>
  );
}
```

- [ ] **Step 2: Add the progress-bar keyframe to `src/app/globals.css`** (append near the other keyframes):

```css
/* Route-change progress bar: crawls to ~90% then the component fades it out. */
@keyframes progress-crawl {
  0%   { transform: scaleX(0); }
  60%  { transform: scaleX(0.7); }
  100% { transform: scaleX(0.9); }
}
.top-progress {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 2px;
  transform-origin: left;
  background: linear-gradient(90deg, theme("colors.gold.DEFAULT"), theme("colors.gold.dark"));
  z-index: 60;
  animation: progress-crawl 2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
```

- [ ] **Step 3: Create `src/components/TopProgress.tsx`** — shows the bar briefly whenever the pathname or search params change (i.e. a navigation settled). Because App Router gives no "navigation start" event without extra libs, we show a short crawl+fade on each route settle, which reads as a load indicator without a dependency:

```tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Slim gold bar that crawls + fades on every route settle. Dependency-free.
 *  Not shown for users who prefer reduced motion. */
export default function TopProgress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 600);
    return () => clearTimeout(t);
  }, [pathname, params]);

  if (!show) return null;
  return <div className="top-progress" aria-hidden />;
}
```

- [ ] **Step 4: Mount it in `src/app/layout.tsx`** — import and place inside `<body>` before `<Header/>`. It must be wrapped in `<Suspense>` because it reads `useSearchParams` (App Router requirement):

```tsx
import { Suspense } from "react";
import TopProgress from "@/components/TopProgress";
```
and in the body:
```tsx
      <body className="min-h-screen">
        <Suspense fallback={null}><TopProgress /></Suspense>
        <Header />
        <div className="mx-auto max-w-6xl px-4">{children}</div>
        <Footer />
      </body>
```

- [ ] **Step 5: Verify:**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```
Then `npm run dev`: navigate between `/`, `/search`, a card page — a thin gold bar flashes at the top on each navigation. Toggle OS reduced-motion on → bar does not appear. A slow segment shows the `Loading…` fallback.

---

## Task 3: Binder view (4th mode)

A `BinderView` component renders the current result set as flippable 3×3 sheets, wired as a 4th `ViewMode`.

**Files:**
- Create: `src/components/BinderView.tsx`
- Modify: `src/components/ResultViews.tsx` (add `"binder"` to `ViewMode`, early-return `<BinderView/>`)
- Modify: `src/app/search/page.tsx` (add `"binder"` to the view-toggle array)
- Modify: `src/app/globals.css` (sleeve gloss + spine utilities)

**Interfaces:**
- Consumes: `UbCard` (`@/types/types`), `getImageSrc` (`@/lib/api`), `identityTint` (`@/lib/colors`).
- Produces: `BinderView` (default export, props `{ cards: UbCard[] }`); `ViewMode` union gains `"binder"`.

- [ ] **Step 1: Add gloss + spine utilities to `src/app/globals.css`** (append):

```css
/* Binder: plastic-sleeve gloss overlay + ring-hole spine. */
.sleeve { position: relative; }
.sleeve::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 0.375rem;
  pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 22%, transparent 45%);
  transition: opacity 0.3s var(--ease-snap);
  opacity: 0.6;
}
.sleeve:hover::after { opacity: 0.9; }
@keyframes sheet-flip {
  from { transform: rotateY(0deg); opacity: 1; }
  to   { transform: rotateY(-105deg); opacity: 0; }
}
.sheet-flipping { animation: sheet-flip 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: left center; }
```

- [ ] **Step 2: Create `src/components/BinderView.tsx`:**

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UbCard } from "@/types/types";
import { getImageSrc } from "@/lib/api";
import { identityTint } from "@/lib/colors";

const PER_SHEET = 9; // 3×3

function Pocket({ card }: { card: UbCard }) {
  const img = card.prints[0]?.image_normal ?? card.art_uri;
  const tint = identityTint(card.color_identity);
  return (
    <Link
      href={`/card/${card.oracle_id}`}
      className="sleeve group block overflow-hidden rounded-card border-2 transition duration-200 hover:-translate-y-0.5"
      style={{ borderColor: `${tint}66` }}
    >
      {img ? (
        <img src={getImageSrc(img)} alt={card.name} loading="lazy" className="w-full" />
      ) : (
        <div className="flex aspect-[5/7] items-center justify-center bg-surface p-2 text-center font-body text-xs dark:bg-surface-dark">
          {card.name}
        </div>
      )}
    </Link>
  );
}

export default function BinderView({ cards }: { cards: UbCard[] }) {
  const [sheet, setSheet] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const sheetCount = Math.max(1, Math.ceil(cards.length / PER_SHEET));

  // Clamp when the result set shrinks (new search) so we never strand on an empty sheet.
  useEffect(() => { setSheet((s) => Math.min(s, sheetCount - 1)); }, [sheetCount]);

  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function go(next: number) {
    const target = Math.min(Math.max(next, 0), sheetCount - 1);
    if (target === sheet) return;
    if (reduced) { setSheet(target); return; }
    setFlipping(true);
    setTimeout(() => { setSheet(target); setFlipping(false); }, 450);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(sheet + 1);
      if (e.key === "ArrowLeft") go(sheet - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, sheetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = sheet * PER_SHEET;
  const pockets = cards.slice(start, start + PER_SHEET);

  return (
    <div className="mx-auto max-w-3xl" style={{ perspective: "1800px" }}>
      {/* Binder chrome: leather edge + ring-hole spine on the left. */}
      <div className="relative rounded-card border-2 border-gold/30 bg-surface/60 p-4 pl-8 shadow-lg dark:bg-surface-dark/60">
        <div className="pointer-events-none absolute inset-y-4 left-3 flex flex-col justify-around">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-3 w-3 rounded-full border border-gold/40 bg-frame/20 dark:bg-cardstock/10" />
          ))}
        </div>
        <div className={`grid grid-cols-3 gap-3 ${flipping ? "sheet-flipping" : ""}`}>
          {pockets.map((c) => <Pocket key={c.oracle_id} card={c} />)}
          {/* Pad the last sheet so the 3×3 grid keeps its shape. */}
          {Array.from({ length: PER_SHEET - pockets.length }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-[5/7] rounded-card border-2 border-dashed border-gold/15" />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        <button
          onClick={() => go(sheet - 1)}
          disabled={sheet <= 0}
          className="rounded-card border border-gold/40 px-3 py-1 transition hover:border-gold hover:text-gold disabled:opacity-30"
          aria-label="Previous page"
        >↞</button>
        <span className="font-mono text-xs">Sheet {sheet + 1} / {sheetCount}</span>
        <button
          onClick={() => go(sheet + 1)}
          disabled={sheet >= sheetCount - 1}
          className="rounded-card border border-gold/40 px-3 py-1 transition hover:border-gold hover:text-gold disabled:opacity-30"
          aria-label="Next page"
        >↠</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire `ViewMode` in `src/components/ResultViews.tsx`** — change the type and add the early return. The union (line ~10):

```tsx
export type ViewMode = "grid" | "list" | "text" | "binder";
```
Add the import at the top:
```tsx
import BinderView from "./BinderView";
```
Add the early return right after the existing `if (view === "grid") return <CardGrid cards={cards} />;`:
```tsx
  if (view === "binder") return <BinderView cards={cards} />;
```

- [ ] **Step 4: Add the toggle button in `src/app/search/page.tsx`** — the view array (currently `(["grid", "list", "text"] as ViewMode[])`) becomes:

```tsx
        {(["grid", "list", "text", "binder"] as ViewMode[]).map((v) => (
```
No other change — the existing `pill()` styling and `chooseView` persistence handle the new value.

- [ ] **Step 5: Verify:**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```
Then `npm run dev` on `/search`: run a search returning >9 cards, click the **binder** toggle. Confirm: 3×3 pockets with sleeve gloss + gold color-identity borders + ring-hole spine; `↞ ↠` and keyboard ←/→ flip sheets with a page-turn; "Sheet X / N" updates; a pocket click opens `/card/[id]`; last sheet pads with dashed empties; reduced-motion → instant sheet swap. Switch back to grid/list/text — all still work; the choice persists on reload.

---

## Task 4: Welcome page (full)

Replace the Task-1 stub with the cinematic landing: hero + drifting motes + featured hand + entry, and trim the now-redundant big Masthead on `/search`.

**Files:**
- Replace: `src/app/page.tsx` (full Welcome)
- Modify: `src/app/globals.css` (mote + aura keyframes)
- Modify: `src/app/search/page.tsx` (trim idle Masthead to a slim prompt)

**Interfaces:**
- Consumes: `searchCards`, `getImageSrc` (`@/lib/api`); `WUBRG`, `MANA_HEX` (`@/lib/colors`); `UbCard`, `SearchResult` (`@/types/types`).

- [ ] **Step 1: Add aura + mote keyframes to `src/app/globals.css`** (append):

```css
/* Welcome: slow warm aura pulse + drifting mana motes. */
@keyframes aura-drift {
  0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.5; }
  50%      { transform: translate(-50%, -3%) scale(1.08); opacity: 0.8; }
}
.welcome-aura {
  position: absolute;
  left: 50%; top: 0;
  width: 70rem; height: 40rem;
  max-width: 130vw;
  transform: translate(-50%, 0);
  pointer-events: none;
  z-index: -1;
  background: radial-gradient(ellipse at center, rgba(201,162,39,0.18), transparent 62%);
  animation: aura-drift 9s ease-in-out infinite;
}
.dark .welcome-aura { background: radial-gradient(ellipse at center, rgba(216,178,58,0.22), transparent 62%); }

@keyframes mote-float {
  from { transform: translateY(0) translateX(0); opacity: 0; }
  10%  { opacity: 0.7; }
  90%  { opacity: 0.7; }
  to   { transform: translateY(-120px) translateX(20px); opacity: 0; }
}
.mote {
  position: absolute;
  border-radius: 9999px;
  filter: blur(1px);
  pointer-events: none;
  animation: mote-float linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .welcome-aura, .mote { animation: none; }
  .mote { opacity: 0.4; }
}
```

- [ ] **Step 2: Replace `src/app/page.tsx` with the full Welcome:**

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { searchCards, getImageSrc } from "@/lib/api";
import { UbCard } from "@/types/types";
import { WUBRG, MANA_HEX } from "@/lib/colors";

// Deterministic scatter for motes so SSR/CSR agree (no Math.random in render).
const MOTES = Array.from({ length: 14 }).map((_, i) => ({
  color: MANA_HEX[WUBRG[i % WUBRG.length]],
  left: (i * 37) % 100,
  size: 4 + (i % 4) * 2,
  dur: 7 + (i % 5) * 1.5,
  delay: (i % 7) * 0.8,
}));

function Motes() {
  return (
    <>
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={{
            left: `${m.left}%`,
            bottom: "10%",
            width: m.size,
            height: m.size,
            backgroundColor: m.color,
            animationDuration: `${m.dur}s`,
            animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/** A fanned hand of featured cards that parallax-tilt toward the cursor. */
function FeaturedHand({ cards }: { cards: UbCard[] }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  if (cards.length === 0) return null;
  const mid = (cards.length - 1) / 2;
  return (
    <div
      className="relative mx-auto mt-16 flex h-72 items-end justify-center"
      style={{ perspective: "1200px" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((e.clientY - r.top) / r.height - 0.5) * -10,
          y: ((e.clientX - r.left) / r.width - 0.5) * 10,
        });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      {cards.map((c, i) => {
        const img = c.prints[0]?.image_normal ?? c.art_uri;
        if (!img) return null;
        const offset = i - mid;
        return (
          <Link
            key={c.oracle_id}
            href={`/card/${c.oracle_id}`}
            className="absolute w-40 overflow-hidden rounded-card border-2 border-gold/40 shadow-xl transition-transform duration-300 hover:-translate-y-3 hover:!rotate-0"
            style={{
              transform: `translateX(${offset * 90}px) rotate(${offset * 6}deg) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              zIndex: 10 - Math.abs(offset),
            }}
          >
            <img src={getImageSrc(img)} alt={c.name} className="w-full" loading="lazy" />
          </Link>
        );
      })}
    </div>
  );
}

export default function Welcome() {
  const [featured, setFeatured] = useState<UbCard[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    // Read-only reuse of the existing search endpoint. No new API.
    searchCards({ q: "", order: "released", dir: "desc", page: 1, page_size: 7 })
      .then((r) => { setFeatured(r.cards); setTotal(r.total); })
      .catch(() => {}); // showcase + count silently omitted on failure
  }, []);

  return (
    <main className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden py-16 text-center">
      <div className="welcome-aura" aria-hidden />
      <Motes />

      <div className="mb-4 flex gap-2">
        {WUBRG.map((c, i) => (
          <Link
            key={c}
            href={`/search?ci=${c.toLowerCase()}`}
            className="pip-in h-4 w-4 rounded-full ring-1 ring-gold/30 transition hover:scale-125"
            style={{ backgroundColor: MANA_HEX[c], animationDelay: `${i * 90}ms` }}
            aria-label={`Browse ${c} cards`}
          />
        ))}
      </div>

      <h1 className="font-display font-black tracking-[0.22em] text-gold dark:text-gold-dark"
          style={{ fontSize: "clamp(3.5rem, 12vw, 8rem)", lineHeight: 1 }}>
        UBDB
      </h1>
      <p className="mt-5 max-w-lg font-body text-lg text-ink/70 dark:text-ink-dark/60">
        The Universes Beyond reskin database. Every card, reimagined —
        search the multiverse or wander the binder.
      </p>

      <Link
        href="/search"
        className="mt-8 rounded-card border border-gold/50 px-6 py-2.5 font-display uppercase tracking-wider transition hover:-translate-y-0.5 hover:border-gold hover:text-gold"
      >
        Enter the database →
      </Link>

      {total !== null && (
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-ink/45 dark:text-ink-dark/35">
          {total.toLocaleString()} cards catalogued
        </p>
      )}

      <FeaturedHand cards={featured} />
    </main>
  );
}
```

- [ ] **Step 3: Trim the idle Masthead in `src/app/search/page.tsx`** — the big `Masthead` is now redundant (Welcome owns arrival). Replace the `Masthead` function body's return with a slim prompt, and keep the `{idle && <Masthead />}` call. New Masthead:

```tsx
function Masthead() {
  return (
    <p className="mb-6 mt-2 text-center font-body text-sm text-ink/55 dark:text-ink-dark/50">
      Search by name, type, or color identity — or tap a mana pip above to filter by color.
    </p>
  );
}
```
Remove the now-unused imports in `search/page.tsx` if `MANA_HEX`/`WUBRG` are no longer referenced there (they were only used by the old Masthead pips). Check with `grep -n "MANA_HEX\|WUBRG" src/app/search/page.tsx` and delete them from the import line if the count is zero after this edit.

- [ ] **Step 4: Verify:**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```
Then `npm run dev` on `/`: giant UBDB wordmark, warm aura pulsing, motes drifting up, pips animate in and link to `/search?ci=`, CTA → `/search`, count line shows total, featured hand fans and tilts toward the cursor, each card → its detail. Reduced-motion → aura/motes static. `/search` idle now shows the slim one-line prompt, not the big masthead. Both themes.

---

## Task 5: About page

Static editorial page linked from nav + footer.

**Files:**
- Create: `src/app/about/page.tsx`
- Modify: `src/components/Header.tsx` (add About nav link)
- Modify: `src/components/Footer.tsx` (add About link)

**Interfaces:**
- Produces: route `/about` (static). No runtime deps.

- [ ] **Step 1: Create `src/app/about/page.tsx`:**

```tsx
import Link from "next/link";

export const metadata = { title: "About — UBDB" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" data-reveal>
      <h2 className="font-display text-2xl uppercase tracking-wider text-gold dark:text-gold-dark">{title}</h2>
      <div className="mt-3 space-y-3 font-body text-ink/75 dark:text-ink-dark/65">{children}</div>
    </section>
  );
}

export default function About() {
  return (
    <main className="py-16">
      <h1 className="font-display font-black tracking-tight text-ink dark:text-ink-dark"
          style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", lineHeight: 1.05 }}>
        What is UBDB?
      </h1>
      <p className="mt-4 max-w-2xl font-body text-lg text-ink/70 dark:text-ink-dark/60">
        A community catalogue of Magic: The Gathering cards and the Universes Beyond
        reskins that reimagine them — mapping every card to the alternate-universe
        designs the community dreams up for it.
      </p>

      <Section title="The mission">
        <p>
          Universes Beyond turns Magic cards into crossovers. UBDB collects those
          reskins in one searchable place: pick any card, see every reimagining, and
          suggest your own. Community-curated, open-source, and never-for-profit.
        </p>
      </Section>

      <Section title="How it works">
        <p>Search accepts Scryfall-style filters. A few to try:</p>
        <ul className="space-y-1 font-mono text-sm">
          <li><span className="text-gold">t:creature</span> — filter by card type</li>
          <li><span className="text-gold">id:w</span> — filter by color identity</li>
          <li><span className="text-gold">cmc&lt;=3</span> — filter by mana value</li>
          <li><span className="text-gold">fr:fallout</span> — filter by Universes Beyond franchise</li>
        </ul>
        <p>
          Open any card and its <em>reskins</em> appear beneath it — alternate designs
          with art credits and tags. Hit <Link href="/search" className="text-gold hover:underline">the database</Link>{" "}
          and use “+ Suggest a design” on a card to add your own.
        </p>
      </Section>

      <Section title="Credits">
        <p>
          Card data comes from <span className="text-gold">Scryfall</span>. UBDB is an
          open-source, non-commercial fan project and is not affiliated with or endorsed
          by Wizards of the Coast.
        </p>
      </Section>

      <div className="mt-14">
        <Link href="/search" className="rounded-card border border-gold/50 px-5 py-2 font-display uppercase tracking-wide transition hover:border-gold hover:text-gold">
          Enter the database →
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add About to the Header nav** in `src/components/Header.tsx` — the nav block currently lists Franchises/Decklist/Random/Advanced. Add an About link (place it last):

```tsx
          <Link href="/about" className="hover:text-gold">About</Link>
```

- [ ] **Step 3: Add About to the Footer** in `src/components/Footer.tsx` — turn the footer into a line with a link. Replace the inner text with:

```tsx
      UBDB — open-source, never-for-profit. Card data via Scryfall.{" "}
      <Link href="/about" className="text-gold hover:underline">About</Link>.
```
and add the import at the top of the file:
```tsx
import Link from "next/link";
```

- [ ] **Step 4: Verify:**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```
Then `npm run dev`: `/about` shows the hero + three sections + CTA; the Header "About" link and the Footer "About" link both reach it; `data-reveal` sections are visible (they render statically even without a reveal script — the attribute is inert). Both themes.

---

## Final Verification

```bash
rm -rf .next && npx tsc --noEmit && npx next build 2>&1 | tail -25
```
Expected: exit 0, all routes listed — `/`, `/about`, `/search`, `/card/[id]`, `/card/[id]/suggest`, `/advanced`, `/decklist`, `/franchises`, `/admin`, `/random`, `/api/image-proxy`.

Full dev drive: `/` (welcome) → CTA → `/search` → binder flip → click card → `/card/[id]` → ← Back → `/search`; header About → `/about`; every repointed link (§2 table) lands correctly; top-progress bar on each nav; reduced-motion respected; both themes.

---

## Self-Review Notes

- **Spec coverage:** §2 migration → Task 1; §3 Welcome → Task 4; §4 About → Task 5; §5 Binder → Task 3; §6 Loading → Task 2. All covered.
- **No test framework:** intentional — codebase has none and spec §10 bars new deps; gates are tsc + build + drive.
- **Type consistency:** `ViewMode` extended once (Task 3) and consumed in `search/page.tsx` + `ResultViews`; `BinderView` props `{cards: UbCard[]}` match the `ResultViews` call site; `searchCards`/`SearchResult.total`/`.cards` used per existing `lib/api` signatures.
- **`Math.random` avoided** in Welcome motes (deterministic scatter) to keep SSR/CSR markup identical and dodge hydration mismatch.
