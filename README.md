# UBDB

A browsable database of Magic: The Gathering *Universes Beyond* cards. On top of the card data it collects community "reskins": proposals that re-theme a UB card back into its original franchise, or into a different one. Card data comes from Scryfall. The reskins and admin accounts live in MongoDB.

Stack:

- Frontend is Next.js 14 (App Router), TypeScript, and Tailwind.
- Backend is a small Flask API. It serves a read-only Scryfall snapshot and talks to Mongo for reskins, users, and sessions.
- The card data is about 3,000 UB cards synced from Scryfall into `data/ub_cards/cards.json`.

## Layout

```
src/            Next.js frontend (app router, components, lib)
backend/        Flask API (app.py, search.py, db.py, auth.py, tests)
scripts/        sync_ub_cards.py, which pulls UB cards from Scryfall
data/           ub_cards/cards.json (snapshot) + reskins/reskins.json
docs/           env-vars.md, the full env reference
```

## Quick start

### 1. Card data

The card snapshot is already committed under `data/ub_cards/cards.json`, so you can skip this step unless you want fresh data. To refresh it from Scryfall (no API key needed):

```bash
pip install -r scripts/requirements.txt
python scripts/sync_ub_cards.py        # rewrites data/ub_cards/cards.json
```

### 2. Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
flask --app app run            # serves http://127.0.0.1:5000
```

Card browsing works with no database at all, since it reads straight from the JSON snapshot. The reskin and admin endpoints need MongoDB and return a `503` when it is unreachable. Set `UBDB_MONGO_URI`, and bootstrap an admin with `UBDB_ADMIN_USER` and `UBDB_ADMIN_PASS`.

### 3. Frontend (Next.js)

```bash
npm install
npm run dev                    # serves http://localhost:3000
```

Point it at the backend with `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:5000/api`).

## Configuration

Every environment variable is documented in [`docs/env-vars.md`](docs/env-vars.md). The ones you actually need:

| Var | Where | Purpose |
| --- | --- | --- |
| `UBDB_MONGO_URI` | backend | Mongo connection (reskins, users, sessions) |
| `UBDB_ADMIN_USER` / `UBDB_ADMIN_PASS` | backend | Bootstrap admin on startup |
| `UB_CARDS_JSON` | backend | Path to the card snapshot |
| `NEXT_PUBLIC_API_URL` | frontend | Backend API base URL |

## API

Everything lives under `/api`. Card reads are public. Anyone can submit a reskin without logging in, but approving one is admin-only and needs a Bearer session token.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/cards`, `/api/cards/<oracle_id>` | List / fetch cards |
| GET | `/api/search` | Query cards |
| GET / POST | `/api/cards/<oracle_id>/reskins` | List / submit reskins for a card |
| POST | `/api/auth/login`, `/api/auth/logout` | Admin session auth |
| GET | `/api/auth/me` | Current session |
| GET / POST | `/api/admin/reskins/pending`, `/api/admin/reskins/<rid>/approve`\|`/reject` | Moderation |
| POST | `/api/resolve` | Resolve a decklist to cards |
| GET | `/api/franchises` | Franchise list |
| GET | `/api/random` | Random card |

## Tests

```bash
cd backend && pytest      # uses in-memory mongomock (UBDB_MONGO_MOCK)
```

## Credits

Card data is © [Scryfall](https://scryfall.com/) and Wizards of the Coast. This is a personal, non-commercial fan project.
