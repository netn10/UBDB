# Autocomplete Across UBDB Inputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card-name typeahead and reskin field-value suggestions to the UBDB inputs where they help, via two backend endpoints and one reusable frontend component.

**Architecture:** Flask serves two in-scope completion endpoints — card names (in-memory over `_CARDS`, prefix-then-substring ranking) and reskin field values (Mongo `distinct` over approved reskins). A single source-agnostic React `<Autocomplete>` component wraps a native input with a debounced dropdown; two `api.ts` helpers supply the two sources. Header, the advanced name field, and three reskin-form fields consume it.

**Tech Stack:** Flask (Python 3.12), pytest + mongomock (backend tests). Next.js 14 / React 18 / TypeScript / Tailwind (frontend). SWR already present. No JS test runner exists.

## Global Constraints

- Backend routes live in `backend/app.py`; match existing `@app.get(...)` / `jsonify(...)` style.
- Reskin field values come **only from approved reskins** (`{"approved": True}`) — never leak unmoderated content.
- Card-name completion is **in-memory over `_CARDS`** — no Mongo, no disk read.
- Card-name ranking is **prefix first, then substring**, case-insensitive, deduped by name.
- Frontend has **no test runner** — verify frontend tasks with `npx tsc --noEmit` and `npm run build`; drive manually at the end. Do not add a test framework.
- **Do not commit** — the repo owner commits manually. Steps below stop at a clean working tree + passing checks; no `git commit`.
- Existing Tailwind tokens: `gold`, `surface`, `ink`/`ink-dark`, `rounded-card`. Reuse them; add no new colors.
- Parallel sessions are editing `src/types/types.ts` — this plan does not touch it; if a merge lands there, re-run typecheck.

---

### Task 1: Backend endpoint `/api/complete/cards`

**Files:**
- Modify: `backend/app.py` (add route near the other `@app.get` handlers, e.g. after `list_franchises`)
- Test: `backend/tests/test_complete_api.py` (create)

**Interfaces:**
- Produces: `GET /api/complete/cards?q=<str>&limit=<int>` → `{"names": [str, …]}`. Prefix matches (alpha) before substring matches (alpha); case-insensitive; deduped by name; empty/blank `q` → `{"names": []}`; `limit` default 10, clamped to `[1, 20]`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_complete_api.py`:

```python
import json
import pytest


@pytest.fixture
def cc(monkeypatch, tmp_path):
    """Client over a multi-card snapshot so ranking is observable."""
    sample = [
        {"oracle_id": "o1", "name": "Bolas's Citadel", "prints": []},
        {"oracle_id": "o2", "name": "Nicol Bolas, the Ravager", "prints": []},
        {"oracle_id": "o3", "name": "Boros Charm", "prints": []},
        {"oracle_id": "o4", "name": "Llanowar Elves", "prints": []},
        # duplicate name (different printing) must dedupe to one suggestion
        {"oracle_id": "o5", "name": "Boros Charm", "prints": []},
    ]
    f = tmp_path / "cards.json"
    f.write_text(json.dumps(sample), encoding="utf-8")
    monkeypatch.setenv("UB_CARDS_JSON", str(f))
    monkeypatch.setenv("UBDB_MONGO_MOCK", "1")
    monkeypatch.setenv("UBDB_MONGO_DB", "ubdb_test")
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    import importlib
    import db
    importlib.reload(db)
    db.reset_client()
    import app as app_module
    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_complete_cards_prefix_before_substring(cc):
    body = cc.get("/api/complete/cards?q=bol").get_json()
    # "Bolas's Citadel" starts with "bol" → ranks before "Nicol Bolas…"
    assert body["names"][0] == "Bolas's Citadel"
    assert "Nicol Bolas, the Ravager" in body["names"]
    assert body["names"].index("Bolas's Citadel") < body["names"].index("Nicol Bolas, the Ravager")


def test_complete_cards_case_insensitive_and_dedup(cc):
    names = cc.get("/api/complete/cards?q=BOROS").get_json()["names"]
    assert names.count("Boros Charm") == 1


def test_complete_cards_empty_query_is_empty(cc):
    assert cc.get("/api/complete/cards?q=").get_json()["names"] == []
    assert cc.get("/api/complete/cards").get_json()["names"] == []


def test_complete_cards_limit_clamped(cc):
    # limit below 1 clamps to 1; "bo" matches Bolas's Citadel, Boros Charm, Nicol Bolas
    names = cc.get("/api/complete/cards?q=bo&limit=0").get_json()["names"]
    assert len(names) == 1
    names = cc.get("/api/complete/cards?q=bo&limit=999").get_json()["names"]
    assert len(names) <= 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_complete_api.py -v`
Expected: FAIL — 404 responses (route not defined) so assertions error.

- [ ] **Step 3: Write minimal implementation**

In `backend/app.py`, add a constant near the other module constants and the route near `list_franchises`:

```python
_MAX_COMPLETE = 20


@app.get("/api/complete/cards")
def complete_cards():
    q = (request.args.get("q") or "").strip().lower()
    try:
        limit = int(request.args.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, _MAX_COMPLETE))
    if not q:
        return jsonify({"names": []})
    prefix, substr, seen = [], [], set()
    for c in _CARDS:
        name = c.get("name") or ""
        if not name or name in seen:
            continue
        low = name.lower()
        if low.startswith(q):
            prefix.append(name)
            seen.add(name)
        elif q in low:
            substr.append(name)
            seen.add(name)
    prefix.sort(key=str.lower)
    substr.sort(key=str.lower)
    return jsonify({"names": (prefix + substr)[:limit]})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_complete_api.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Leave working tree clean; no commit** (repo owner commits). Verify no stray files: `git status`.

---

### Task 2: Backend endpoint `/api/complete/reskin-values`

**Files:**
- Modify: `backend/app.py` (add route after `complete_cards`)
- Test: `backend/tests/test_complete_api.py` (append)

**Interfaces:**
- Produces: `GET /api/complete/reskin-values?field=<designer|art_credit|tags>` → `{"values": [str, …]}` sorted, de-duplicated, from approved reskins only; unknown `field` → 400 `{"error": "unknown field"}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_complete_api.py`:

```python
def _seed_reskins(cc):
    import db
    db.get_db().reskins.insert_many([
        {"_id": "r1", "oracle_id": "o1", "designer_name": "Ada",
         "art_credit": "Artist X", "tags": ["fallout", "ghoul"], "approved": True},
        {"_id": "r2", "oracle_id": "o2", "designer_name": "Ben",
         "art_credit": "Artist Y", "tags": ["ghoul", "flavor"], "approved": True},
        # unapproved — must NOT appear in any suggestion
        {"_id": "r3", "oracle_id": "o3", "designer_name": "Hidden",
         "art_credit": "Secret", "tags": ["secret"], "approved": False},
    ])


def test_reskin_values_designer_approved_only_sorted(cc):
    _seed_reskins(cc)
    values = cc.get("/api/complete/reskin-values?field=designer").get_json()["values"]
    assert values == ["Ada", "Ben"]
    assert "Hidden" not in values


def test_reskin_values_tags_flattened_distinct(cc):
    _seed_reskins(cc)
    values = cc.get("/api/complete/reskin-values?field=tags").get_json()["values"]
    assert values == ["fallout", "flavor", "ghoul"]
    assert "secret" not in values


def test_reskin_values_bad_field_400(cc):
    resp = cc.get("/api/complete/reskin-values?field=nope")
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "unknown field"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_complete_api.py -k reskin_values -v`
Expected: FAIL — route not defined (404), assertions error.

- [ ] **Step 3: Write minimal implementation**

In `backend/app.py`, after `complete_cards`:

```python
_COMPLETE_FIELDS = {
    "designer": "designer_name",
    "art_credit": "art_credit",
    "tags": "tags",
}


@app.get("/api/complete/reskin-values")
@mongo_guarded
def complete_reskin_values():
    key = _COMPLETE_FIELDS.get(request.args.get("field", ""))
    if key is None:
        return jsonify({"error": "unknown field"}), 400
    raw = _reskins().distinct(key, {"approved": True})
    values = sorted({v.strip() for v in raw if isinstance(v, str) and v.strip()})
    return jsonify({"values": values})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_complete_api.py -v`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Leave working tree clean; no commit.** `git status` to confirm only the two intended files changed.

---

### Task 3: Frontend API helpers

**Files:**
- Modify: `src/lib/api.ts` (append two helpers; reuse existing private `get<T>`)

**Interfaces:**
- Consumes: existing `get<T>(path)` and `API_BASE_URL` in `src/lib/api.ts`.
- Produces:
  - `completeCardNames(q: string): Promise<string[]>` — blank `q` → `[]`; errors swallowed → `[]`.
  - `completeReskinValues(field: "designer" | "art_credit" | "tags"): Promise<string[]>` — errors swallowed → `[]`.

- [ ] **Step 1: Add the helpers**

Append to `src/lib/api.ts`:

```ts
/** Card-name typeahead source. Blank query and fetch errors resolve to []. */
export async function completeCardNames(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  try {
    const r = await get<{ names: string[] }>(
      `/complete/cards?q=${encodeURIComponent(q)}`,
    );
    return r.names;
  } catch {
    return [];
  }
}

/** Distinct reskin field values (approved only). Errors resolve to []. */
export async function completeReskinValues(
  field: "designer" | "art_credit" | "tags",
): Promise<string[]> {
  try {
    const r = await get<{ values: string[] }>(
      `/complete/reskin-values?field=${field}`,
    );
    return r.values;
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Leave working tree clean; no commit.**

---

### Task 4: `Autocomplete` component

**Files:**
- Create: `src/components/Autocomplete.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure UI). Callers supply `fetchSuggestions`.
- Produces: default export `Autocomplete` with props:
  - `value: string`, `onChange: (v: string) => void`
  - `fetchSuggestions: (query: string) => Promise<string[]>` — **must be stable** (callers wrap in `useCallback`), since it is an effect dependency.
  - `onSelect?: (value: string) => void`
  - `tokenized?: boolean` — comma-separated fields; only the last token is queried/replaced.
  - plus native `<input>` props (spread) except `value`/`onChange`.

- [ ] **Step 1: Create the component**

Create `src/components/Autocomplete.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

interface AutocompleteProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange"
  > {
  value: string;
  onChange: (v: string) => void;
  fetchSuggestions: (query: string) => Promise<string[]>;
  onSelect?: (value: string) => void;
  tokenized?: boolean;
}

// Comma-separated fields complete only the final token.
function lastToken(v: string): string {
  const i = v.lastIndexOf(",");
  return i === -1 ? v : v.slice(i + 1);
}
function replaceLastToken(v: string, chosen: string): string {
  const i = v.lastIndexOf(",");
  const head = i === -1 ? "" : v.slice(0, i + 1);
  const sep = head && !head.endsWith(" ") ? " " : "";
  return `${head}${sep}${chosen}`;
}

export default function Autocomplete({
  value,
  onChange,
  fetchSuggestions,
  onSelect,
  tokenized,
  ...inputProps
}: AutocompleteProps) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  const query = (tokenized ? lastToken(value) : value).trim();

  useEffect(() => {
    if (!query) {
      setItems([]);
      setOpen(false);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      if (id !== seq.current) return; // ignore stale (out-of-order) responses
      setItems(results);
      setActive(-1);
      setOpen(results.length > 0);
    }, 150);
    return () => clearTimeout(t);
  }, [query, fetchSuggestions]);

  function choose(s: string) {
    const next = tokenized ? replaceLastToken(value, s) : s;
    onChange(next);
    onSelect?.(next);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // let mousedown land
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-card border border-gold/30 bg-surface shadow-lg">
          {items.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus; fire before blur closes list
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                i === active ? "bg-gold/20 text-ink" : "text-ink/80"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Leave working tree clean; no commit.**

---

### Task 5: Wire the Header global search

**Files:**
- Modify: `src/components/Header.tsx` (the `SearchBar`/form around lines 25–46)

**Interfaces:**
- Consumes: `Autocomplete` (Task 4), `completeCardNames` (Task 3).
- Behavior: card-name typeahead only in plain-name mode — suppress when the query contains a DSL operator (`:`, `<`, `>`, `=`). Selecting a suggestion sets `q` and navigates to `/search`.

- [ ] **Step 1: Add imports**

At the top of `src/components/Header.tsx`, add:

```tsx
import { useCallback } from "react";
import Autocomplete from "@/components/Autocomplete";
import { completeCardNames } from "@/lib/api";
```

(Merge `useCallback` into the existing `react` import if one is present.)

- [ ] **Step 2: Replace the `<input>` with `<Autocomplete>`**

Inside the search form component, add a stable fetcher above the `return`:

```tsx
  const fetchNames = useCallback(async (query: string): Promise<string[]> => {
    if (/[:<>=]/.test(query)) return []; // DSL mode — skip name typeahead
    return completeCardNames(query);
  }, []);

  function go(name: string) {
    const next = new URLSearchParams(params.toString());
    next.set("q", name);
    next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  }
```

Replace the existing `<input value={q} … />` element with:

```tsx
      <Autocomplete
        value={q}
        onChange={setQ}
        fetchSuggestions={fetchNames}
        onSelect={go}
        placeholder="Search cards — try t:creature id:w cmc<=3 fr:fallout"
        className="w-full rounded-card border border-ink/15 dark:border-ink-dark/15 bg-cardstock/60 dark:bg-frame/60 px-3 py-2 text-sm font-body placeholder:text-ink/40 dark:placeholder:text-ink-dark/40 focus:border-gold focus:bg-transparent"
      />
```

(The `<form onSubmit={submit}>` wrapper stays — Enter with no highlighted suggestion still submits the raw query.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Leave working tree clean; no commit.**

---

### Task 6: Wire the advanced "Card name contains…" field

**Files:**
- Modify: `src/app/advanced/page.tsx` (name input around line 184; imports at top)

**Interfaces:**
- Consumes: `Autocomplete` (Task 4), `completeCardNames` (Task 3). Always active (pure name field).

- [ ] **Step 1: Add imports**

At the top of `src/app/advanced/page.tsx`:

```tsx
import { useState, useCallback } from "react";
import Autocomplete from "@/components/Autocomplete";
import { completeCardNames } from "@/lib/api";
```

(Merge `useCallback` into the existing `useState` import line.)

- [ ] **Step 2: Add a stable fetcher and swap the input**

Inside the page component, above the `return`, add:

```tsx
  const fetchNames = useCallback(
    (query: string): Promise<string[]> => completeCardNames(query),
    [],
  );
```

Replace the name `<input value={name} … placeholder="Card name contains…" … />` with:

```tsx
          <Autocomplete
            value={name}
            onChange={setName}
            fetchSuggestions={fetchNames}
            placeholder="Card name contains…"
            className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold w-full"
          />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Leave working tree clean; no commit.**

---

### Task 7: Wire the reskin form fields (designer, art credit, tags)

**Files:**
- Modify: `src/app/card/[id]/suggest/page.tsx` (designer input ~line 85, art-credit ~line 111, tags ~line 117; imports at top)

**Interfaces:**
- Consumes: `Autocomplete` (Task 4), `completeReskinValues` (Task 3).
- Behavior: designer/art-credit are plain fields; tags is `tokenized`. The endpoint returns all approved values, so each fetcher filters by the typed query client-side and caps at 10.

- [ ] **Step 1: Add imports**

At the top of `src/app/card/[id]/suggest/page.tsx`:

```tsx
import { useCallback } from "react";
import Autocomplete from "@/components/Autocomplete";
import { completeReskinValues } from "@/lib/api";
```

(Merge `useCallback` into the existing React import.)

- [ ] **Step 2: Add stable, query-filtering fetchers**

Inside the component, above the `return`:

```tsx
  const filterBy = (all: string[], query: string) => {
    const low = query.toLowerCase();
    return all.filter((v) => v.toLowerCase().includes(low)).slice(0, 10);
  };
  const fetchDesigner = useCallback(
    async (q: string) => filterBy(await completeReskinValues("designer"), q),
    [],
  );
  const fetchArtCredit = useCallback(
    async (q: string) => filterBy(await completeReskinValues("art_credit"), q),
    [],
  );
  const fetchTags = useCallback(
    async (q: string) => filterBy(await completeReskinValues("tags"), q),
    [],
  );
```

- [ ] **Step 3: Swap the three inputs**

Designer — replace `<input required className={field} value={designer} onChange={(e) => setDesigner(e.target.value)} />` with:

```tsx
        <Autocomplete
          required
          className={field}
          value={designer}
          onChange={setDesigner}
          fetchSuggestions={fetchDesigner}
        />
```

Art credit — replace its `<input …>` with:

```tsx
        <Autocomplete
          required
          className={field}
          value={artCredit}
          onChange={setArtCredit}
          fetchSuggestions={fetchArtCredit}
          placeholder="Artist / source (required by community rules)"
        />
```

Tags — replace its `<input …>` with (note `tokenized`):

```tsx
        <Autocomplete
          tokenized
          className={field}
          value={tags}
          onChange={setTags}
          fetchSuggestions={fetchTags}
          placeholder="e.g. Fallout, ghoul, flavor text"
        />
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: typecheck clean; build succeeds.

- [ ] **Step 5: Manual drive (invoke the `verify` / `run` skill)**

Start backend (`cd backend && flask --app app run` or the project's usual command) and `npm run dev`, then confirm:
- Header: type `bol` → dropdown of card names; type `t:creature` → no dropdown (DSL mode); pick a name → navigates to `/search?q=…`.
- Advanced: type in "Card name contains…" → suggestions; ↑/↓/Enter/Esc work.
- Reskin form (`/card/<id>/suggest`): designer + art credit suggest prior approved values; tags suggests and replaces only the last comma token.

- [ ] **Step 6: Leave working tree clean; no commit.** `git status` to confirm only intended files changed.

---

## Self-Review

**Spec coverage:**
- Card-name typeahead (Header plain-name gate, advanced field) → Tasks 1, 3, 4, 5, 6. ✓
- Field-value suggestions (designer, art_credit, tags tokenized) → Tasks 2, 3, 4, 7. ✓
- Backend endpoints (in-memory cards; approved-only reskin distinct; bad field 400) → Tasks 1, 2. ✓
- Reusable component (debounce, stale-guard, keyboard nav, tokenized) → Task 4. ✓
- api.ts helpers with error-swallowing → Task 3. ✓
- Excluded inputs untouched (password/URL/numeric/checkbox/select/textareas) → not wired anywhere. ✓
- Testing: backend pytest (Tasks 1–2); frontend typecheck+build+manual (Tasks 3–7). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `completeCardNames`, `completeReskinValues`, `Autocomplete` (props `value/onChange/fetchSuggestions/onSelect/tokenized`) used identically across Tasks 3–7. `fetchSuggestions` stability requirement (useCallback) honored at every call site. ✓
