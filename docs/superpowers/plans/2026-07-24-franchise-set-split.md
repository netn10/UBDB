# Franchise / Set Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single mislabeled "franchise" dimension (which actually holds Scryfall set names) into a real franchise dimension (Avatar, Warhammer) plus a set dimension, browsable and searchable independently.

**Architecture:** A pure, tested resolution module maps set names → franchises using two committed data files; the sync script stamps both `set_names` and `franchises` onto each card at snapshot-build time, so the backend reads pre-computed fields with no runtime map loading. Search, suggest, API, and frontend are repointed to the new fields.

**Tech Stack:** Python 3.12 / Flask / pytest (backend + scripts), Next.js 14 / React / TypeScript / Tailwind (frontend), pymongo + mongomock (unaffected here).

## Global Constraints

- **Field rename, not alias:** `ub_franchises` is removed everywhere. Cards gain `set_names: string[]` (the old value, renamed) and `franchises: string[]` (derived). No field keeps its old name with a new meaning.
- **Franchise derivation is data-driven:** `data/franchises/set_map.json` (39 set names → franchise | null) and `data/franchises/card_overrides.json` (oracle_id → {name, franchise}). Both already exist and are committed. Do not regenerate them in this plan.
- **Fail loud on unmapped sets:** resolving a card whose set name is absent from `set_map.json` raises, never defaults. This is the guard against a new Scryfall set slipping in silently.
- **`Unassigned` is the only fallback franchise** and is currently unused (every card resolves). It must never be matchable by the suggester.
- **Pipe is the OR delimiter** in `fr:`/`set:` values (`fr:"fallout|marvel"`), never comma — set names contain commas (`Warhammer 40,000`).
- **Universes Within (`slx`) is excluded** from the dataset by the sync script.
- **Commits:** conventional-commit subject lines. Do **not** add `Co-Authored-By` or any AI-attribution trailer (project owner's standing instruction). Author is the repo-local identity `netn10 <netn10@gmail.com>`, not the global git identity.

---

### Task 1: Franchise resolution module

Pure functions that load the two data files and resolve a card's franchises. No I/O beyond reading the JSON files; importable by both the sync script and its tests.

**Files:**
- Create: `scripts/franchise_map.py`
- Test: `scripts/tests/test_franchise_map.py`

**Interfaces:**
- Consumes: `data/franchises/set_map.json`, `data/franchises/card_overrides.json` (already committed).
- Produces:
  - `load_maps(data_dir: str) -> tuple[dict, dict]` — returns `(set_map, overrides)`.
  - `resolve_franchises(set_names: list[str], oracle_id: str, set_map: dict, overrides: dict) -> list[str]` — sorted franchise list, or `["Unassigned"]` when nothing resolves. Raises `KeyError` if a set name is absent from `set_map`.
  - `DEFAULT_DATA_DIR: str` — absolute path to `<repo>/data/franchises`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/tests/test_franchise_map.py
import os
import pytest
from franchise_map import load_maps, resolve_franchises, DEFAULT_DATA_DIR


@pytest.fixture(scope="module")
def maps():
    return load_maps(DEFAULT_DATA_DIR)


def test_single_set_resolves_to_its_franchise(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Avatar: The Last Airbender"], "o-x", set_map, overrides
    ) == ["Avatar: The Last Airbender"]


def test_multiple_sets_collapse_to_one_franchise(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Final Fantasy", "Final Fantasy Commander", "Final Fantasy Promos"],
        "o-x", set_map, overrides,
    ) == ["Final Fantasy"]


def test_sets_spanning_two_franchises_returns_both_sorted(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Fallout", "Warhammer 40,000 Commander"], "o-x", set_map, overrides
    ) == ["Fallout", "Warhammer 40,000"]


def test_mixed_set_alone_is_unassigned(maps):
    set_map, overrides = maps
    assert resolve_franchises(
        ["Secret Lair Drop"], "o-not-overridden", set_map, overrides
    ) == ["Unassigned"]


def test_override_resolves_a_mixed_only_card(maps):
    set_map, overrides = maps
    # Sonic the Hedgehog — printed only in Secret Lair, resolved via override.
    oid = next(k for k, v in overrides.items() if v["name"] == "Sonic the Hedgehog")
    assert resolve_franchises(
        ["Secret Lair Drop"], oid, set_map, overrides
    ) == ["Sonic the Hedgehog"]


def test_override_is_additive_not_replacing(maps):
    set_map, overrides = maps
    oid = next(k for k, v in overrides.items() if v["name"] == "Sonic the Hedgehog")
    # A Fallout print plus the Sonic override yields both, sorted.
    assert resolve_franchises(
        ["Fallout", "Secret Lair Drop"], oid, set_map, overrides
    ) == ["Fallout", "Sonic the Hedgehog"]


def test_unknown_set_raises(maps):
    set_map, overrides = maps
    with pytest.raises(KeyError):
        resolve_franchises(["No Such Set 2099"], "o-x", set_map, overrides)


def test_overrides_all_reference_valid_franchises(maps):
    # Every override franchise must be a value the set_map produces OR a
    # deliberate new single-IP franchise; here we just assert it is a non-empty
    # string, catching empty/None typos in the data file.
    _, overrides = maps
    for oid, entry in overrides.items():
        assert entry["franchise"] and isinstance(entry["franchise"], str)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts && python -m pytest tests/test_franchise_map.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'franchise_map'`

(`scripts/pytest.ini` or the existing test layout puts `scripts/` on the path; the sibling `tests/test_normalize.py` already imports `sync_ub_cards` the same way. If import resolution differs, run from `scripts/` as shown.)

- [ ] **Step 3: Write the implementation**

```python
# scripts/franchise_map.py
"""Resolve a card's franchises from its set names, using two committed data
files. Pure: the only I/O is reading those JSON files in load_maps().

- set_map.json:  set name -> franchise, or null for franchise-mixed sets.
- card_overrides.json:  oracle_id -> {"name": ..., "franchise": ...}, for cards
  printed only in mixed sets and thus not resolvable from a set name.
"""
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.join(
    os.path.dirname(_HERE), "data", "franchises"
)


def load_maps(data_dir: str) -> tuple[dict, dict]:
    with open(os.path.join(data_dir, "set_map.json"), encoding="utf-8") as f:
        set_map = json.load(f)
    with open(os.path.join(data_dir, "card_overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    return set_map, overrides


def resolve_franchises(set_names: list, oracle_id: str,
                       set_map: dict, overrides: dict) -> list:
    """Return the sorted franchises for a card, or ["Unassigned"] if none.

    Raises KeyError if any set name is not present in set_map — a new set must
    be mapped deliberately rather than silently bucketed.
    """
    franchises = set()
    for name in set_names:
        if name not in set_map:
            raise KeyError(f"set name not in set_map.json: {name!r}")
        franchise = set_map[name]
        if franchise is not None:
            franchises.add(franchise)
    override = overrides.get(oracle_id)
    if override:
        franchises.add(override["franchise"])
    return sorted(franchises) if franchises else ["Unassigned"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd scripts && python -m pytest tests/test_franchise_map.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/franchise_map.py scripts/tests/test_franchise_map.py
git commit -m "feat(scripts): add franchise resolution module"
```

---

### Task 2: Stamp set_names + franchises in the sync script, exclude Universes Within

Modify `group_prints` to (a) drop `slx` prints, (b) rename `ub_franchises` → `set_names`, (c) compute `franchises` via Task 1.

**Files:**
- Modify: `scripts/sync_ub_cards.py` (imports near top; `group_prints` at lines 111-159)
- Modify: `scripts/tests/test_normalize.py` (the `ub_franchises` assertions at lines 38-40)
- Modify: `scripts/tests/fixtures/scryfall_card.json` (add an `slx` print to exercise exclusion)

**Interfaces:**
- Consumes: `franchise_map.load_maps`, `franchise_map.resolve_franchises` (Task 1).
- Produces: each card dict now has `set_names: list[str]` and `franchises: list[str]`, and no `ub_franchises`. Cards whose every print is `slx` are dropped.

- [ ] **Step 1: Update the fixture to include a Universes Within print**

Append one print object to `scripts/tests/fixtures/scryfall_card.json` — a 4th entry sharing Aang's `oracle_id` but in set `slx`, so the card keeps its real prints and the `slx` one is dropped. Read the file first to match its exact shape; add an object with at minimum:

```json
{
  "id": "print-aaaa-0000-0000-000000000099",
  "oracle_id": "oracle-1111-0000-0000-000000000001",
  "name": "Aang, Airbending Master",
  "set": "slx",
  "set_name": "Universes Within",
  "collector_number": "99",
  "rarity": "mythic",
  "released_at": "2026-01-01",
  "reprint": false,
  "image_uris": {
    "small": "https://cards.scryfall.io/small/uw1.jpg",
    "normal": "https://cards.scryfall.io/normal/uw1.jpg",
    "art_crop": "https://cards.scryfall.io/art_crop/uw1.jpg",
    "png": "https://cards.scryfall.io/png/uw1.png"
  },
  "colors": ["W", "U"],
  "color_identity": ["U", "W"],
  "cmc": 4.0,
  "power": "3",
  "toughness": "4",
  "keywords": ["Flying"],
  "layout": "normal"
}
```

- [ ] **Step 2: Write the failing tests**

Replace the existing `test_group_lists_all_franchises_sorted_unique` (lines 38-40) and add exclusion + franchise tests:

```python
# scripts/tests/test_normalize.py  (replace the ub_franchises test, add new ones)
def test_group_lists_set_names_sorted_unique():
    card = group_prints(_prints())[0]
    # slx print is dropped, so "Universes Within" never appears in set_names.
    assert card["set_names"] == ["Avatar: The Last Airbender", "Special Guests"]
    assert "ub_franchises" not in card


def test_group_computes_franchises_from_set_names():
    card = group_prints(_prints())[0]
    # Avatar maps to its franchise; "Special Guests" is mapped to None (mixed)
    # by the injected test set_map, so it contributes nothing.
    assert card["franchises"] == ["Avatar: The Last Airbender"]


def test_group_drops_universes_within_print():
    card = group_prints(_prints())[0]
    assert all(p["set"] != "slx" for p in card["prints"])


def test_group_drops_card_that_is_only_universes_within():
    # A card whose sole print is slx is not a UB card and is excluded entirely.
    raw = [dict(_prints()[0])]
    raw[0]["set"] = "slx"
    raw[0]["set_name"] = "Universes Within"
    assert group_prints(raw) == []
```

Note on `test_group_computes_franchises_from_set_names`: the fixture uses the set name `"Special Guests"`, which is **not** in the real `set_map.json`, so `resolve_franchises` would raise. Handle this in the test by monkeypatching the maps the sync uses (Step 3 wires `group_prints` to accept an injected map for testability). Add at the top of the test module:

```python
import pytest
import sync_ub_cards


@pytest.fixture(autouse=True)
def _fixture_maps(monkeypatch):
    # The fixture's set names include "Special Guests", which is not a real UB
    # set. Inject a test set_map so group_prints resolves deterministically
    # without depending on (or mutating) the committed data files.
    set_map = {
        "Avatar: The Last Airbender": "Avatar: The Last Airbender",
        "Special Guests": None,          # treated as franchise-mixed
    }
    monkeypatch.setattr(sync_ub_cards, "_MAPS", (set_map, {}))
```

- [ ] **Step 3: Run to verify failure**

Run: `cd scripts && python -m pytest tests/test_normalize.py -v`
Expected: FAIL — cards still have `ub_franchises`, no `set_names`/`franchises`, `slx` print present, and `_MAPS` attribute does not exist yet.

- [ ] **Step 4: Implement the sync changes**

Add imports and a module-level lazily-loaded maps handle near the top of `scripts/sync_ub_cards.py` (after the existing imports, around line 19):

```python
import franchise_map

# Loaded once; tests may monkeypatch this to inject deterministic maps.
_MAPS = None


def _maps():
    global _MAPS
    if _MAPS is None:
        _MAPS = franchise_map.load_maps(franchise_map.DEFAULT_DATA_DIR)
    return _MAPS


UNIVERSES_WITHIN = {"slx"}  # Universes Within: MTG-native, not UB. Excluded.
```

Rewrite the tail of `group_prints` (current lines 142-159). Drop `slx` prints before the reprint check, and replace the `ub_franchises` line with `set_names` + `franchises`:

```python
    set_map, overrides = _maps()
    result = []
    for card in by_oracle.values():
        prints = [p for p in card["prints"] if p["set"] not in UNIVERSES_WITHIN]
        card["prints"] = prints
        if not prints:
            continue  # card existed only as Universes Within — not a UB card
        # Keep only cards born in Universes Beyond (see existing comment): a
        # card whose every remaining printing is a reprint already exists as a
        # normal Magic card and needs no community reskin.
        if not any(p["reprint"] is False for p in prints):
            continue
        card["set_names"] = sorted({p["set_name"] for p in prints if p["set_name"]})
        card["franchises"] = franchise_map.resolve_franchises(
            card["set_names"], card["oracle_id"], set_map, overrides
        )
        card["art_uri"] = next((p["art_uri"] for p in prints if p["art_uri"]), None)
        dates = [p["released_at"] for p in prints if p.get("released_at")]
        card["released_at"] = min(dates) if dates else None
        result.append(card)
    return result
```

(`_maps()` returns `_MAPS` when it is already set, so the autouse test fixture's `monkeypatch.setattr(sync_ub_cards, "_MAPS", ...)` short-circuits the file load and injects deterministic maps; production hits the real files.)

- [ ] **Step 5: Run to verify pass**

Run: `cd scripts && python -m pytest tests/test_normalize.py -v`
Expected: PASS (all, including the renamed/added tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/sync_ub_cards.py scripts/tests/test_normalize.py scripts/tests/fixtures/scryfall_card.json
git commit -m "feat(scripts): stamp set_names + franchises, exclude Universes Within"
```

---

### Task 3: Repoint search operators — fr: to franchises, widen set:

`fr:`/`franchise:` matches the new `franchises` field; `set:`/`e:` matches an exact set code OR a set-name substring. Add `order=set`; `order=franchise` reads `franchises`.

**Files:**
- Modify: `backend/search.py` — `_set_pred` (149-152), `_franchise_pred` (155-161), `_sort_key` (258-259)
- Modify: `backend/tests/test_search.py` — inline `CARDS` (lines 3-31) need `set_names`/`franchises`; add set-name-substring + order tests

**Interfaces:**
- Consumes: cards with `franchises: list[str]` and `set_names: list[str]` (Task 2 schema).
- Produces: no new exports; behavior of `search(...)` changes for `fr:`, `set:`, `order`.

- [ ] **Step 1: Update the test CARDS to the new schema and write failing tests**

In `backend/tests/test_search.py`, give each of the three `CARDS` both fields. Replace each card's `"ub_franchises": [...]` with `"franchises"` + `"set_names"`, and add a `set_name` to each print:

```python
# Aang
"franchises": ["Avatar: The Last Airbender"],
"set_names": ["Avatar: The Last Airbender"],
"prints": [{"set": "tla", "set_name": "Avatar: The Last Airbender"}],
# Lightning Bolt
"franchises": ["Warhammer 40,000"],
"set_names": ["Warhammer 40,000 Commander"],
"prints": [{"set": "40k", "set_name": "Warhammer 40,000 Commander"}],
# Stone Wall
"franchises": ["Fallout"],
"set_names": ["Fallout"],
"prints": [{"set": "pip", "set_name": "Fallout"}],
```

Then update the franchise-name expectations and add new tests:

```python
def test_franchise_operator_matches_franchise_field():
    assert _names('fr:"warhammer 40,000"') == ["Lightning Bolt"]


def test_franchise_or_pipe():
    assert set(_names('fr:"fallout|avatar"')) == {"Stone Wall", "Aang, Airbending Master"}


def test_set_operator_matches_exact_code():
    assert _names("set:40k") == ["Lightning Bolt"]


def test_set_operator_matches_set_name_substring():
    # New: set: now also matches a substring of the card's set names.
    assert _names('set:"warhammer"') == ["Lightning Bolt"]


def test_set_name_substring_does_not_match_the_franchise_field():
    # Lightning Bolt's franchise is "Warhammer 40,000" but its set name is
    # "Warhammer 40,000 Commander". set: must match the set, fr: the franchise.
    assert _names('set:"commander"') == ["Lightning Bolt"]
    assert _names('fr:"commander"') == []


def test_order_by_set_name():
    names = _names("", order="set")
    # Alphabetical by first set name: Avatar, Fallout, Warhammer 40,000 Commander
    assert names == ["Aang, Airbending Master", "Stone Wall", "Lightning Bolt"]


def test_order_by_franchise():
    names = _names("", order="franchise")
    assert names == ["Aang, Airbending Master", "Stone Wall", "Lightning Bolt"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_search.py -v`
Expected: FAIL — `fr:` still reads `ub_franchises` (KeyError / no match), `set:"warhammer"` returns nothing, `order=set` unsupported.

- [ ] **Step 3: Implement the search changes**

`_set_pred` (backend/search.py:149) — match exact code OR set-name substring:

```python
def _set_pred(value):
    want = value.lower()
    def pred(card):
        if any((p.get("set") or "").lower() == want for p in card.get("prints", [])):
            return True
        return any(want in (s or "").lower() for s in card.get("set_names", []))
    return pred
```

`_franchise_pred` (backend/search.py:155) — read `franchises`:

```python
def _franchise_pred(value):
    # Pipe-separated means OR (e.g. fr:"fallout|marvel"). Pipe avoids colliding
    # with commas inside franchise names like "Warhammer 40,000".
    needles = [v.strip().lower() for v in value.split("|") if v.strip()]
    return lambda card: any(n in (f or "").lower()
                            for f in card.get("franchises", [])
                            for n in needles)
```

`_sort_key` (backend/search.py:258) — franchise reads `franchises`, add `set`:

```python
    if order == "franchise":
        return lambda c: ((c.get("franchises") or [""])[0], (c.get("name") or "").lower())
    if order == "set":
        return lambda c: ((c.get("set_names") or [""])[0], (c.get("name") or "").lower())
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_search.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/search.py backend/tests/test_search.py
git commit -m "feat(search): repoint fr: to franchises, widen set: to names, add order=set"
```

---

### Task 4: Repoint the reskin suggester and fix per-set double-counting

`_score_card` reads `franchises` instead of `ub_franchises`, and skips `Unassigned`. Because the loop now iterates franchises (deduped, one per IP) rather than set names, a card no longer scores the franchise weight once per set.

**Files:**
- Modify: `backend/suggest.py` — franchise loop at lines 95-98
- Modify: `backend/tests/test_suggest.py` — fixtures + a regression test for single-count scoring

**Interfaces:**
- Consumes: cards with `franchises: list[str]`.
- Produces: no signature change; scoring reads `franchises`.

- [ ] **Step 1: Write the failing tests**

Read `backend/tests/test_suggest.py` for its card-fixture shape, then add (adjust fixture construction to match the file's existing helper):

```python
def test_franchise_scores_once_per_franchise_not_per_set():
    # A card in three Avatar sets but one franchise scores the franchise weight
    # exactly once (regression: the old code summed it per set name).
    card = _card(
        name="Aang",
        franchises=["Avatar: The Last Airbender"],
        set_names=["Avatar: The Last Airbender",
                   "Avatar: The Last Airbender Promos",
                   "Avatar: The Last Airbender Eternal"],
    )
    results, _ = score_cards("an avatar hero", [card])
    assert results[0]["score"] == lex.WEIGHTS["franchise"]
    assert [w for w in results[0]["why"] if w.startswith("franchise:")] == \
        ["franchise: Avatar: The Last Airbender"]


def test_unassigned_franchise_never_scores():
    card = _card(name="Mystery", franchises=["Unassigned"], set_names=["Secret Lair Drop"])
    results, _ = score_cards("an unassigned thing", [card])
    assert results == []
```

If `test_suggest.py` has no `_card`/`lex` helpers, add at the top:

```python
import suggest_lexicon as lex
from suggest import score_cards


def _card(**over):
    base = {
        "oracle_id": "o", "name": "X", "oracle_text": "", "mana_cost": "",
        "type_line": "", "colors": [], "keywords": [], "cmc": 0,
        "power": None, "toughness": None, "rarity": "rare",
        "franchises": [], "set_names": [], "art_uri": None,
    }
    base.update(over)
    return base
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: FAIL — reads `ub_franchises` (absent → no franchise score), and `Unassigned` would score on the word "unassigned".

- [ ] **Step 3: Implement**

Replace the franchise loop in `backend/suggest.py` (lines 95-98):

```python
    # Franchise: whole-word / phrase match on the description. One entry per
    # franchise (not per set), and never the Unassigned fallback.
    for fr in card.get("franchises", []) or []:
        if fr == "Unassigned":
            continue
        if _franchise_hit(fr, desc_lower):
            score += lex.WEIGHTS["franchise"]
            why.append(f"franchise: {fr}")
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_suggest.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/suggest.py backend/tests/test_suggest.py
git commit -m "fix(suggest): score franchises once per IP, skip Unassigned"
```

---

### Task 5: API — /api/franchises reads franchises, add /api/sets

`/api/franchises` counts the `franchises` field; a new `/api/sets` counts `set_names`. Update the hermetic conftest sample and the API tests.

**Files:**
- Modify: `backend/app.py` — `list_franchises` (313-320); add `list_sets` after it
- Modify: `backend/tests/conftest.py` — sample card (lines 11-20) gains `set_names` + `franchises`
- Modify: `backend/tests/test_cards_api.py` — `test_franchises_lists_counts` (48-55); add a sets test

**Interfaces:**
- Consumes: `_CARDS` with `franchises` + `set_names`.
- Produces: `GET /api/sets -> {"sets": [{"name", "count"}]}`, mirroring `/api/franchises`.

- [ ] **Step 1: Update conftest sample and write failing tests**

In `backend/tests/conftest.py`, replace the sample card's `"ub_franchises": [...]` line with:

```python
        "set_names": ["Avatar: The Last Airbender", "Special Guests"],
        "franchises": ["Avatar: The Last Airbender"],
```

In `backend/tests/test_cards_api.py`, replace `test_franchises_lists_counts` and add a sets test:

```python
def test_franchises_lists_counts(client):
    resp = client.get("/api/franchises")
    assert resp.status_code == 200
    names = {f["name"]: f["count"] for f in resp.get_json()["franchises"]}
    assert names["Avatar: The Last Airbender"] == 1
    assert "Special Guests" not in names   # a set name, not a franchise
    assert "Unassigned" not in names


def test_sets_lists_counts(client):
    resp = client.get("/api/sets")
    assert resp.status_code == 200
    names = {s["name"]: s["count"] for s in resp.get_json()["sets"]}
    assert names["Avatar: The Last Airbender"] == 1
    assert names["Special Guests"] == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: FAIL — `/api/franchises` reads `ub_franchises` (empty), `/api/sets` is 404.

- [ ] **Step 3: Implement**

Replace `list_franchises` and add `list_sets` in `backend/app.py`:

```python
@app.get("/api/franchises")
def list_franchises():
    counts = {}
    for c in _CARDS:
        for name in c.get("franchises", []):
            counts[name] = counts.get(name, 0) + 1
    franchises = [{"name": n, "count": counts[n]} for n in sorted(counts)]
    return jsonify({"franchises": franchises})


@app.get("/api/sets")
def list_sets():
    counts = {}
    for c in _CARDS:
        for name in c.get("set_names", []):
            counts[name] = counts.get(name, 0) + 1
    sets = [{"name": n, "count": counts[n]} for n in sorted(counts)]
    return jsonify({"sets": sets})
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app.py backend/tests/conftest.py backend/tests/test_cards_api.py
git commit -m "feat(api): franchises endpoint reads franchises, add /api/sets"
```

---

### Task 6: Frontend types + API client + card displays

Update the `UbCard` type, add `getSets`, and repoint the two components that render the old field. This task has no unit tests (the repo has no frontend test harness); the deliverable is a clean `tsc`/`next build`.

**Files:**
- Modify: `src/types/types.ts:44` — replace `ub_franchises`
- Modify: `src/lib/api.ts` — add `getSets` beside `getFranchises` (~line 51)
- Modify: `src/components/ResultViews.tsx:85` — `c.ub_franchises[0]` → `c.franchises[0]`
- Modify: `src/app/card/[id]/page.tsx:108-114` — franchise chips + add set chips

**Interfaces:**
- Consumes: `/api/franchises`, `/api/sets`.
- Produces: `getSets(): Promise<{ name: string; count: number }[]>`; `UbCard.franchises` and `UbCard.set_names`.

> Note: `src/types/types.ts` is being edited concurrently by other sessions. Re-read it immediately before editing and match the current surrounding lines.

- [ ] **Step 1: Update the type**

In `src/types/types.ts`, replace:

```ts
  ub_franchises: string[];
```

with:

```ts
  set_names: string[];
  franchises: string[];
```

- [ ] **Step 2: Add the sets fetcher**

In `src/lib/api.ts`, directly after `getFranchises`:

```ts
export async function getSets(): Promise<{ name: string; count: number }[]> {
  const body = await get<{ sets: { name: string; count: number }[] }>("/sets");
  return body.sets;
}
```

- [ ] **Step 3: Repoint the list-row badge**

In `src/components/ResultViews.tsx`, change the badge (line 85) from `{c.ub_franchises[0]}` to:

```tsx
              {c.franchises[0]}
```

- [ ] **Step 4: Show franchises and set names on the card page**

In `src/app/card/[id]/page.tsx`, replace the single franchise-chip paragraph (lines 108-114) with two rows — franchises linking to `fr:`, set names linking to `set:`:

```tsx
      <p className="mb-2 flex flex-wrap gap-2 text-sm">
        {card.franchises.map((f) => (
          <Link key={f} href={`/search?q=${encodeURIComponent(`fr:"${f}"`)}`}
                className="rounded-card bg-gold/15 px-3 py-1 font-mono text-xs uppercase tracking-wide text-gold hover:bg-gold/25">
            {f}
          </Link>
        ))}
      </p>
      <p className="mb-4 flex flex-wrap gap-2 text-sm">
        {card.set_names.map((s) => (
          <Link key={s} href={`/search?q=${encodeURIComponent(`set:"${s}"`)}`}
                className="rounded-card border border-gold/25 px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink/50 hover:border-gold hover:text-gold dark:text-ink-dark/40">
            {s}
          </Link>
        ))}
      </p>
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: compiles with no type errors. If `tsc` flags any other reader of `ub_franchises`, fix it the same way (grep confirms only these two files plus the pages in Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/types/types.ts src/lib/api.ts src/components/ResultViews.tsx "src/app/card/[id]/page.tsx"
git commit -m "feat(web): type set_names + franchises, render both on card page"
```

---

### Task 7: Frontend pages — /franchises, new /sets, nav, search order

`/franchises` now lists real franchises (data unchanged, already links via `fr:`). Add a `/sets` page cloned from it that lists set names via `getSets` and links via `set:`. Add `Sets` to the nav and `set` to the sort orders.

**Files:**
- Modify: `src/app/franchises/page.tsx` — no query change needed, but confirm it links `fr:`
- Create: `src/app/sets/page.tsx`
- Modify: `src/components/Header.tsx:119` — add the `Sets` link
- Modify: `src/app/search/page.tsx:10` — add `"set"` to `ORDERS`

**Interfaces:**
- Consumes: `getSets` (Task 6).
- Produces: `/sets` route; `Sets` nav entry.

- [ ] **Step 1: Create the sets page**

`src/app/sets/page.tsx` — the franchises page with `getSets` and `set:` links:

```tsx
"use client";
import Link from "next/link";
import useSWR from "swr";
import { getSets } from "@/lib/api";

export default function SetsPage() {
  const { data: sets = [] } = useSWR("sets", getSets);

  return (
    <main className="py-6">
      <h1 className="mb-4 text-2xl font-bold">Sets</h1>
      <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {sets.map((s) => (
          <li key={s.name}>
            <Link href={`/search?q=${encodeURIComponent(`set:"${s.name}"`)}`}
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm hover:border-accent dark:border-white/10">
              <span>{s.name}</span>
              <span className="text-black/40 dark:text-white/30">{s.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `src/components/Header.tsx`, directly after the Franchises link (line 119):

```tsx
            <Link href="/sets" className="hover:text-gold">Sets</Link>
```

- [ ] **Step 3: Add the set sort order**

In `src/app/search/page.tsx` (line 10):

```ts
const ORDERS = ["name", "cmc", "rarity", "released", "franchise", "set"];
```

- [ ] **Step 4: Verify the build and routes**

Run: `npm run build`
Expected: compiles; `/sets` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/sets/page.tsx src/components/Header.tsx src/app/search/page.tsx src/app/franchises/page.tsx
git commit -m "feat(web): add /sets browse page, nav entry, and set sort order"
```

---

### Task 8: Frontend documentation copy

Update the operator help so `fr:` reads as "franchise" and `set:` is documented for names too.

**Files:**
- Modify: `src/app/about/page.tsx:41` — the `fr:fallout` help line; add a `set:` line
- Modify: `src/app/advanced/page.tsx:185,217` — Franchise field help copy (query building already emits `fr:`, unchanged)

**Interfaces:** none (copy only).

- [ ] **Step 1: Update the About syntax list**

In `src/app/about/page.tsx`, replace the `fr:fallout` list item (line 41) and add a set line:

```tsx
          <li><span className="text-gold">fr:fallout</span> — filter by franchise (Avatar, Warhammer, Fallout)</li>
          <li><span className="text-gold">set:tla</span> — filter by set code or name (e.g. set:&quot;final fantasy commander&quot;)</li>
```

- [ ] **Step 2: Clarify the Advanced page copy**

In `src/app/advanced/page.tsx`, the Franchise `ChipField` (line 217) and helper text (line 185) already build `fr:` queries — which now correctly means franchise. Update the placeholder/label only if it says "set"; confirm line 217 reads `label="Franchise"` and the placeholder names a franchise (`Fallout`). No query-building change is required. If the helper text at line 185 references sets, leave the franchise wording as-is.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/about/page.tsx src/app/advanced/page.tsx
git commit -m "docs(web): update fr:/set: operator help for the franchise split"
```

---

### Task 9: Regenerate the card snapshot and add the invariant guard

The shipped `data/ub_cards/cards.json` is stale (old schema, still contains the 30 Universes Within cards tagged `sld`). Regenerate it with the updated sync script — a live Scryfall fetch — then add a test that guards the committed snapshot's invariants.

**Files:**
- Modify: `data/ub_cards/cards.json` (regenerated, not hand-edited)
- Create: `scripts/tests/test_snapshot_invariants.py`

**Interfaces:**
- Consumes: the committed `cards.json` and `set_map.json`.
- Produces: a regression guard asserting the snapshot's structural contract.

- [ ] **Step 1: Regenerate the snapshot**

Run the sync (hits `api.scryfall.com`; ~30s, paced). This drops `slx` (no longer `is:ub`) and stamps the new fields:

```bash
cd scripts && python sync_ub_cards.py
```

Expected stdout: `Wrote <N> cards to .../data/ub_cards/cards.json`, where `<N>` is ~3061 (the exact count reflects live Scryfall and may differ slightly if Wizards has released cards since planning).

- [ ] **Step 2: Write the invariant guard**

```python
# scripts/tests/test_snapshot_invariants.py
"""Structural guards on the committed card snapshot. These catch a stale or
mis-synced cards.json — wrong schema, a leaked Universes Within card, or a set
that nobody mapped to a franchise."""
import json
import os

from franchise_map import load_maps, DEFAULT_DATA_DIR

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SNAPSHOT = os.path.join(_ROOT, "data", "ub_cards", "cards.json")


def _cards():
    with open(_SNAPSHOT, encoding="utf-8") as f:
        return json.load(f)


def test_every_card_has_new_fields_and_not_the_old_one():
    for c in _cards():
        assert "set_names" in c and "franchises" in c
        assert "ub_franchises" not in c
        assert c["franchises"], f"empty franchises: {c['name']}"


def test_no_universes_within_prints_remain():
    for c in _cards():
        assert all(p["set"] != "slx" for p in c["prints"])


def test_set_map_is_total_over_the_snapshot():
    set_map, _ = load_maps(DEFAULT_DATA_DIR)
    seen = set()
    for c in _cards():
        seen.update(c["set_names"])
    missing = sorted(seen - set(set_map))
    assert not missing, f"set names absent from set_map.json: {missing}"


def test_no_card_is_unassigned():
    stray = [c["name"] for c in _cards() if c["franchises"] == ["Unassigned"]]
    assert not stray, f"cards resolved to Unassigned: {stray}"
```

- [ ] **Step 3: Run the guard**

Run: `cd scripts && python -m pytest tests/test_snapshot_invariants.py -v`
Expected: PASS. If `test_set_map_is_total_over_the_snapshot` fails, Scryfall introduced a new set — add it to `set_map.json` deliberately (this is the fail-loud guard working). If `test_no_card_is_unassigned` fails, a new mixed-set-only card appeared — add an override entry.

- [ ] **Step 4: Run the entire suite**

Run: `cd backend && python -m pytest && cd ../scripts && python -m pytest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add data/ub_cards/cards.json scripts/tests/test_snapshot_invariants.py
git commit -m "chore(data): regenerate snapshot with set_names/franchises, drop Universes Within"
```

---

## Self-Review

**Spec coverage:**
- Data model (`set_names` + `franchises`, `ub_franchises` removed) → Tasks 2, 5, 6.
- `set_map.json` / `card_overrides.json` structure, override additive, `{name, franchise}` shape → Task 1.
- Fail-loud totality → Task 1 (`resolve_franchises` raises) + Task 9 (`test_set_map_is_total`).
- Universes Within exclusion + re-sync requirement → Task 2 (code) + Task 9 (regenerate + guard).
- Search: `fr:` repointed, `set:` widened, pipe-OR, `order=franchise`/`order=set` → Task 3.
- Reskin suggester repoint + double-count fix + skip Unassigned → Task 4.
- API `/api/franchises` (21 rows, no Unassigned) + new `/api/sets` → Task 5.
- Frontend `/franchises`, new `/sets`, nav, card page both dimensions, `ResultViews` narrowing, types/api → Tasks 6, 7.
- Docs copy (about, advanced) → Task 8.
- Migration = regenerate, not hand-edit → Task 9.

**Deviation from spec (flag to user):** the spec's Testing section says a test asserts the snapshot "contains 3061 cards." Task 9's guard asserts the structural invariants (no `slx`, new fields present, set_map totality, zero Unassigned) instead of a hardcoded count, because the count reflects live Scryfall at re-sync time and a literal `== 3061` would rot the moment Wizards releases a card. The invariants are the durable guarantees; the count is reported by the sync for information.

**Placeholder scan:** none — every code step shows complete content.

**Type consistency:** `resolve_franchises(set_names, oracle_id, set_map, overrides)` signature is identical in Task 1's definition, Task 2's call, and Task 9's import. `getSets` / `franchises` / `set_names` names match across Tasks 5-7. Override entries are `{name, franchise}` in the data file (Task 1 tests) and read as `entry["franchise"]` consistently.
