# Suggest a Reskin — design

**Date:** 2026-07-18
**Status:** Approved (design), not yet planned
**Scope:** One self-contained read/matching feature. No new infrastructure.

## Problem

A visitor has a franchise character in mind (a picture + a description) and
wants to reskin an existing MTG Universes Beyond card as that character, but
doesn't know *which* of the ~3,091 UB cards fits. "Suggest a Reskin" takes the
picture + description and returns the best-fit UB cards to reskin, then hands
off to the existing reskin submission form.

## Non-goals

- No AI / LLM. Matching is a deterministic heuristic.
- No login or registration. Fully anonymous, like the existing reskin submit.
- No Google Drive / ingestion coupling. A suggested reskin is submitted through
  the existing Mongo-backed moderation form (path "A"). Drive-folder ingestion
  is a **separate future spec**; the two connect only at a data level (more
  reskins → richer suggestions), not in code.
- The picture is a self-hosted **URL** the user pastes (imgur/drive/etc.),
  exactly as the current reskin form already requires. No file upload, no
  storage, no Drive write access.

## Flow

1. Visitor opens new top-level page `/suggest`.
2. Enters a **picture URL** (optional) and a **text description** of the
   character/concept (required).
3. Frontend `POST`s to `/api/suggest`. Backend scores all UB cards and returns
   the top ~8 candidates, each with a score and a human-readable "why it fits".
4. Results page renders the candidates. It also shows the **inferred facets**
   (colors / role the heuristic read from the description) as **editable
   chips**. Editing chips re-submits with explicit facet overrides to sharpen
   ranking.
5. Visitor picks a card → navigates to the existing
   `/card/<oracle_id>/suggest` form with `image_url` and a suggested `name`
   **prefilled** via query params. No new submission plumbing.

## Match engine

Deterministic heuristic over the in-memory JSON card snapshot. No API key.

### Signals

The description is tokenized (lowercase, split on whitespace/punctuation) and
each token looked up in a hand-built lexicon that maps a token to a **signal**
with a **weight**. Each card's score is the sum of the weights of the signals
that match its attributes.

| Category | Example tokens | Card attribute scored | Weight |
| --- | --- | --- | --- |
| Color / vibe | protector, healer → W; cunning, control → U; ruthless, death → B; rage, fire → R; beast, nature → G | `colors` | 3 |
| Role | tank, guardian → Defender + high toughness; assassin → deathtouch + low cmc; leader → Legendary; swarm → token text | `keywords`, `type_line`, `toughness`, `oracle_text` | 3 |
| Literal keyword | flying, trample, lifelink, haste | `keywords` (exact) | 4 |
| Creature type | dragon, soldier, wizard, zombie | `type_line` (substring) | 2 |
| Franchise | any name in the UB franchise list | `ub_franchises` (exact) | 6 |

Weights live in the lexicon file and are tunable without touching scoring logic.

### Ranking

1. Score every card = Σ matched-signal weights.
2. Drop zero-score cards. Keep top 8.
3. Tie-break: higher `rarity`, then lower `reskin_count` (spread attention to
   un-reskinned cards).
4. Each returned card carries a `why: string[]` — one human line per fired
   signal, e.g. `"'guardian' → Defender + high toughness"`. Keeps the heuristic
   transparent, not a black box.

### Inferred facets

The color/role signals that fired are returned as `inferred_facets` alongside
the results. The UI renders them as editable chips. When the user edits them,
the frontend re-`POST`s with an explicit `facets` object that overrides the
inferred ones (a present facet becomes a hard boost; a removed one is dropped).
This lets the user nudge a weak keyword heuristic without filling a form —
staying description-driven.

## API

`POST /api/suggest`

Request:
```json
{
  "description": "a tough survivor who protects the people he loves",
  "image_url": "https://i.imgur.com/xxxx.png",
  "facets": { "colors": ["W"], "roles": ["defender"] }
}
```
`image_url` and `facets` are optional. `description` is required (400 on empty).

Response:
```json
{
  "results": [
    {
      "oracle_id": "…",
      "name": "Aang, Airbending Master",
      "score": 12,
      "why": ["'protects' → White", "'tough' → high toughness"],
      "art_uri": "https://…",
      "type_line": "Legendary Creature — Human Avatar Ally"
    }
  ],
  "inferred_facets": { "colors": ["W"], "roles": ["defender"] }
}
```

The endpoint is public (no auth), consistent with the other card-read routes.

## Components / files

```
backend/
  suggest.py            # score_cards(description, facets) -> ranked list; pure, unit-testable
  suggest_lexicon.py    # SSOT: token → (signal, weight) map. Tunable, no logic.
  app.py                # + POST /api/suggest route (thin: parse, call suggest.py, jsonify)
  tests/test_suggest.py # lexicon hits, ranking order, empty description 400,
                        #   franchise hard-boost, facet override, tie-break
src/
  app/suggest/page.tsx           # picture URL + description inputs → results
  components/SuggestResults.tsx  # candidate cards + why[] + editable facet chips
  lib/api.ts                     # + suggestCards(body) -> results
  app/card/[id]/suggest/page.tsx # read image_url + name query params, prefill form
```

### Isolation / boundaries

- `suggest_lexicon.py` — pure data. What: the word→signal map. Depends on
  nothing. Change words without touching logic.
- `suggest.py` — pure function `score_cards(description, facets, cards)`. What:
  ranking. Depends on the lexicon + card list passed in (cards injected, not
  imported, so tests pass a fixture). No Flask, no I/O.
- `app.py` route — thin adapter: validate body, load cards (existing snapshot
  accessor), call `score_cards`, jsonify. No scoring logic here.
- `SuggestResults.tsx` — presentational + chip state. What: render candidates,
  manage facet-chip edits, emit re-query. Depends on `suggestCards`.

## Error handling

- Empty/whitespace `description` → `400 {"error": "description required"}`.
- No matches (all zero score) → `200 {"results": [], "inferred_facets": {}}`;
  UI shows an empty state ("No strong match — try more descriptive words").
- Malformed `facets` → ignored (treated as absent), not an error.
- Card snapshot unavailable → `503`, same as other card routes.

## Testing

Backend (`pytest`, existing harness):
- Lexicon: a known token maps to its expected signal.
- Ranking: a description with two strong signals ranks the multi-signal card
  above single-signal cards.
- Empty description → 400.
- Franchise name in description hard-boosts that franchise's cards to the top.
- Facet override changes ranking deterministically.
- Tie-break: equal score → higher rarity first, then lower reskin_count.

Frontend: manual smoke — submit a description, see candidates + why, edit a
chip and see the list re-rank, click a card and confirm the reskin form opens
with image_url + name prefilled.

## Out of scope / future

- Google Drive folder ingestion (MPCFill-style nightly scrape) — separate spec.
  Will connect here only via a shared filename/`oracle_id` convention.
- Vision/LLM matching — could later read the picture itself; deliberately
  deferred to keep this deterministic and free.

## Deployment note

UBDB is not a git repo and the standing rule is no auto-commit. This spec is
written to disk only; versioning/deploy is the owner's call.
