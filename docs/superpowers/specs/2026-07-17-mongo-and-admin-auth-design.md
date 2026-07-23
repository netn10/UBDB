# Design: Mongo persistence + admin login

Date: 2026-07-17
Status: Approved

## Goal

Move mutable data (reskins, users) into MongoDB and replace the shared-token /
localhost admin gate with real username+password admin login backed by
server-side sessions. Cards stay as the read-only Scryfall JSON snapshot.

## Decisions (locked)

- **Mongo scope:** reskins + users only. Cards remain the git-synced JSON
  snapshot served from memory.
- **Auth:** server-side sessions. Opaque session token transported in the
  `Authorization: Bearer <token>` header (not a cookie) — revocable, avoids
  cross-origin cookie config between Next and Flask.
- **Admin bootstrap:** env `UBDB_ADMIN_USER` / `UBDB_ADMIN_PASS` upserted on
  startup if that username has no user doc. Idempotent.
- **DB dependency:** hard. Reskin + admin endpoints return `503` when Mongo is
  unreachable. Card browsing (JSON) is unaffected.
- **Seed data:** existing `data/reskins/reskins.json` is dropped. Mongo starts
  empty.
- **Login scope:** admins only. No public signup; submitters stay anonymous
  (free-text `designer_name`).

## Architecture

### Mongo layer — `backend/db.py`
- Lazy `MongoClient` from `UBDB_MONGO_URI` (default `mongodb://localhost:27017`).
- Database name from `UBDB_MONGO_DB` (default `ubdb`).
- `ping()` helper; `get_db()` accessor.
- On first connect, ensure indexes:
  - `reskins`: `oracle_id`, `approved`
  - `users`: unique `username`
  - `sessions`: `expires_at` TTL index (auto-expire), `user_id`

### Collections

`reskins` — same fields as the current JSON record:
`_id` (string), `oracle_id`, `face`, `designer_name`, `reskin_name`,
`image_url`, `art_credit`, `art_source`, `style`, `tags[]`, `is_recommended`,
plus `approved: bool` and `created_at`. Public submissions land
`approved: false`.

`users` — `_id`, `username` (unique), `password_hash`
(werkzeug `generate_password_hash`), `role: "admin"`, `created_at`.

`sessions` — `_id` = opaque token (`secrets.token_urlsafe(32)`), `user_id`,
`created_at`, `expires_at`. TTL index expires stale sessions; `logout` deletes
for immediate revocation.

### Auth endpoints
- `POST /api/auth/login` `{username, password}` → verify hash → insert session
  → `{token, expires_at}`. Bad creds → `401` with a generic message (no user
  enumeration).
- `POST /api/auth/logout` → delete the caller's session → `204`.
- `GET /api/auth/me` → validate token → `{username, role}` or `401`.

### Auth guard — replaces `_admin_ok()`
- Read `Authorization: Bearer <token>`.
- Look up `sessions`; missing/expired → `401`.
- Load user; `role != "admin"` → `403` (future-proofing; only admins exist now).
- No localhost bypass, no env token. Session is the only path.

### Bootstrap — on app startup
- If `UBDB_ADMIN_USER` and `UBDB_ADMIN_PASS` are set and no user with that
  username exists, insert the admin (hashed password). Idempotent — safe on
  every boot.

### Reskins refactor (backend/app.py)
Replace in-memory `_RESKINS` / JSON read+write with Mongo queries:
- `GET /api/cards/<oracle_id>/reskins` → `find({oracle_id, approved: true})`.
- `POST /api/cards/<oracle_id>/reskins` → insert `approved: false`.
- `GET /api/admin/reskins/pending` (guarded) → `find({approved: false})`.
- `POST /api/admin/reskins/<id>/approve` (guarded) → set `approved: true`.
- `POST /api/admin/reskins/<id>/reject` (guarded) → delete doc.
- **reskin counts** (drive `is:reskinned` filter + tile badges): computed via
  aggregation `match approved:true → group by oracle_id → count` on each
  card-list request. Small dataset; caching deferred (YAGNI). Note if perf
  needs it later.
- Every reskin/admin endpoint 503s if `ping()` fails.

### Frontend
- **Admin page (`src/app/admin/page.tsx`):** replace the token-paste field with
  a login form (username + password). On success, store the session token in
  `localStorage` (`ubdb.session`); render the moderation queue. Add a logout
  button. On `401`, drop back to the login form and clear the stored token.
- **`src/lib/api.ts`:** replace `X-Admin-Token` with `Authorization: Bearer`
  from the stored session token. Add `login`, `logout`, `me`. `adminPending` /
  `adminModerate` send the Bearer header.

### Dependencies / config
- Add `pymongo` (and `mongomock` as a test dep). Password hashing via
  `werkzeug.security` (already present through Flask); `secrets` is stdlib.
- New env: `UBDB_MONGO_URI`, `UBDB_MONGO_DB`, `UBDB_ADMIN_USER`,
  `UBDB_ADMIN_PASS`, `UBDB_SESSION_TTL_HOURS` (default 168 = 7 days).
- Retire: `UBDB_ADMIN_TOKEN`, `UB_RESKINS_JSON`.

## Error handling
- Mongo unreachable → `503` on reskin/admin endpoints; cards unaffected.
- Bad credentials → `401`, generic message.
- Missing/expired session → `401`.
- Authenticated non-admin → `403`.

## Testing
- Use `mongomock` so backend tests stay hermetic (no live mongod in CI).
- Update existing reskin tests to seed/read through the Mongo layer.
- New tests: login success/failure, session expiry, logout revocation, guard
  rejects missing/expired/non-admin, admin bootstrap idempotency, reskin
  submit→pending→approve→visible flow, 503 when Mongo down.

## Out of scope (YAGNI)
- Public user accounts / signup.
- Login rate limiting / lockout.
- Password reset flow.
- Cards in Mongo.
- Reskin count caching.
