# Autocomplete across UBDB inputs — Design

**Date:** 2026-07-18
**Status:** Approved (design), pending spec review

## Goal

Add auto-completion to the inputs where it materially helps users, using two
completion sources served by one reusable frontend component. Not every input:
password, URL, numeric, checkbox, `<select>`, and long-form textarea inputs are
deliberately excluded because typeahead adds nothing there.

## Scope — which inputs get it

Card-name typeahead (source: card DB):

| Input | File | Notes |
|---|---|---|
| Global search | `src/components/Header.tsx` | **Plain-name mode only** — suppress when the query contains a DSL operator (`:`, `<`, `>`, `=`). Selecting a suggestion sets `q` and navigates to `/search`. |
| "Card name contains…" | `src/app/advanced/page.tsx` (line ~184) | Pure name field — always active. |

Field-value suggestions (source: existing approved reskins):

| Input | File | Field key | Notes |
|---|---|---|---|
| Designer name | `src/app/card/[id]/suggest/page.tsx` | `designer_name` | |
| Art credit | `src/app/card/[id]/suggest/page.tsx` | `art_credit` | |
| Tags (comma-separated) | `src/app/card/[id]/suggest/page.tsx` | `tags` | Tokenized — completes only the **last** comma-separated token; earlier tokens preserved. |

### Explicitly excluded

Admin username/password (security + no useful source), image-URL inputs
(`type="url"`), numeric mana-value input, checkboxes, all `<select>` elements
(fixed option lists), decklist paste textarea, suggest-page description textarea.
The search-page (`src/app/search/page.tsx`) has no text input of its own — its
query comes from the Header — so nothing to wire there.

## Backend — two new endpoints

Both live in `backend/app.py`, matching existing route/style conventions.

### `GET /api/complete/cards?q=<str>&limit=<int>`

- Returns `{"names": [str, …]}`.
- Operates in-memory over the already-loaded `_CARDS` list — no Mongo, no disk.
- **Ranking: prefix + substring.** Names whose lowercased value *starts with*
  `q` rank first (alphabetical within the group); names that merely *contain* `q`
  as a substring follow. Case-insensitive. Empty/whitespace `q` → `{"names": []}`.
- `limit` defaults to 10, clamped to a sane max (e.g. 20).
- Dedupe by name (multiple printings share a name).

### `GET /api/complete/reskin-values?field=<designer|art_credit|tags>`

- Returns `{"values": [str, …]}`, sorted, de-duplicated.
- `@mongo_guarded` (returns empty list gracefully if Mongo is down).
- `field` maps to the reskin document keys: `designer` → `designer_name`,
  `art_credit` → `art_credit`, `tags` → `tags` (array field; flatten distinct
  elements). Any other `field` value → 400.
- Uses Mongo `distinct` over **approved** reskins (`{"approved": True}`) so
  unmoderated / rejected values never leak as suggestions.

## Frontend — one reusable component

`src/components/Autocomplete.tsx` — source-agnostic, wraps a native `<input>`.

Props:

- `value: string`, `onChange: (v: string) => void` — controlled input.
- `fetchSuggestions: (query: string) => Promise<string[]>` — the only source
  coupling; the component knows nothing about cards vs reskins.
- `onSelect?: (value: string) => void` — fired when a suggestion is chosen
  (Header uses this to navigate; forms omit it and just accept the filled value).
- `tokenized?: boolean` — when true, the query passed to `fetchSuggestions` and
  the value replaced on select is the **last comma-separated token** only.
- Passthrough input props: `className`, `placeholder`, `required`, `type`,
  `inputMode`, etc. — spread onto the underlying `<input>`.

Behavior:

- Debounced fetch (~150ms) on input change; ignore stale responses (track the
  latest query so a slow earlier request can't overwrite newer results).
- Dropdown of suggestions below the input; hidden when empty or on blur.
- Keyboard: ↑/↓ move the highlight, Enter selects the highlighted item, Escape
  closes. Mouse click also selects.
- Selecting fills `value` (via `onChange`) and calls `onSelect` if provided.
- No suggestions → no dropdown; typing still works as a plain input.

Two thin helpers in `src/lib/api.ts`:

- `completeCardNames(q: string): Promise<string[]>` → hits `/api/complete/cards`.
- `completeReskinValues(field): Promise<string[]>` → hits
  `/api/complete/reskin-values`.

Header wiring: pass a `fetchSuggestions` that returns `[]` when the current query
contains a DSL operator (plain-name gate lives in the Header, not the component),
and an `onSelect` that sets `q` and pushes to `/search?q=…`.

## Data flow

```
user types → Autocomplete (debounce) → fetchSuggestions(q)
   → api.ts helper → GET /api/complete/* → Flask handler
   → (_CARDS in-memory | Mongo distinct) → JSON → dropdown
user picks → onChange(value) [+ onSelect(value)]
```

## Error handling

- Fetch failures resolve to `[]` (helpers swallow errors) → dropdown just stays
  empty; the input never breaks.
- Backend: bad `field` → 400; Mongo down → `@mongo_guarded` empty result.
- Stale-response guard prevents out-of-order results from flickering.

## Testing

Backend (`backend/tests/`, pytest, mongomock hook already exists):

- `/api/complete/cards`: prefix ranked above substring; case-insensitive; empty
  `q` → empty; `limit` respected/clamped; dedupe.
- `/api/complete/reskin-values`: only approved reskins; distinct/sorted; tags
  flattened; bad `field` → 400; Mongo-down path.

Frontend (no JS test runner exists in this repo — verify by typecheck + build +
manual drive, not unit tests):

- `npx tsc --noEmit` clean and `npm run build` succeeds after wiring.
- Manual `/run`: card-name typeahead in Header (plain-name) + advanced name field;
  designer/art-credit/tags value suggestions on the reskin form; tokenized tags
  replace only the last token; keyboard nav (↑↓ enter esc) works.

## Non-goals (YAGNI)

- Fuzzy / typo-tolerant matching (chose prefix+substring).
- DSL keyword/operator completion (`t:`, `id:`, `fr:` value lists).
- Server-side caching of completion results (datasets are small / in-memory).
- Persisting recent searches.
