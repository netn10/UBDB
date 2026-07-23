# UBDB Slice 1 — Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only Scryfall-backed backbone: sync every Universes Beyond card into git JSON, serve it from Flask, and browse/search it plus per-card pages in a Next.js frontend.

**Architecture:** A Python script pulls `is:ub` cards from the Scryfall API into `data/ub_cards/cards.json` (git-committed snapshot). A Flask backend loads that JSON into memory and exposes read endpoints (`/api/cards`, `/api/cards/<id>`, `/api/search-index`, `/api/cards/<id>/reskins`). A Next.js 14 frontend fetches the search index for client-side search and renders a card grid + detail pages, proxying Scryfall art through an `image-proxy` route. This mirrors the `custom-cube-website` technique one-to-one.

**Tech Stack:** Python 3.12 + Flask + flask-cors + requests + pytest (backend); Next.js 14 + React 18 + TypeScript + Tailwind (frontend); Scryfall REST API (no key).

## Global Constraints

- Scryfall API etiquette: set a descriptive `User-Agent: UBDB/0.1 (github.com/<user>/ubdb)` and `Accept: application/json` on every request; sleep ~100 ms between requests. (Verbatim from spec Error Handling.)
- No live per-request Scryfall calls from the frontend or backend request path — only the sync script hits Scryfall. Browse must serve the last git JSON snapshot.
- `ub_cards` is read-only and Scryfall-sourced; never hand-edit `data/ub_cards/cards.json`.
- Cross-origin images (Scryfall) MUST go through the backend/Next `image-proxy`; local `/public` paths and `data:` URIs must not.
- Card identity anchors on `oracle_id` (stable across all prints); a card in multiple UB sets is one record with a `prints[]` list. Per-printing ids live in `prints[].scryfall_id`.
- Do NOT run `git`, commit, push, or deploy — the maintainer owns git upload + Heroku deploy. The "Commit" steps below are written for the maintainer to run later; the implementer stops after the verify step of each task.

---

### Task 1: Scryfall UB sync script

**Files:**
- Create: `scripts/sync_ub_cards.py`
- Create: `scripts/requirements.txt`
- Create: `scripts/tests/test_normalize.py`
- Create: `scripts/tests/fixtures/scryfall_card.json`
- Output (generated, git-committed): `data/ub_cards/cards.json`

**Interfaces:**
- Produces: `normalize_print(raw: dict) -> dict` -> `{scryfall_id, set,
  set_name, collector_number, art_uri}`.
- Produces: `group_prints(raw_cards: list) -> list` grouping Scryfall prints by
  `oracle_id` into ub_card records with keys `oracle_id, name, oracle_text,
  mana_cost, type_line, ub_franchises, official_uw_image, art_uri, prints`.
- Produces: `data/ub_cards/cards.json` — a JSON array of those ub_card records
  (one per logical card, `unique=prints` fetched then grouped by oracle_id).

- [ ] **Step 1: Create the fixture** — two prints of the SAME logical card (same `oracle_id`, different sets) so grouping is exercised.

`scripts/tests/fixtures/scryfall_card.json`:
```json
[
  {
    "id": "print-aaaa-0000-0000-000000000001",
    "oracle_id": "oracle-1111-0000-0000-000000000001",
    "name": "Aang, Airbending Master",
    "oracle_text": "Flying\nWhenever Aang attacks, ...",
    "mana_cost": "{2}{W}{U}",
    "type_line": "Legendary Creature — Human Monk",
    "set": "tla",
    "set_name": "Avatar: The Last Airbender",
    "collector_number": "1",
    "image_uris": {
      "art_crop": "https://cards.scryfall.io/art_crop/a1.jpg",
      "normal": "https://cards.scryfall.io/normal/a1.jpg"
    }
  },
  {
    "id": "print-bbbb-0000-0000-000000000002",
    "oracle_id": "oracle-1111-0000-0000-000000000001",
    "name": "Aang, Airbending Master",
    "oracle_text": "Flying\nWhenever Aang attacks, ...",
    "mana_cost": "{2}{W}{U}",
    "type_line": "Legendary Creature — Human Monk",
    "set": "spg",
    "set_name": "Special Guests",
    "collector_number": "77",
    "image_uris": {
      "normal": "https://cards.scryfall.io/normal/a2.jpg"
    }
  }
]
```

- [ ] **Step 2: Write the failing test**

`scripts/tests/test_normalize.py`:
```python
import json
import os
from sync_ub_cards import normalize_print, group_prints

HERE = os.path.dirname(os.path.abspath(__file__))


def _prints():
    with open(os.path.join(HERE, "fixtures", "scryfall_card.json"), encoding="utf-8") as f:
        return json.load(f)


def test_normalize_print_maps_fields():
    p = normalize_print(_prints()[0])
    assert p["scryfall_id"] == "print-aaaa-0000-0000-000000000001"
    assert p["set"] == "tla"
    assert p["set_name"] == "Avatar: The Last Airbender"
    assert p["collector_number"] == "1"
    assert p["art_uri"] == "https://cards.scryfall.io/normal/a1.jpg"


def test_normalize_print_handles_missing_image_uris():
    raw = dict(_prints()[0])
    del raw["image_uris"]
    assert normalize_print(raw)["art_uri"] is None


def test_group_collapses_two_prints_into_one_card():
    cards = group_prints(_prints())
    assert len(cards) == 1
    card = cards[0]
    assert card["oracle_id"] == "oracle-1111-0000-0000-000000000001"
    assert card["name"] == "Aang, Airbending Master"
    assert card["mana_cost"] == "{2}{W}{U}"
    assert len(card["prints"]) == 2


def test_group_lists_all_franchises_sorted_unique():
    card = group_prints(_prints())[0]
    assert card["ub_franchises"] == ["Avatar: The Last Airbender", "Special Guests"]


def test_group_picks_first_available_art_as_thumb():
    card = group_prints(_prints())[0]
    assert card["art_uri"] == "https://cards.scryfall.io/normal/a1.jpg"


def test_group_defers_official_uw_image():
    assert group_prints(_prints())[0]["official_uw_image"] is None


def test_group_skips_cards_without_oracle_id():
    raw = _prints()
    del raw[0]["oracle_id"]
    del raw[1]["oracle_id"]
    assert group_prints(raw) == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts && python -m pytest tests/test_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sync_ub_cards'`.

- [ ] **Step 4: Write minimal implementation**

`scripts/requirements.txt`:
```
requests>=2.31
pytest>=8.0
```

`scripts/sync_ub_cards.py`:
```python
"""Sync all Magic: The Gathering Universes Beyond cards from Scryfall into
data/ub_cards/cards.json. No API key required.

Fetches every UB printing (unique=prints) and groups them by oracle_id so a
card reprinted across multiple UB sets becomes a single logical card with a
prints[] list.

Usage:
    python scripts/sync_ub_cards.py            # writes data/ub_cards/cards.json
    python scripts/sync_ub_cards.py -o out.json
"""
import argparse
import json
import os
import sys
import time
from typing import Optional

import requests

SEARCH_URL = "https://api.scryfall.com/cards/search"
QUERY = "is:ub game:paper"
HEADERS = {
    "User-Agent": "UBDB/0.1 (github.com/<user>/ubdb)",
    "Accept": "application/json",
}
REQUEST_DELAY_S = 0.1  # Scryfall etiquette: ~10 req/s max


def normalize_print(raw: dict) -> dict:
    """Map one Scryfall printing to a UBDB print record."""
    images = raw.get("image_uris") or {}
    return {
        "scryfall_id": raw.get("id"),
        "set": raw.get("set"),
        "set_name": raw.get("set_name"),
        "collector_number": raw.get("collector_number"),
        "art_uri": images.get("normal") or images.get("large") or images.get("png"),
    }


def group_prints(raw_cards: list) -> list:
    """Group Scryfall printings by oracle_id into ub_card records."""
    by_oracle = {}
    for raw in raw_cards:
        oid = raw.get("oracle_id")
        if not oid:
            continue  # cards without a stable oracle_id can't be anchored
        card = by_oracle.get(oid)
        if card is None:
            card = by_oracle[oid] = {
                "oracle_id": oid,
                "name": raw.get("name"),
                "oracle_text": raw.get("oracle_text", ""),
                "mana_cost": raw.get("mana_cost", ""),
                "type_line": raw.get("type_line", ""),
                # Official Universes Within reskin pairing is not a single
                # Scryfall field; detection is deferred to a later slice.
                "official_uw_image": None,
                "prints": [],
            }
        card["prints"].append(normalize_print(raw))

    result = []
    for card in by_oracle.values():
        prints = card["prints"]
        card["ub_franchises"] = sorted({p["set_name"] for p in prints if p["set_name"]})
        card["art_uri"] = next((p["art_uri"] for p in prints if p["art_uri"]), None)
        result.append(card)
    return result


def fetch_all_prints() -> list:
    """Page through every printing matching QUERY (raw Scryfall objects)."""
    raw, url, params = [], SEARCH_URL, {"q": QUERY, "unique": "prints"}
    while url:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        raw.extend(body.get("data", []))
        url = body.get("next_page")  # already a full URL
        params = None
        time.sleep(REQUEST_DELAY_S)
    return raw


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser()
    default_out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "ub_cards", "cards.json",
    )
    parser.add_argument("-o", "--out", default=default_out)
    args = parser.parse_args(argv)

    cards = group_prints(fetch_all_prints())
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(cards)} cards to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts && python -m pytest tests/test_normalize.py -v`
Expected: PASS (7 passed).

- [ ] **Step 6: Generate the real data snapshot**

Run: `cd scripts && pip install -r requirements.txt && python sync_ub_cards.py`
Expected: prints `Wrote <N> cards to .../data/ub_cards/cards.json` with N logical cards (fewer than the ~4283 prints, since reprints collapse).
Verify: `python -c "import json;d=json.load(open('../data/ub_cards/cards.json'));print(len(d), d[0]['name'], len(d[0]['prints']))"`

- [ ] **Step 7: Commit** (maintainer runs later)

```bash
git add scripts/ data/ub_cards/cards.json
git commit -m "feat: Scryfall UB card sync script + snapshot"
```

---

### Task 2: Flask backend — load + serve cards

**Files:**
- Create: `backend/app.py`
- Create: `backend/requirements.txt`
- Create: `backend/tests/test_cards_api.py`
- Create: `backend/tests/conftest.py`

**Interfaces:**
- Consumes: `data/ub_cards/cards.json` from Task 1.
- Produces: Flask `app` object; endpoints `GET /api/cards` (returns
  `{"cards": [...], "count": N}`) and `GET /api/cards/<oracle_id>` (returns
  the card dict, or 404 `{"error": "not found"}`).
- Produces: `load_cards() -> list` and `get_card(oracle_id) -> dict | None`.

- [ ] **Step 1: Write the failing test**

`backend/tests/conftest.py`:
```python
import json
import os
import pytest

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data", "ub_cards", "cards.json")


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Seed a tiny deterministic dataset so tests don't depend on the live snapshot.
    sample = [{
        "oracle_id": "oracle-1", "name": "Aang, Airbending Master",
        "oracle_text": "Flying", "mana_cost": "{2}{W}{U}",
        "type_line": "Legendary Creature",
        "ub_franchises": ["Avatar: The Last Airbender", "Special Guests"],
        "official_uw_image": None, "art_uri": "https://x/1.jpg",
        "prints": [
            {"scryfall_id": "p1", "set": "tla", "set_name": "Avatar: The Last Airbender",
             "collector_number": "1", "art_uri": "https://x/1.jpg"},
            {"scryfall_id": "p2", "set": "spg", "set_name": "Special Guests",
             "collector_number": "77", "art_uri": "https://x/2.jpg"},
        ],
    }]
    f = tmp_path / "cards.json"
    f.write_text(json.dumps(sample), encoding="utf-8")
    monkeypatch.setenv("UB_CARDS_JSON", str(f))
    import importlib, app as app_module
    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()
```

`backend/tests/test_cards_api.py`:
```python
def test_list_cards_returns_count_and_cards(client):
    resp = client.get("/api/cards")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["count"] == 1
    assert body["cards"][0]["name"] == "Aang, Airbending Master"


def test_get_card_by_oracle_id(client):
    resp = client.get("/api/cards/oracle-1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["prints"]) == 2
    assert body["prints"][0]["set"] == "tla"


def test_get_missing_card_404(client):
    resp = client.get("/api/cards/nope")
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "not found"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3: Write minimal implementation**

`backend/requirements.txt`:
```
Flask>=3.0
flask-cors>=4.0
requests>=2.31
pytest>=8.0
```

`backend/app.py`:
```python
"""UBDB backend. Loads the Scryfall UB snapshot from git JSON and serves it.
Reads work even with no database; writes (reskins/auth) arrive in later slices.
"""
import json
import os

from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CARDS = os.path.join(_HERE, "..", "data", "ub_cards", "cards.json")


def _cards_path() -> str:
    return os.getenv("UB_CARDS_JSON", _DEFAULT_CARDS)


def load_cards() -> list:
    try:
        with open(_cards_path(), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


# Loaded once at import; the sync script + redeploy refreshes it.
_CARDS = load_cards()
_BY_ORACLE = {c["oracle_id"]: c for c in _CARDS}


def get_card(oracle_id: str):
    return _BY_ORACLE.get(oracle_id)


@app.get("/api/cards")
def list_cards():
    return jsonify({"cards": _CARDS, "count": len(_CARDS)})


@app.get("/api/cards/<oracle_id>")
def card_detail(oracle_id):
    card = get_card(oracle_id)
    if card is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(card)


if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", 5000)))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit** (maintainer runs later)

```bash
git add backend/
git commit -m "feat: Flask backend serving UB card snapshot"
```

---

### Task 3: Flask — search index + reskins stub

**Files:**
- Modify: `backend/app.py` (add two endpoints)
- Modify: `backend/tests/test_cards_api.py` (add tests)

**Interfaces:**
- Consumes: `_CARDS`, `get_card` from Task 2.
- Produces: `GET /api/search-index` -> `{"index": [{oracle_id, name,
  ub_franchises, type_line, reskin_count}]}` (lightweight; `reskin_count` is 0
  until the reskins slice lands).
- Produces: `GET /api/cards/<oracle_id>/reskins` -> `{"reskins": []}` for a
  known card, 404 for an unknown one.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_cards_api.py`)

```python
def test_search_index_is_lightweight(client):
    resp = client.get("/api/search-index")
    assert resp.status_code == 200
    entry = resp.get_json()["index"][0]
    assert set(entry.keys()) == {
        "oracle_id", "name", "ub_franchises", "type_line", "reskin_count"
    }
    assert entry["reskin_count"] == 0
    assert entry["ub_franchises"] == ["Avatar: The Last Airbender", "Special Guests"]


def test_reskins_empty_for_known_card(client):
    resp = client.get("/api/cards/oracle-1/reskins")
    assert resp.status_code == 200
    assert resp.get_json()["reskins"] == []


def test_reskins_404_for_unknown_card(client):
    resp = client.get("/api/cards/nope/reskins")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: FAIL — 404 for `/api/search-index` (route missing).

- [ ] **Step 3: Add the endpoints** (append inside `backend/app.py`, before `if __name__`)

```python
@app.get("/api/search-index")
def search_index():
    index = [{
        "oracle_id": c["oracle_id"],
        "name": c["name"],
        "ub_franchises": c.get("ub_franchises", []),
        "type_line": c.get("type_line"),
        "reskin_count": 0,  # populated once the reskins slice lands
    } for c in _CARDS]
    return jsonify({"index": index})


@app.get("/api/cards/<oracle_id>/reskins")
def card_reskins(oracle_id):
    if get_card(oracle_id) is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"reskins": []})
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_cards_api.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit** (maintainer runs later)

```bash
git add backend/
git commit -m "feat: search-index + reskins endpoints"
```

---

### Task 4: Next.js scaffold + api client + image-proxy

**Files:**
- Create: `package.json`, `next.config.js`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.js`
- Create: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/lib/api.ts`
- Create: `src/types/types.ts`
- Create: `src/app/api/image-proxy/route.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 2–3.
- Produces (in `src/lib/api.ts`): `API_BASE_URL`, `getImageSrc(url)`,
  `getSearchIndex(): Promise<SearchEntry[]>`, `getCard(id): Promise<UbCard>`,
  `getReskins(id): Promise<Reskin[]>`.
- Produces (in `src/types/types.ts`): `UbCard`, `SearchEntry`, `Reskin` types.

- [ ] **Step 1: Scaffold config files**

`package.json`:
```json
{
  "name": "ubdb",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
```

`next.config.js`:
```js
/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true };
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2017", "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true, "skipLibCheck": true, "strict": true,
    "noEmit": true, "esModuleInterop": true, "module": "esnext",
    "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`postcss.config.js`:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 2: Types + layout + styles**

`src/types/types.ts`:
```ts
export interface Print {
  scryfall_id: string;
  set: string;
  set_name: string;
  collector_number: string;
  art_uri: string | null;
}

export interface UbCard {
  oracle_id: string;
  name: string;
  oracle_text: string;
  mana_cost: string;
  type_line: string;
  ub_franchises: string[];
  official_uw_image: string | null;
  art_uri: string | null;
  prints: Print[];
}

export interface SearchEntry {
  oracle_id: string;
  name: string;
  ub_franchises: string[];
  type_line: string | null;
  reskin_count: number;
}

export interface Reskin {
  _id: string;
  oracle_id: string;
  designer_name: string;
  reskin_name: string;
  image_url: string;
  art_credit: string;
  style: string;
  is_recommended: boolean;
}
```

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/app/layout.tsx`:
```tsx
import "./globals.css";

export const metadata = { title: "UBDB", description: "Universes Beyond reskin database" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: API client**

`src/lib/api.ts`:
```ts
import { UbCard, SearchEntry, Reskin } from "@/types/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5000/api";

// Cross-origin (Scryfall) images go through the CORS proxy; local/data URIs don't.
export function getImageSrc(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export async function getSearchIndex(): Promise<SearchEntry[]> {
  const body = await get<{ index: SearchEntry[] }>("/search-index");
  return body.index;
}

export async function getCard(id: string): Promise<UbCard> {
  return get<UbCard>(`/cards/${id}`);
}

export async function getReskins(id: string): Promise<Reskin[]> {
  const body = await get<{ reskins: Reskin[] }>(`/cards/${id}/reskins`);
  return body.reskins;
}
```

- [ ] **Step 4: image-proxy route** (mirrors cube's proven route)

`src/app/api/image-proxy/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="265" height="370"><rect width="265" height="370" fill="#222"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#888">No image</text></svg>`;

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");
  if (!imageUrl) return new NextResponse("No URL provided", { status: 400 });
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "UBDB/0.1 (github.com/<user>/ubdb)",
        Accept: "image/*,*/*;q=0.8",
        Referer: "https://scryfall.com/",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return new NextResponse(PLACEHOLDER, {
        status: 200,
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
      });
    }
    const buf = await response.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(PLACEHOLDER, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml" },
    });
  }
}
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npm install && npm run build`
Expected: build completes with no TypeScript errors. (No page routes yet, so it builds the layout + api route only.)

- [ ] **Step 6: Commit** (maintainer runs later)

```bash
git add package.json next.config.js tsconfig.json postcss.config.js tailwind.config.js src/
git commit -m "feat: Next.js scaffold, api client, image-proxy"
```

---

### Task 5: Browse / search page

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/components/CardGrid.tsx`

**Interfaces:**
- Consumes: `getSearchIndex`, `getImageSrc` from Task 4; `SearchEntry` type.
- Produces: the `/` route — a searchable grid linking each card to `/card/<id>`.

- [ ] **Step 1: CardGrid component**

`src/components/CardGrid.tsx`:
```tsx
import Link from "next/link";
import { SearchEntry } from "@/types/types";

export default function CardGrid({ cards }: { cards: SearchEntry[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Link
          key={c.oracle_id}
          href={`/card/${c.oracle_id}`}
          className="block rounded-lg border border-neutral-800 p-3 hover:border-neutral-500"
        >
          <div className="font-medium text-sm">{c.name}</div>
          <div className="text-xs text-neutral-400">{c.ub_franchises.join(" · ")}</div>
          <div className="text-xs mt-1 text-neutral-500">
            {c.reskin_count > 0 ? `${c.reskin_count} reskin(s)` : "No reskin yet"}
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Search page (client component)**

`src/app/page.tsx`:
```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { getSearchIndex } from "@/lib/api";
import { SearchEntry } from "@/types/types";
import CardGrid from "@/components/CardGrid";

export default function Home() {
  const [all, setAll] = useState<SearchEntry[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSearchIndex().then(setAll).catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 200);
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.ub_franchises.join(" ").toLowerCase().includes(needle) ||
        (c.type_line ?? "").toLowerCase().includes(needle)
    );
  }, [q, all]);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">UBDB — Universes Beyond reskins</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by UB name, franchise, or type…"
        className="w-full mb-6 px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-700"
      />
      {error && <p className="text-red-400">Failed to load: {error}</p>}
      <p className="text-sm text-neutral-500 mb-3">{filtered.length} shown</p>
      <CardGrid cards={filtered} />
    </main>
  );
}
```

- [ ] **Step 3: Verify end-to-end**

Run (terminal A): `cd backend && python app.py`
Run (terminal B): `npm run dev`
Verify: open `http://localhost:3000`, confirm cards render, typing "avatar" filters the grid, and each tile links to `/card/<id>` (page 404s until Task 6 — expected).
Also run: `npm run build` → no TS errors.

- [ ] **Step 4: Commit** (maintainer runs later)

```bash
git add src/app/page.tsx src/components/CardGrid.tsx
git commit -m "feat: browse + search page"
```

---

### Task 6: Card detail page

**Files:**
- Create: `src/app/card/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCard`, `getReskins`, `getImageSrc` from Task 4; `UbCard`,
  `Reskin` types.
- Produces: the `/card/<id>` route — UB card info + its approved reskins
  (recommended first), or a "Suggest a design" placeholder when none exist.

- [ ] **Step 1: Card detail page (client component)**

`src/app/card/[id]/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { getCard, getReskins, getImageSrc } from "@/lib/api";
import { UbCard, Reskin } from "@/types/types";

export default function CardPage({ params }: { params: { id: string } }) {
  const [card, setCard] = useState<UbCard | null>(null);
  const [reskins, setReskins] = useState<Reskin[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getCard(params.id).then(setCard).catch(() => setNotFound(true));
    getReskins(params.id).then(setReskins).catch(() => setReskins([]));
  }, [params.id]);

  if (notFound) return <main className="p-6">Card not found.</main>;
  if (!card) return <main className="p-6">Loading…</main>;

  // Recommended reskins first.
  const ordered = [...reskins].sort(
    (a, b) => Number(b.is_recommended) - Number(a.is_recommended)
  );

  return (
    <main className="max-w-4xl mx-auto p-6">
      <a href="/" className="text-sm text-neutral-400 hover:underline">← Back</a>
      <h1 className="text-2xl font-bold mt-2">{card.name}</h1>
      <p className="text-neutral-400">{card.ub_franchises.join(" · ")} · {card.type_line}</p>

      <div className="flex flex-wrap gap-6 mt-4">
        <div>
          {card.art_uri && (
            <img
              src={getImageSrc(card.art_uri)}
              alt={card.name}
              className="w-64 rounded-xl border border-neutral-800"
            />
          )}
          <p className="text-xs text-neutral-500 mt-1">Printed in (UB originals):</p>
          <ul className="text-xs text-neutral-500">
            {card.prints.map((p) => (
              <li key={p.scryfall_id}>{p.set_name} #{p.collector_number}</li>
            ))}
          </ul>
        </div>
        <div className="max-w-md">
          <p className="whitespace-pre-line">{card.oracle_text}</p>
          <p className="text-sm text-neutral-500 mt-2">{card.mana_cost}</p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-8 mb-3">Universes Within reskins</h2>
      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 p-6 text-center">
          <p className="text-neutral-400 mb-2">No reskin yet.</p>
          <button
            disabled
            title="Submitting arrives in a later slice"
            className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-500 cursor-not-allowed"
          >
            Suggest a design
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ordered.map((r) => (
            <div key={r._id} className="rounded-lg border border-neutral-800 p-2">
              <img src={getImageSrc(r.image_url)} alt={r.reskin_name} className="w-full rounded" />
              <div className="text-sm mt-1">
                {r.reskin_name}
                {r.is_recommended && (
                  <span className="ml-1 text-xs text-emerald-400">★ recommended</span>
                )}
              </div>
              <div className="text-xs text-neutral-500">
                by {r.designer_name} · art: {r.art_credit}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify end-to-end**

Run backend + `npm run dev` (as in Task 5).
Verify: click a card from `/` → detail page shows name, franchise, art (proxied), oracle text, and the "No reskin yet / Suggest a design" placeholder (button disabled).
Also run: `npm run build` → no TS errors.

- [ ] **Step 3: Commit** (maintainer runs later)

```bash
git add src/app/card/
git commit -m "feat: card detail page with reskin section"
```

---

## Self-Review

**Spec coverage (Slice 1 items only):**
- Scryfall sync → git JSON: Task 1 ✔
- In-memory serving / reads survive without DB: Task 2 (`load_cards`, no DB dependency) ✔
- Browse/search over prebuilt index: Tasks 3 + 5 ✔
- Card page = one ub_card + its reskins, recommended first, "Suggest a design" when none: Task 6 ✔
- image-proxy for Scryfall art: Task 4 ✔
- Error handling — Scryfall etiquette (UA + throttle): Task 1; browse serves snapshot not live Scryfall: Tasks 2–5 ✔; image-proxy placeholder on failure: Task 4 ✔
- Deferred correctly (not in this slice): reskin writes, auth, moderation, export, official UW pairing, franchise mapping refinement.

**Placeholder scan:** No TBD/TODO left in steps; every code step shows full code. The `<user>` token in the User-Agent string is a real value the maintainer fills with their GitHub handle at deploy — flagged, not a code stub.

**Type consistency:** `SearchEntry` keys match the backend `/api/search-index` payload exactly (`oracle_id, name, ub_franchises, type_line, reskin_count`). `UbCard`/`Print` match `group_prints` output + backend passthrough. All routes and lookups key on `oracle_id` (card identity), while individual printings carry `scryfall_id` inside `prints[]`. `Reskin` fields consumed in Task 6 are a strict subset of the spec's `reskins` schema (write path lands in a later slice).
