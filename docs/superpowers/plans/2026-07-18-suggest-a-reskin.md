# Suggest a Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an anonymous visitor describe a franchise character (picture URL + text) and get the best-fit UB cards to reskin, then hand off to the existing reskin form.

**Architecture:** A deterministic keyword-heuristic scorer runs over the in-memory JSON card snapshot behind a new public `POST /api/suggest` route. The scoring logic (`suggest.py`) is a pure function fed a hand-built lexicon (`suggest_lexicon.py`); the Flask route is a thin adapter. The frontend adds a `/suggest` page that renders ranked candidates with a "why it fits" and editable inferred-facet chips, then links each result to the existing `/card/<id>/suggest` form with `image_url` + `name` prefilled.

**Tech Stack:** Flask (backend, pytest + mongomock harness), Next.js 14 App Router + TypeScript + Tailwind (frontend).

## Global Constraints

- No AI/LLM. Matching is a deterministic heuristic. (spec: Non-goals)
- No login/registration. `POST /api/suggest` is public, like other card-read routes. (spec: Non-goals)
- No Google Drive / no upload storage. Picture is a pasted URL only. (spec: Non-goals)
- Scorer must tolerate missing card fields (`colors`, `keywords`, `power`, `toughness`, `reskin_count` may be absent). (test fixture has minimal cards)
- `suggest_lexicon.py` is the single source of truth for word→signal maps and weights; scoring logic imports it, never hardcodes words. (spec: Isolation)
- Weights (verbatim): franchise 6, keyword 4, color 3, role 3, type 2. (spec: Signals)
- UBDB is **not** a git repo and the standing rule is **no auto-commit**. Each task ends with a green-test checkpoint, NOT a `git commit`. The owner versions/deploys manually.

---

### Task 1: Lexicon (word → signal maps + weights)

**Files:**
- Create: `backend/suggest_lexicon.py`
- Test: `backend/tests/test_suggest.py`

**Interfaces:**
- Produces:
  - `WEIGHTS: dict[str, int]` — keys `color`, `role`, `keyword`, `type`, `franchise`.
  - `COLOR_WORDS: dict[str, str]` — token → one of `W U B R G`.
  - `ROLE_WORDS: dict[str, dict]` — token → condition dict with optional keys `keyword` (str), `min_toughness` (int), `max_cmc` (int), `type` (str, substring of type_line), `text` (str, substring of oracle_text).
  - `KEYWORD_WORDS: set[str]` — literal MTG keywords, lowercase.
  - `TYPE_WORDS: set[str]` — creature-type words, lowercase.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_suggest.py
import suggest_lexicon as lex


def test_weights_match_spec():
    assert lex.WEIGHTS == {"color": 3, "role": 3, "keyword": 4, "type": 2, "franchise": 6}


def test_color_words_map_to_wubrg():
    assert lex.COLOR_WORDS["protector"] == "W"
    assert lex.COLOR_WORDS["ruthless"] == "B"
    assert set(lex.COLOR_WORDS.values()) <= set("WUBRG")


def test_role_word_has_condition_dict():
    assert lex.ROLE_WORDS["guardian"]["keyword"] == "Defender"
    assert lex.ROLE_WORDS["assassin"]["keyword"] == "Deathtouch"
    assert lex.ROLE_WORDS["leader"]["type"] == "Legendary"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'suggest_lexicon'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/suggest_lexicon.py
"""Single source of truth for the Suggest-a-Reskin heuristic: which words map to
which card signal, and how heavily each signal counts. No scoring logic here."""

WEIGHTS = {"color": 3, "role": 3, "keyword": 4, "type": 2, "franchise": 6}

# concept word -> WUBRG color
COLOR_WORDS = {
    "protector": "W", "healer": "W", "noble": "W", "holy": "W", "loyal": "W",
    "order": "W", "knight": "W",
    "cunning": "U", "clever": "U", "control": "U", "trickster": "U",
    "scholar": "U", "spy": "U", "illusion": "U",
    "ruthless": "B", "death": "B", "undead": "B", "assassin": "B",
    "sacrifice": "B", "corrupt": "B", "vampire": "B",
    "rage": "R", "fire": "R", "reckless": "R", "warrior": "R",
    "chaos": "R", "burn": "R", "goblin": "R",
    "beast": "G", "nature": "G", "wild": "G", "growth": "G",
    "hunter": "G", "elf": "G", "primal": "G",
}

# concept word -> condition dict tested against a card
ROLE_WORDS = {
    "tank": {"keyword": "Defender", "min_toughness": 4},
    "guardian": {"keyword": "Defender", "min_toughness": 4},
    "defender": {"keyword": "Defender"},
    "assassin": {"keyword": "Deathtouch", "max_cmc": 3},
    "killer": {"keyword": "Deathtouch"},
    "leader": {"type": "Legendary"},
    "commander": {"type": "Legendary"},
    "swarm": {"text": "token"},
    "army": {"text": "token"},
    "flyer": {"keyword": "Flying"},
}

# literal MTG keywords, matched against card["keywords"]
KEYWORD_WORDS = {
    "flying", "trample", "lifelink", "haste", "deathtouch", "vigilance",
    "menace", "reach", "defender", "hexproof", "ward", "flash",
}

# creature-type words, substring-matched against type_line
TYPE_WORDS = {
    "dragon", "soldier", "wizard", "zombie", "angel", "demon", "human",
    "elf", "goblin", "knight", "warrior", "beast", "spirit", "vampire",
    "merfolk", "dwarf", "giant", "robot",
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Checkpoint**

No git in UBDB. Confirm `python -m pytest tests/test_suggest.py -v` is green before moving on.

---

### Task 2: Scorer (`score_cards`)

**Files:**
- Create: `backend/suggest.py`
- Test: `backend/tests/test_suggest.py` (append)

**Interfaces:**
- Consumes: `suggest_lexicon` (Task 1).
- Produces:
  - `score_cards(description: str, cards: list[dict], facets: dict | None = None, top_n: int = 8) -> tuple[list[dict], dict]`
    - Returns `(results, inferred_facets)`.
    - Each result: `{"oracle_id", "name", "score" (int), "why" (list[str]), "art_uri", "type_line"}`, score-descending, zero-score dropped, at most `top_n`.
    - `inferred_facets`: `{"colors": list[str], "roles": list[str]}` — the color letters and role words that fired.
    - Tie-break: higher rarity rank, then lower `reskin_count` (missing → 0).
    - `facets`, if given with `colors`/`roles` lists, overrides the description-derived sets for those signals (hard-uses them).
    - Tolerates missing card fields.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_suggest.py
from suggest import score_cards

CARDS = [
    {"oracle_id": "w1", "name": "White Wall", "colors": ["W"],
     "keywords": ["Defender"], "toughness": "6", "cmc": 3.0,
     "type_line": "Creature — Human Soldier", "oracle_text": "",
     "ub_franchises": ["Fallout"], "rarity": "rare", "art_uri": "a",
     "reskin_count": 0},
    {"oracle_id": "b1", "name": "Black Blade", "colors": ["B"],
     "keywords": ["Deathtouch"], "toughness": "1", "cmc": 2.0,
     "type_line": "Creature — Human Assassin", "oracle_text": "",
     "ub_franchises": ["The Last of Us"], "rarity": "mythic", "art_uri": "b",
     "reskin_count": 5},
    {"oracle_id": "x1", "name": "Plain Bear", "colors": ["G"],
     "keywords": [], "toughness": "2", "cmc": 2.0,
     "type_line": "Creature — Bear", "oracle_text": "",
     "ub_franchises": [], "rarity": "common", "art_uri": "x",
     "reskin_count": 0},
]


def test_role_and_color_rank_matching_card_first():
    results, _ = score_cards("a loyal guardian who protects", CARDS)
    assert results[0]["oracle_id"] == "w1"          # W color + Defender role
    assert any("guardian" in w.lower() for w in results[0]["why"])


def test_zero_score_cards_dropped():
    results, _ = score_cards("a ruthless assassin", CARDS)
    ids = [r["oracle_id"] for r in results]
    assert "b1" in ids and "x1" not in ids           # bear matches nothing


def test_inferred_facets_report_fired_signals():
    _, facets = score_cards("a ruthless guardian", CARDS)
    assert "B" in facets["colors"]
    assert "guardian" in facets["roles"]


def test_franchise_name_hard_boosts():
    results, _ = score_cards("something from Fallout", CARDS)
    assert results[0]["oracle_id"] == "w1"           # franchise weight 6 dominates


def test_facets_override_colors():
    # description has no color word; explicit facet forces black
    results, _ = score_cards("a fighter", CARDS, facets={"colors": ["B"], "roles": []})
    assert results[0]["oracle_id"] == "b1"


def test_missing_fields_do_not_crash():
    sparse = [{"oracle_id": "s", "name": "Sparse", "type_line": "Creature",
               "oracle_text": "Flying"}]
    results, _ = score_cards("flying", sparse)
    assert results == [] or results[0]["oracle_id"] == "s"


def test_tie_break_prefers_higher_rarity_then_fewer_reskins():
    tied = [
        {"oracle_id": "lo", "name": "Lo", "colors": ["W"], "keywords": [],
         "type_line": "Creature", "oracle_text": "", "ub_franchises": [],
         "rarity": "common", "reskin_count": 0, "art_uri": ""},
        {"oracle_id": "hi", "name": "Hi", "colors": ["W"], "keywords": [],
         "type_line": "Creature", "oracle_text": "", "ub_franchises": [],
         "rarity": "mythic", "reskin_count": 0, "art_uri": ""},
    ]
    results, _ = score_cards("noble", tied)   # both match color only, equal score
    assert results[0]["oracle_id"] == "hi"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'suggest'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/suggest.py
"""Deterministic heuristic scorer for Suggest-a-Reskin. Pure functions only:
no Flask, no I/O. Cards are passed in so tests can inject fixtures."""
import re

import suggest_lexicon as lex

_RARITY_RANK = {"common": 0, "uncommon": 1, "rare": 2, "mythic": 3,
                "special": 4, "bonus": 5}


def _tokens(description):
    return set(re.findall(r"[a-z]+", (description or "").lower()))


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _fired_colors(tokens, facets):
    if facets and facets.get("colors"):
        return {(c, None) for c in facets["colors"]}          # (color, source_word)
    return {(lex.COLOR_WORDS[t], t) for t in tokens if t in lex.COLOR_WORDS}


def _fired_roles(tokens, facets):
    if facets and facets.get("roles"):
        return [r for r in facets["roles"] if r in lex.ROLE_WORDS]
    return [t for t in tokens if t in lex.ROLE_WORDS]


def _role_matches(card, cond):
    kws = {k.lower() for k in card.get("keywords", []) or []}
    if "keyword" in cond and cond["keyword"].lower() not in kws:
        return False
    if "min_toughness" in cond and _int(card.get("toughness")) < cond["min_toughness"]:
        return False
    if "max_cmc" in cond and (card.get("cmc") or 0) > cond["max_cmc"]:
        return False
    if "type" in cond and cond["type"].lower() not in (card.get("type_line") or "").lower():
        return False
    if "text" in cond and cond["text"].lower() not in (card.get("oracle_text") or "").lower():
        return False
    return True


def _score_card(card, tokens, colors, roles, franchise_tokens):
    score, why = 0, []
    card_colors = set(card.get("colors", []) or [])
    for color, word in colors:
        if color in card_colors:
            score += lex.WEIGHTS["color"]
            label = word if word else color
            why.append(f"'{label}' -> {color}")
    for word in roles:
        if _role_matches(card, lex.ROLE_WORDS[word]):
            score += lex.WEIGHTS["role"]
            why.append(f"'{word}' -> role fit")
    kws = {k.lower() for k in card.get("keywords", []) or []}
    for t in tokens & lex.KEYWORD_WORDS:
        if t in kws:
            score += lex.WEIGHTS["keyword"]
            why.append(f"'{t}' -> keyword")
    tline = (card.get("type_line") or "").lower()
    for t in tokens & lex.TYPE_WORDS:
        if t in tline:
            score += lex.WEIGHTS["type"]
            why.append(f"'{t}' -> type")
    for fr in card.get("ub_franchises", []) or []:
        if fr.lower() in franchise_tokens:
            score += lex.WEIGHTS["franchise"]
            why.append(f"franchise: {fr}")
    return score, why


def score_cards(description, cards, facets=None, top_n=8):
    tokens = _tokens(description)
    desc_lower = (description or "").lower()
    colors = _fired_colors(tokens, facets)
    roles = _fired_roles(tokens, facets)
    franchise_tokens = {
        fr.lower() for card in cards for fr in (card.get("ub_franchises") or [])
        if fr.lower() in desc_lower
    }

    scored = []
    for card in cards:
        score, why = _score_card(card, tokens, colors, roles, franchise_tokens)
        if score > 0:
            scored.append((score, card, why))

    scored.sort(key=lambda s: (
        -s[0],
        -_RARITY_RANK.get(s[1].get("rarity"), -1),
        _int(s[1].get("reskin_count"), 0),
    ))

    results = [{
        "oracle_id": c.get("oracle_id"),
        "name": c.get("name"),
        "score": score,
        "why": why,
        "art_uri": c.get("art_uri"),
        "type_line": c.get("type_line"),
    } for score, c, why in scored[:top_n]]

    inferred = {
        "colors": sorted({color for color, _ in colors}),
        "roles": sorted(set(roles)),
    }
    return results, inferred
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: PASS (all lexicon + scorer tests green)

- [ ] **Step 5: Checkpoint**

Confirm `python -m pytest tests/test_suggest.py -v` is fully green.

---

### Task 3: API route `POST /api/suggest`

**Files:**
- Modify: `backend/app.py` (add route near the other `/api` routes, after `search_cards`)
- Test: `backend/tests/test_suggest_api.py`

**Interfaces:**
- Consumes: `score_cards` (Task 2), existing `_CARDS` / `_load_counts()` in `app.py`.
- Produces: `POST /api/suggest` → `200 {"results": [...], "inferred_facets": {...}}`; `400 {"error": "description required"}` on empty description.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_suggest_api.py
def test_suggest_requires_description(client):
    resp = client.post("/api/suggest", json={"description": "  "})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "description required"


def test_suggest_returns_results_shape(client):
    # conftest card: type "Legendary Creature", oracle_text "Flying",
    # franchise "Avatar: The Last Airbender"
    resp = client.post("/api/suggest", json={"description": "a flying legendary hero"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body.keys()) == {"results", "inferred_facets"}
    assert body["results"][0]["oracle_id"] == "oracle-1"
    assert any("flying" in w.lower() for w in body["results"][0]["why"])


def test_suggest_empty_when_no_signal(client):
    resp = client.post("/api/suggest", json={"description": "qqqq zzzz"})
    assert resp.status_code == 200
    assert resp.get_json()["results"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_suggest_api.py -v`
Expected: FAIL with 404 (route not registered)

- [ ] **Step 3: Add the route to `app.py`**

Add near the top with the other imports:

```python
from suggest import score_cards
```

Add this route immediately after the `search_cards` function (after the block ending around `app.py:195`):

```python
@app.post("/api/suggest")
def suggest_reskin():
    payload = request.get_json(silent=True) or {}
    description = (payload.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description required"}), 400
    facets = payload.get("facets") if isinstance(payload.get("facets"), dict) else None
    counts = _load_counts()
    cards = [{**c, "reskin_count": counts.get(c["oracle_id"], 0)} for c in _CARDS]
    results, inferred = score_cards(description, cards, facets=facets)
    return jsonify({"results": results, "inferred_facets": inferred})
```

(Confirm `request` and `jsonify` are already imported at the top of `app.py` — they are, used by existing routes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_suggest_api.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (no regression in existing tests).

- [ ] **Step 6: Checkpoint**

Backend suite green.

---

### Task 4: Frontend API client `suggestCards`

**Files:**
- Modify: `src/lib/api.ts` (append a new function + interfaces)
- Modify: `src/types/types.ts` (append `SuggestResultItem`, `SuggestResponse` — additive only; other sessions edit this file, do not reorder existing content)

**Interfaces:**
- Produces:
  - `interface SuggestResultItem { oracle_id: string; name: string; score: number; why: string[]; art_uri: string | null; type_line: string; }`
  - `interface SuggestResponse { results: SuggestResultItem[]; inferred_facets: { colors: string[]; roles: string[] }; }`
  - `suggestCards(body: { description: string; image_url?: string; facets?: { colors: string[]; roles: string[] } }): Promise<SuggestResponse>`

- [ ] **Step 1: Add types to `src/types/types.ts`**

Append at the end of the file (do not touch existing interfaces):

```typescript
export interface SuggestResultItem {
  oracle_id: string;
  name: string;
  score: number;
  why: string[];
  art_uri: string | null;
  type_line: string;
}

export interface SuggestResponse {
  results: SuggestResultItem[];
  inferred_facets: { colors: string[]; roles: string[] };
}
```

- [ ] **Step 2: Add the client to `src/lib/api.ts`**

Append at the end of the file, following the existing `submitReskin` POST pattern:

```typescript
import type { SuggestResponse } from "@/types/types"; // add to the existing type import block at top

export async function suggestCards(body: {
  description: string;
  image_url?: string;
  facets?: { colors: string[]; roles: string[] };
}): Promise<SuggestResponse> {
  const res = await fetch(`${API_BASE_URL}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Suggest failed (${res.status})`);
  }
  return res.json();
}
```

(Merge the `SuggestResponse` import into the existing `import { ... } from "@/types/types"` line at the top of `api.ts` rather than adding a duplicate import.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Checkpoint**

Typecheck clean.

---

### Task 5: Results component `SuggestResults`

**Files:**
- Create: `src/components/SuggestResults.tsx`

**Interfaces:**
- Consumes: `SuggestResultItem`, `getImageSrc` from `@/lib/api`.
- Produces:
  - Default export `SuggestResults` component with props:
    `{ results: SuggestResultItem[]; inferredFacets: { colors: string[]; roles: string[] }; imageUrl: string; onFacetsChange: (facets: { colors: string[]; roles: string[] }) => void; }`
  - Renders each result as a card (art thumb, name, type_line, `why[]` list) linking to
    `/card/<oracle_id>/suggest?image_url=<enc>&name=<enc name>`.
  - Renders inferred colors/roles as removable chips; removing one calls `onFacetsChange` with the reduced set (drives a re-query in Task 6).
  - Empty `results` → an empty-state line.

- [ ] **Step 1: Create the component**

```tsx
// src/components/SuggestResults.tsx
"use client";
import Link from "next/link";
import { getImageSrc } from "@/lib/api";
import { SuggestResultItem } from "@/types/types";

type Facets = { colors: string[]; roles: string[] };

export default function SuggestResults({
  results,
  inferredFacets,
  imageUrl,
  onFacetsChange,
}: {
  results: SuggestResultItem[];
  inferredFacets: Facets;
  imageUrl: string;
  onFacetsChange: (f: Facets) => void;
}) {
  const chips: { kind: "colors" | "roles"; value: string }[] = [
    ...inferredFacets.colors.map((v) => ({ kind: "colors" as const, value: v })),
    ...inferredFacets.roles.map((v) => ({ kind: "roles" as const, value: v })),
  ];

  function removeChip(kind: "colors" | "roles", value: string) {
    onFacetsChange({
      ...inferredFacets,
      [kind]: inferredFacets[kind].filter((v) => v !== value),
    });
  }

  return (
    <div className="grid gap-6">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xs uppercase tracking-wider text-ink/60 dark:text-ink-dark/50">
            Read as:
          </span>
          {chips.map((c) => (
            <button
              key={`${c.kind}:${c.value}`}
              onClick={() => removeChip(c.kind, c.value)}
              className="rounded-full border border-gold/50 px-3 py-1 font-mono text-xs text-gold hover:bg-gold/10"
              title="Remove to re-rank"
            >
              {c.value} ✕
            </button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <p className="font-body text-sm text-ink/60 dark:text-ink-dark/50">
          No strong match — try more descriptive words (a color, a role like
          “guardian” or “assassin”, or the franchise name).
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {results.map((r) => (
            <li key={r.oracle_id}>
              <Link
                href={`/card/${r.oracle_id}/suggest?image_url=${encodeURIComponent(
                  imageUrl,
                )}&name=${encodeURIComponent(r.name)}`}
                className="flex gap-3 rounded-card border border-gold/40 p-3 transition hover:border-gold hover:bg-gold/5"
              >
                {r.art_uri && (
                  <img
                    src={getImageSrc(r.art_uri)}
                    alt=""
                    className="h-24 w-16 flex-none rounded object-cover"
                  />
                )}
                <div className="grid content-start gap-1">
                  <span className="font-display text-sm text-gold">{r.name}</span>
                  <span className="font-mono text-xs text-ink/60 dark:text-ink-dark/50">
                    {r.type_line}
                  </span>
                  <ul className="mt-1 grid gap-0.5">
                    {r.why.map((w, i) => (
                      <li key={i} className="font-body text-xs text-ink/70 dark:text-ink-dark/60">
                        · {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </Link>
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

- [ ] **Step 3: Checkpoint**

Typecheck clean.

---

### Task 6: Suggest page `/suggest`

**Files:**
- Create: `src/app/suggest/page.tsx`
- Modify: `src/components/Header.tsx` (add a nav link to `/suggest` — match the existing link markup)

**Interfaces:**
- Consumes: `suggestCards` (Task 4), `SuggestResults` (Task 5), `SuggestResponse` type.

- [ ] **Step 1: Create the page**

```tsx
// src/app/suggest/page.tsx
"use client";
import { useState } from "react";
import { suggestCards, getImageSrc } from "@/lib/api";
import SuggestResults from "@/components/SuggestResults";
import { SuggestResponse } from "@/types/types";

const field =
  "rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold";
const legend =
  "font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70";

type Facets = { colors: string[]; roles: string[] };

export default function SuggestReskinPage() {
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run(facets?: Facets) {
    setError(null);
    setStatus("loading");
    try {
      const res = await suggestCards({
        description: description.trim(),
        image_url: imageUrl.trim() || undefined,
        facets,
      });
      setData(res);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="py-8">
      <h1 className="mb-6 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
        Suggest a Reskin
      </h1>
      <p className="mb-6 max-w-xl font-body text-sm text-ink/70 dark:text-ink-dark/60">
        Describe your character and (optionally) link a picture. We’ll suggest UB
        cards that fit, and you can submit a reskin from there.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="grid max-w-xl gap-5"
      >
        <fieldset className="grid gap-2">
          <label className={legend}>Description *</label>
          <textarea
            required
            rows={3}
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. a loyal guardian who protects survivors — tough, from The Last of Us"
          />
        </fieldset>

        <fieldset className="grid gap-2">
          <label className={legend}>Picture link (optional)</label>
          <input
            type="url"
            className={field}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://… (self-hosted; carried into the reskin form)"
          />
          {imageUrl.trim() && (
            <img
              src={getImageSrc(imageUrl.trim())}
              alt="preview"
              className="mt-1 w-32 rounded-card border-2 border-gold/40"
            />
          )}
        </fieldset>

        {error && <p className="font-mono text-sm text-mana-r">Failed: {error}</p>}

        <button
          disabled={status === "loading"}
          className="rounded-card bg-gold px-4 py-2 font-display uppercase tracking-wider text-frame transition hover:brightness-110 disabled:opacity-50"
        >
          {status === "loading" ? "Matching…" : "Suggest cards"}
        </button>
      </form>

      {data && (
        <section className="mt-10">
          <SuggestResults
            results={data.results}
            inferredFacets={data.inferred_facets}
            imageUrl={imageUrl.trim()}
            onFacetsChange={(f) => {
              setData({ ...data, inferred_facets: f });
              run(f);
            }}
          />
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add a Header nav link**

Open `src/components/Header.tsx`, find the existing nav links, and add one matching their markup:

```tsx
<Link href="/suggest">Suggest a Reskin</Link>
```

(Match the exact className/wrapper the sibling links use — copy a neighbor.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: typecheck clean, build succeeds, `/suggest` shows in the route list.

- [ ] **Step 4: Checkpoint**

Build green.

---

### Task 7: Prefill the existing reskin form from query params

**Files:**
- Modify: `src/app/card/[id]/suggest/page.tsx` (initialize `reskinName` and `imageUrl` from query params)

**Interfaces:**
- Consumes: `image_url` + `name` query params written by `SuggestResults` links (Task 5).

- [ ] **Step 1: Read the params for prefill**

In `SuggestForm` (`src/app/card/[id]/suggest/page.tsx`), the component already calls
`useSearchParams()` (`const params = useSearchParams();`). Change the two initial
`useState("")` calls so they seed from the params:

```tsx
// was: const [reskinName, setReskinName] = useState("");
const [reskinName, setReskinName] = useState(params.get("name") ?? "");
// was: const [imageUrl, setImageUrl] = useState("");
const [imageUrl, setImageUrl] = useState(params.get("image_url") ?? "");
```

Leave everything else unchanged. (These `useState` calls sit just below the existing
`const face = Number(params.get("face") ?? "0");` line, so `params` is already in scope.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (end-to-end)**

With backend (`flask --app app run`) and frontend (`npm run dev`) up:
1. Open `/suggest`, enter `a loyal guardian who protects, from Fallout` and a picture URL, submit.
2. Confirm ranked candidates appear, each with `why` lines, and a "Read as:" chip row.
3. Remove a chip → list re-ranks (network re-POST to `/api/suggest`).
4. Click a candidate → the reskin form opens with the picture URL and card name prefilled.

- [ ] **Step 4: Checkpoint**

End-to-end flow verified.

---

## Self-Review

**Spec coverage:**
- Anonymous flow, picture URL + description → Tasks 3, 6 (public route, no auth). ✓
- Heuristic lexicon → facet weights → Tasks 1–2. ✓
- Ranking + tie-break + `why[]` → Task 2. ✓
- Inferred facets as editable chips → Tasks 2 (returns), 5 (chips), 6 (re-query). ✓
- `POST /api/suggest` request/response shape → Task 3. ✓
- Handoff to existing form with prefill → Tasks 5 (links) + 7 (reads params). ✓
- Error handling (empty desc 400, no-match empty 200) → Tasks 3 tests. ✓
- Testing (lexicon, ranking, franchise boost, facet override, tie-break, 400) → Tasks 1–3. ✓
- No Drive / no AI / no login → honored throughout; route is public, scorer is pure. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output.

**Type consistency:** `score_cards(description, cards, facets, top_n) -> (results, inferred_facets)` used identically in Tasks 2 and 3. Result keys (`oracle_id, name, score, why, art_uri, type_line`) match `SuggestResultItem` (Task 4) and `SuggestResults` props (Task 5). `inferred_facets: {colors, roles}` consistent across Tasks 2, 4, 5, 6. Query params `image_url` + `name` written in Task 5, read in Task 7.
