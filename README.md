# UBDB

A browsable database of Magic: The Gathering **Universes Beyond** cards, with community "reskins" — proposals that re-theme a UB card back into (or into another) franchise. Card data comes from Scryfall; reskins and admin accounts live in MongoDB.

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Backend:** Flask API serving a read-only Scryfall snapshot, with Mongo for reskins/users/sessions
- **Data:** ~3,000 UB cards synced from Scryfall into `data/ub_cards/cards.json`

## Layout

```
src/            Next.js frontend (app router, components, lib)
backend/        Flask API (app.py, search.py, db.py, auth.py, tests)
scripts/        sync_ub_cards.py — pulls UB cards from Scryfall
data/           ub_cards/cards.json (snapshot) + reskins/reskins.json
docs/           env-vars.md — full env reference
```

## Quick start

### 1. Card data

The card snapshot is committed under `data/ub_cards/cards.json`. To refresh it from Scryfall (no API key needed):

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

Card browsing works with no database (reads from the JSON snapshot). Reskin and admin endpoints require MongoDB and return `503` when it is unreachable. Set `UBDB_MONGO_URI` and bootstrap an admin with `UBDB_ADMIN_USER` / `UBDB_ADMIN_PASS`.

### 3. Frontend (Next.js)

```bash
npm install
npm run dev                    # serves http://localhost:3000
```

Point it at the backend with `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:5000/api`).

## Configuration

All environment variables are documented in [`docs/env-vars.md`](docs/env-vars.md). The essentials:

| Var | Where | Purpose |
| --- | --- | --- |
| `UBDB_MONGO_URI` | backend | Mongo connection (reskins + users + sessions) |
| `UBDB_ADMIN_USER` / `UBDB_ADMIN_PASS` | backend | Bootstrap admin on startup |
| `UB_CARDS_JSON` | backend | Path to the card snapshot |
| `NEXT_PUBLIC_API_URL` | frontend | Backend API base URL |

## API

Base path `/api`. Card reads are public; reskin submission needs no login, but approval is admin-only via a Bearer session token.

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

Card data © [Scryfall](https://scryfall.com/) / Wizards of the Coast. This is a personal, non-commercial fan project.
