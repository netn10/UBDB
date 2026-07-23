# Franchise / Set Split

**Date:** 2026-07-24
**Status:** Approved, ready for planning

## Problem

The site calls its browse dimension "Franchises", but the underlying field holds
Scryfall **set names**. `scripts/sync_ub_cards.py:154` reads:

```python
card["ub_franchises"] = sorted({p["set_name"] for p in prints if p["set_name"]})
```

So `/franchises` lists 39 rows like `Avatar: The Last Airbender Commander`,
`Final Fantasy Promos`, and `Secret Lair Drop`. Those are sets, not franchises.

The mislabel hides a missing dimension. A franchise is the underlying IP —
Avatar, Warhammer, Final Fantasy — and it does not exist anywhere in the data
model. Users cannot ask "show me every Avatar card" without naming four sets.

## Goal

Introduce franchise as a real dimension. Rename the existing dimension to what
it actually is. Both become browsable and searchable.

## Non-goals

- No change to reskins, users, sessions, or any Mongo-backed data.
- No new admin UI for editing the franchise map. It is a committed data file.
- No backfill of franchise metadata beyond what the two data files encode.

## Data model

`UbCard` drops `ub_franchises` and gains two fields:

```ts
set_names:  string[]   // ["Avatar: The Last Airbender", "Avatar: ... Promos"]
franchises: string[]   // ["Avatar: The Last Airbender"]
```

`Print.set` (3-letter code) and `Print.set_name` are unchanged. `set_names` is
the deduped union of `Print.set_name` across a card's prints — byte-identical to
what `ub_franchises` held, so it is a pure rename.

The name `set_names` is deliberate: it matches the existing `Print.set_name` key,
so there is no ambiguity about whether the values are codes or names.

Both fields are lists. A card printed in several sets has several set names, and
12 cards legitimately resolve to more than one franchise.

## Data files

Two hand-maintained files, committed to the repo:

```
data/franchises/set_map.json         set name -> franchise | null
data/franchises/card_overrides.json  oracle_id -> franchise
```

`set_map.json` is **total** over the set names present in `cards.json`. A `null`
value means the set is franchise-mixed and cannot be resolved from the set alone.

```json
{
  "Avatar: The Last Airbender":           "Avatar: The Last Airbender",
  "Avatar: The Last Airbender Commander": "Avatar: The Last Airbender",
  "Warhammer 40,000 Commander":           "Warhammer 40,000",
  "Secret Lair Drop":                     null
}
```

`card_overrides.json` assigns a franchise to individual cards, keyed by
`oracle_id`. It exists for cards printed *only* in mixed sets.

```json
{ "<oracle_id>": "Sonic the Hedgehog" }
```

## Resolution rule

```
franchises(card):
    f = { set_map[s] for s in card.set_names if set_map[s] is not None }
    if override[card.oracle_id]: f.add(override[card.oracle_id])
    return sorted(f) if f else ["Unassigned"]
```

The override **adds** rather than replaces. A Fallout card that also appeared in
a Secret Lair drop stays Fallout without needing an override entry.

`Unassigned` is a real, visible franchise value, not a hidden state. Cards land
there only when nothing resolves.

### Totality

If `cards.json` contains a set name absent from `set_map.json`, the sync script
**fails loudly** rather than defaulting. A new Universes Beyond set must be
mapped deliberately. This is enforced by a test, not only at sync time.

## Franchise list

Fourteen franchises, derived from the 39 sets. Counts are cards, and do not sum
to the 3091 total because 12 cards belong to more than one franchise.

| Franchise | Cards | Sets |
|---|--:|--:|
| Marvel | 878 | 7 |
| Final Fantasy | 431 | 4 |
| Avatar: The Last Airbender | 414 | 3 |
| Middle-earth | 394 | 6 |
| Teenage Mutant Ninja Turtles | 260 | 2 |
| Doctor Who | 189 | 1 |
| Warhammer 40,000 | 168 | 1 |
| Fallout | 154 | 1 |
| Assassin's Creed | 105 | 1 |
| Unassigned | 58 | 9 |
| Jurassic World | 20 | 1 |
| Clue | 16 | 1 |
| Transformers | 15 | 1 |
| Star Trek | 1 | 1 |

### Curation decisions

**Marvel is one franchise.** `Marvel's Spider-Man`, its Promos, and its Eternal
set fold into `Marvel` alongside `Marvel Super Heroes`. Spider-Man is Marvel;
grouping by IP owner is the definition being applied. This produces one large
878-card row, which is accepted.

**Middle-earth covers all six Tolkien sets**, including `The Hobbit` and
`The Hobbit Commander`. Naming the franchise `The Lord of the Rings` would
misfile the 12 Hobbit cards; `Middle-earth` is the umbrella that covers both.

**Clue is its own franchise.** `Ravnica: Clue Edition` is an MTG-native set, but
it is a genuine external IP crossover, which is what this database catalogs.
Consistent with Star Trek earning a franchise from a single card.

### The Unassigned bucket

Nine franchise-mixed sets map to `null`: `Secret Lair Drop`,
`Media and Collaboration Promos`, `Wizards Play Network 2025`,
`Wizards Play Network 2026`, `Spotlight Series`, `Pro Tour Promos`,
`URL/Convention Promos`, `MagicFest 2023`, `MagicFest 2025`.

Only 58 cards actually land in `Unassigned` — cards printed *exclusively* in
those sets. Most Secret Lair cards also appear in a franchise set and resolve
normally.

Those 58 are real IPs with no set of their own: Sonic (`Amy Rose`), Horizon
(`Aloy, Savior of Meridian`), God of War (`Atreus, Impulsive Son`), The Last of
Us (`Abby, Merciless Soldier`), Arcane (`Aisha of Sparks and Smoke`). The
override file is the only route by which those franchises ever appear on the
site. It ships empty and is filled in over time; until then the gap is visible
rather than silent.

## Search syntax

`fr:` / `franchise:` is **repointed** to the new `franchises` field. `set:` / `e:`
is **widened** to match either the exact 3-letter code or a substring of
`set_names`.

| Query | Before | After |
|---|---|---|
| `fr:"avatar"` | 4 set names | franchise `Avatar: The Last Airbender` |
| `fr:"promos"` | 4 promo sets | 0 results — breaks by design |
| `set:tla` | code match | code match, unchanged |
| `set:"avatar ... commander"` | unsupported | name match, new |

Pipe-separated OR is preserved on both operators: `fr:"fallout|marvel"`. The
pipe rather than comma remains necessary because `Warhammer 40,000` contains a
comma.

Sort keys: `order=franchise` reads `franchises`; `order=set` is added, reading
`set_names`.

Breaking `fr:"promos"` is accepted. Nothing on the site links to it, and there is
no deployed traffic to preserve.

## Reskin suggester

`backend/suggest.py:95` scores a card by matching the user's description against
`ub_franchises`, at `WEIGHTS["franchise"] = 6` — the heaviest signal in
`suggest_lexicon.py` (color 3, role 3, keyword 4, type 2).

The field is repointed to `franchises`. This also fixes a pre-existing scoring
bug: the loop adds the weight **once per matching set name**, so a description
mentioning "avatar" scores an Avatar card +18 across its three sets, while
"doctor who" scores +6 across its one. Franchise breadth inflates rank for
reasons unrelated to relevance, and `why` returns three near-duplicate lines.

Reading `franchises` collapses this to a flat +6 and yields one clean
`franchise: Avatar: The Last Airbender` explanation.

No weight retuning is in scope. The fix is a side effect of using the correct
field, and the relative weights stay as they are.

`Unassigned` must not be matchable — a description containing the word
"unassigned" should not score. The suggester skips that value explicitly.

## API

- `GET /api/franchises` — counts over `franchises`. Returns 14 rows.
- `GET /api/sets` — **new**. Counts over `set_names`. Returns 39 rows. This is
  the old `/api/franchises` behavior under an honest name.

Both keep the existing shape: `{"franchises": [{"name": ..., "count": ...}]}` and
`{"sets": [...]}` respectively.

## Frontend

- `/franchises` keeps its route. Now lists the 14 franchises, each linking to
  `/search?q=fr:"<name>"`.
- `/sets` is new. The current franchises page markup verbatim, listing the 39
  sets, each linking to `/search?q=set:"<name>"`.
- Header nav gains `Sets` immediately after `Franchises`.
Browsing by IP is the more common intent, so `Franchises` stays first in nav.

Every current reader of `ub_franchises`:

| File | Current | Change |
|---|---|---|
| `src/types/types.ts:44` | `ub_franchises: string[]` | replaced by `set_names` + `franchises` |
| `src/components/ResultViews.tsx:85` | `{c.ub_franchises[0]}` badge | shows `franchises[0]` |
| `src/app/card/[id]/page.tsx:109` | maps `ub_franchises` | two rows — franchises and set names |
| `src/app/search/page.tsx:10` | `ORDERS = [... "franchise"]` | adds `"set"` |
| `src/lib/api.ts` | `getFranchises` | plus `getSets` |
| `src/app/advanced/page.tsx` | operator reference | `fr:` and `set:` meanings |
| `src/app/about/page.tsx` | syntax docs | same |
| `src/components/SuggestResults.tsx:54` | help text says "franchise name" | still accurate, no change |

`ResultViews` showing `franchises[0]` is a deliberate narrowing: a card in three
Avatar sets currently renders whichever set name sorts first, which is noise. The
franchise is the stable label.

## Testing

`scripts/tests/test_normalize.py`
- Resolution rule: single set, multi-set collapsing to one franchise, multi-set
  spanning two franchises, override applied, override additive alongside a
  resolved franchise, nothing resolves and yields `["Unassigned"]`.
- **Map totality:** every set name in `cards.json` has a key in `set_map.json`.
  This is the regression guard that catches a new Scryfall set.

`backend/tests/test_search.py`
- `fr:` matches `franchises`, not `set_names`.
- `set:` matches both the 3-letter code and a set-name substring.
- Negation (`-fr:`) and pipe-OR on both operators.
- `order=franchise` and `order=set`.

`backend/tests/test_cards_api.py`
- `/api/franchises` returns 14 rows; `/api/sets` returns 39.
- Response shapes.

`backend/tests/test_suggest.py` and `test_suggest_api.py`
- A description naming a franchise scores it once, not once per set. This is the
  regression test for the double-counting bug described above.
- `why` contains a single `franchise: <name>` entry.
- A description containing "unassigned" scores no franchise points.

Existing fixtures in `backend/tests/conftest.py` and
`scripts/tests/fixtures/scryfall_card.json` are updated for the renamed field.

## Migration

There is nothing to migrate. `cards.json` is regenerated by the sync script.
Reskins, users, and sessions key off `oracle_id` and are untouched. The Mongo
schema does not change.

`ub_franchises` is removed outright rather than aliased. Keeping a field whose
meaning silently changed would be a trap for any cached or forked copy of the
data.
