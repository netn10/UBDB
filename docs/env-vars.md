# Environment variables

Copy these into a `.env` (backend) / `.env.local` (frontend) as needed.

## Backend (Flask, `backend/`)

| Var | Default | Purpose |
| --- | --- | --- |
| `UBDB_MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string (reskins + users + sessions). |
| `UBDB_MONGO_DB` | `ubdb` | Mongo database name. |
| `UBDB_ADMIN_USER` | — | Bootstrap admin username. If set with `UBDB_ADMIN_PASS` and that username has no user doc, an admin is created on startup (idempotent). |
| `UBDB_ADMIN_PASS` | — | Bootstrap admin password (hashed on insert). |
| `UBDB_SESSION_TTL_HOURS` | `168` | Session lifetime in hours (7 days). Expired sessions are rejected and auto-deleted. |
| `UB_CARDS_JSON` | `../data/ub_cards/cards.json` | Path to the read-only Scryfall card snapshot. |
| `UBDB_MONGO_MOCK` | — | **Tests only.** When set, uses an in-memory `mongomock` client (no live mongod). |

Retired: `UBDB_ADMIN_TOKEN`, `UB_RESKINS_JSON` (reskins now live in Mongo; admin auth is session-based).

## Frontend (Next.js)

| Var | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:5000/api` | Base URL of the backend API. |

## Notes

- Reskin and admin endpoints hard-depend on Mongo: they return `503` when it is unreachable. Card browsing keeps working from the JSON snapshot.
- Admin login is username/password → server-side session; the token is sent as `Authorization: Bearer <token>` and stored client-side under `localStorage["ubdb.session"]`.
