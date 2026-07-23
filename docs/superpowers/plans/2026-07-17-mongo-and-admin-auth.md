# Mongo Persistence + Admin Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move reskins and users into MongoDB and replace the shared-token/localhost admin gate with real username+password admin login backed by revocable server-side sessions.

**Architecture:** A thin `db.py` owns the Mongo client (with a `mongomock` hook for hermetic tests). `auth.py` owns password hashing, admin bootstrap, sessions, and the request guard. `app.py` keeps serving cards from the JSON snapshot but reads/writes reskins through Mongo and mounts the auth endpoints. Session tokens travel in the `Authorization: Bearer` header. Cards stay JSON.

**Tech Stack:** Flask, pymongo, mongomock (tests), werkzeug password hashing, Next.js/React frontend.

## Global Constraints

- Python: Flask backend under `backend/`, run with pytest from `backend/`.
- Cards remain the read-only JSON snapshot (`data/ub_cards/cards.json`); do NOT move cards to Mongo.
- Reskin + admin endpoints are a HARD Mongo dependency → `503` when Mongo is unreachable. Card browsing must keep working when Mongo is down.
- Session token transport is `Authorization: Bearer <token>` — no cookies.
- Admins only; no public signup. Bad credentials return `401` with a generic message (no user enumeration).
- No commits are auto-pushed; commit locally only. Do NOT mention AI/Claude in commit messages.
- New env vars: `UBDB_MONGO_URI` (default `mongodb://localhost:27017`), `UBDB_MONGO_DB` (default `ubdb`), `UBDB_ADMIN_USER`, `UBDB_ADMIN_PASS`, `UBDB_SESSION_TTL_HOURS` (default `168`), `UBDB_MONGO_MOCK` (tests only).
- Retire: `UBDB_ADMIN_TOKEN`, `UB_RESKINS_JSON`.

---

## File Structure

- Create `backend/db.py` — Mongo client, `get_db()`, `ping()`, `ensure_indexes()`, `reset_client()`, mongomock hook.
- Create `backend/auth.py` — hashing, `bootstrap_admin()`, `verify_credentials()`, `create_session()`, `user_for_token()`, `delete_session()`, `authenticate()`, `bearer_token()`.
- Modify `backend/app.py` — reskin endpoints → Mongo; mount `/api/auth/*`; `mongo_guarded` decorator; startup bootstrap + counts.
- Modify `backend/requirements.txt` and `scripts/requirements.txt` — add `pymongo`, `mongomock`.
- Modify `backend/tests/conftest.py` — enable `UBDB_MONGO_MOCK`, reset client on reload.
- Modify `backend/tests/test_cards_api.py` — reskin tests seed through Mongo.
- Create `backend/tests/test_auth.py` — login/session/guard/bootstrap tests.
- Modify `src/lib/api.ts` — `login`/`logout`/`me`, Bearer header.
- Modify `src/app/admin/page.tsx` — login form + logout.
- Modify `.env.example` (create if absent) — document new env vars.
- Delete `data/reskins/reskins.json` from the live read path (Task 4 stops reading it; file may be left on disk or removed).

---

### Task 1: Mongo layer (`backend/db.py`)

**Files:**
- Create: `backend/db.py`
- Modify: `backend/requirements.txt`, `scripts/requirements.txt`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces:
  - `get_client()` → a `MongoClient` (real or mongomock)
  - `get_db()` → the `ubdb` Database
  - `ping() -> bool` — True if reachable
  - `ensure_indexes() -> None`
  - `reset_client() -> None` — drops the cached client (tests)

- [ ] **Step 1: Add dependencies**

Add to `backend/requirements.txt`:
```
pymongo>=4.6
mongomock>=4.1
```
Also add the same two lines to `scripts/requirements.txt`. Then install:
```bash
cd backend && python -m pip install -r requirements.txt
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_db.py`:
```python
import importlib


def test_mock_client_pings_and_indexes(monkeypatch):
    monkeypatch.setenv("UBDB_MONGO_MOCK", "1")
    monkeypatch.setenv("UBDB_MONGO_DB", "ubdb_test")
    import db
    importlib.reload(db)
    db.reset_client()
    assert db.ping() is True
    db.ensure_indexes()  # must not raise
    dbh = db.get_db()
    dbh.users.insert_one({"_id": "u1", "username": "a"})
    assert dbh.users.find_one({"_id": "u1"})["username"] == "a"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'db'`.

- [ ] **Step 4: Implement `backend/db.py`**

```python
"""Mongo access layer. Cards stay in JSON; this backs reskins, users, sessions.
A mongomock hook (UBDB_MONGO_MOCK) keeps tests hermetic with no live mongod."""
import os

_client = None


def get_client():
    global _client
    if _client is None:
        if os.getenv("UBDB_MONGO_MOCK"):
            import mongomock
            _client = mongomock.MongoClient()
        else:
            from pymongo import MongoClient
            _client = MongoClient(
                os.getenv("UBDB_MONGO_URI", "mongodb://localhost:27017"),
                serverSelectionTimeoutMS=2000,
            )
    return _client


def get_db():
    return get_client()[os.getenv("UBDB_MONGO_DB", "ubdb")]


def ping() -> bool:
    if os.getenv("UBDB_MONGO_MOCK"):
        return True
    try:
        get_client().admin.command("ping")
        return True
    except Exception:
        return False


def ensure_indexes() -> None:
    dbh = get_db()
    dbh.reskins.create_index("oracle_id")
    dbh.reskins.create_index("approved")
    dbh.users.create_index("username", unique=True)
    dbh.sessions.create_index("user_id")
    # Real Mongo auto-expires via TTL; the auth guard also checks expiry
    # explicitly so mongomock (no TTL enforcement) behaves the same.
    dbh.sessions.create_index("expires_at", expireAfterSeconds=0)


def reset_client() -> None:
    global _client
    _client = None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_db.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/db.py backend/tests/test_db.py backend/requirements.txt scripts/requirements.txt
git commit -m "feat(backend): add Mongo access layer with mongomock test hook"
```

---

### Task 2: Users, hashing, admin bootstrap (`backend/auth.py` part 1)

**Files:**
- Create: `backend/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `db.get_db` (Task 1)
- Produces:
  - `bootstrap_admin() -> None` — idempotent; upserts admin from env
  - `verify_credentials(username, password) -> dict | None` — user doc or None

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth.py`:
```python
import importlib
import pytest


@pytest.fixture
def auth_mod(monkeypatch):
    monkeypatch.setenv("UBDB_MONGO_MOCK", "1")
    monkeypatch.setenv("UBDB_MONGO_DB", "ubdb_test")
    import db
    importlib.reload(db)
    db.reset_client()
    import auth
    importlib.reload(auth)
    return auth


def test_bootstrap_creates_admin_once(auth_mod, monkeypatch):
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    auth_mod.bootstrap_admin()
    auth_mod.bootstrap_admin()  # idempotent
    import db
    assert db.get_db().users.count_documents({"username": "root"}) == 1


def test_verify_credentials(auth_mod, monkeypatch):
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    auth_mod.bootstrap_admin()
    assert auth_mod.verify_credentials("root", "s3cret")["role"] == "admin"
    assert auth_mod.verify_credentials("root", "wrong") is None
    assert auth_mod.verify_credentials("ghost", "s3cret") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'auth'`.

- [ ] **Step 3: Implement `backend/auth.py` (users portion)**

```python
"""Admin auth: password hashing, env bootstrap, sessions, request guard.
Admins only for now — no public signup."""
import os
import secrets
from datetime import datetime, timedelta, timezone

from flask import request
from werkzeug.security import generate_password_hash, check_password_hash

import db


def _now():
    return datetime.now(timezone.utc)


def bootstrap_admin() -> None:
    """If UBDB_ADMIN_USER/PASS are set and that username has no user doc,
    insert it as an admin. Idempotent — safe on every boot."""
    username = os.getenv("UBDB_ADMIN_USER")
    password = os.getenv("UBDB_ADMIN_PASS")
    if not username or not password:
        return
    users = db.get_db().users
    if users.find_one({"username": username}):
        return
    users.insert_one({
        "_id": secrets.token_hex(12),
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": "admin",
        "created_at": _now(),
    })


def verify_credentials(username: str, password: str):
    user = db.get_db().users.find_one({"username": username})
    if not user or not check_password_hash(user["password_hash"], password):
        return None
    return user
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add backend/auth.py backend/tests/test_auth.py
git commit -m "feat(backend): admin bootstrap and credential verification"
```

---

### Task 3: Sessions + request guard (`backend/auth.py` part 2)

**Files:**
- Modify: `backend/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `_now`, `db.get_db` (Task 2)
- Produces:
  - `create_session(user) -> dict` → `{"token": str, "expires_at": datetime}`
  - `user_for_token(token) -> dict | None` (deletes + rejects expired)
  - `delete_session(token) -> None`
  - `bearer_token() -> str | None` — parses the `Authorization` header
  - `authenticate() -> tuple[dict | None, int | None]` → `(user, None)` on success, `(None, 401)` missing/expired, `(None, 403)` non-admin

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_auth.py`:
```python
def test_session_roundtrip_and_logout(auth_mod, monkeypatch):
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    auth_mod.bootstrap_admin()
    user = auth_mod.verify_credentials("root", "s3cret")
    sess = auth_mod.create_session(user)
    assert auth_mod.user_for_token(sess["token"])["username"] == "root"
    auth_mod.delete_session(sess["token"])
    assert auth_mod.user_for_token(sess["token"]) is None


def test_expired_session_rejected(auth_mod, monkeypatch):
    monkeypatch.setenv("UBDB_SESSION_TTL_HOURS", "-1")  # already expired
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    auth_mod.bootstrap_admin()
    user = auth_mod.verify_credentials("root", "s3cret")
    sess = auth_mod.create_session(user)
    assert auth_mod.user_for_token(sess["token"]) is None


def test_bearer_token_parsing(auth_mod):
    app = _bare_app(auth_mod)
    with app.test_request_context(headers={"Authorization": "Bearer abc123"}):
        assert auth_mod.bearer_token() == "abc123"
    with app.test_request_context(headers={"Authorization": "Token abc"}):
        assert auth_mod.bearer_token() is None
    with app.test_request_context():
        assert auth_mod.bearer_token() is None


def _bare_app(auth_mod):
    from flask import Flask
    return Flask(__name__)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py -k "session or bearer" -v`
Expected: FAIL with `AttributeError: module 'auth' has no attribute 'create_session'`.

- [ ] **Step 3: Implement the sessions + guard portion**

Append to `backend/auth.py`:
```python
def create_session(user) -> dict:
    token = secrets.token_urlsafe(32)
    ttl = int(os.getenv("UBDB_SESSION_TTL_HOURS", "168"))
    expires = _now() + timedelta(hours=ttl)
    db.get_db().sessions.insert_one({
        "_id": token,
        "user_id": user["_id"],
        "created_at": _now(),
        "expires_at": expires,
    })
    return {"token": token, "expires_at": expires}


def user_for_token(token):
    if not token:
        return None
    sessions = db.get_db().sessions
    sess = sessions.find_one({"_id": token})
    if not sess:
        return None
    expires = sess["expires_at"]
    if expires.tzinfo is None:  # pymongo returns naive UTC
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < _now():
        sessions.delete_one({"_id": token})
        return None
    return db.get_db().users.find_one({"_id": sess["user_id"]})


def delete_session(token) -> None:
    if token:
        db.get_db().sessions.delete_one({"_id": token})


def bearer_token():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def authenticate():
    """(user, None) if a valid admin session; (None, 401) if missing/expired;
    (None, 403) if authenticated but not an admin."""
    user = user_for_token(bearer_token())
    if user is None:
        return None, 401
    if user.get("role") != "admin":
        return None, 403
    return user, None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: PASS (all auth tests).

- [ ] **Step 5: Commit**

```bash
git add backend/auth.py backend/tests/test_auth.py
git commit -m "feat(backend): revocable sessions and admin request guard"
```

---

### Task 4: Wire reskins + auth endpoints into `app.py`

**Files:**
- Modify: `backend/app.py`
- Test: `backend/tests/test_cards_api.py` (updated in Task 5)

**Interfaces:**
- Consumes: `db` (Task 1), `auth` (Tasks 2–3)
- Produces routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; reskin routes now Mongo-backed; `mongo_guarded` decorator.

- [ ] **Step 1: Replace the JSON reskin machinery with Mongo helpers**

In `backend/app.py`, update imports at the top:
```python
import json
import os
import random as _random
import secrets
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo.errors import PyMongoError

import search as search_engine
import db
import auth
```

Remove `import uuid` (replaced by `secrets`). Delete `_DEFAULT_RESKINS`, `_reskins_path`, `load_reskins`, `_RESKINS`, `_RESKINS_BY_ORACLE`, `_is_approved`, `_reindex_reskins`, `_save_reskins`, and the `_reindex_reskins()` call. Keep everything about cards (`_CARDS`, `_BY_ORACLE`, `_BY_NAME`, `load_cards`, `_cards_path`, `_load_json`).

Add, after the `_BY_NAME` block:
```python
_RESKIN_COUNTS = {}


def _reskins():
    return db.get_db().reskins


def _load_counts() -> dict:
    """Approved-reskin counts per oracle_id. Drives is:reskinned + tile badges."""
    try:
        pipeline = [
            {"$match": {"approved": True}},
            {"$group": {"_id": "$oracle_id", "n": {"$sum": 1}}},
        ]
        return {d["_id"]: d["n"] for d in _reskins().aggregate(pipeline)}
    except PyMongoError:
        return {}


def _apply_counts() -> None:
    for c in _CARDS:
        c["reskin_count"] = _RESKIN_COUNTS.get(c["oracle_id"], 0)


def _refresh_counts() -> None:
    global _RESKIN_COUNTS
    _RESKIN_COUNTS = _load_counts()
    _apply_counts()


def mongo_guarded(fn):
    """Reskin/admin routes hard-depend on Mongo — surface outages as 503."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except PyMongoError:
            return jsonify({"error": "database unavailable"}), 503
    return wrapper
```

- [ ] **Step 2: Bootstrap on startup**

Replace the old `_reindex_reskins()` call site with a startup block placed right after the `mongo_guarded` definition:
```python
try:
    db.ensure_indexes()
    auth.bootstrap_admin()
except PyMongoError:
    pass  # cards still serve from JSON; reskin/admin routes will 503
_refresh_counts()
```

- [ ] **Step 3: Refactor the reskin read/write routes**

Replace `card_reskins`, `submit_reskin`, `admin_pending`, `admin_approve`, `admin_reject`, and the reskin lookups inside `resolve_decklist`:

```python
@app.get("/api/cards/<oracle_id>/reskins")
@mongo_guarded
def card_reskins(oracle_id):
    if get_card(oracle_id) is None:
        return jsonify({"error": "not found"}), 404
    live = list(_reskins().find(
        {"oracle_id": oracle_id, "approved": True}, {"created_at": 0}))
    return jsonify({"reskins": live})
```

`submit_reskin` — keep all validation identical; only the persistence changes:
```python
    record = {
        "_id": f"rk-{secrets.token_hex(6)}",
        "oracle_id": oracle_id,
        "face": 0 if face not in (0, 1) else face,
        "designer_name": designer,
        "reskin_name": name,
        "image_url": image,
        "art_credit": (body.get("art_credit") or "").strip(),
        "art_source": art_source if art_source in _ART_SOURCES else "original",
        "style": style if style in _STYLES else "name-bottom",
        "tags": tags,
        "is_recommended": False,
        "approved": False,
        "created_at": auth._now(),
    }
    _reskins().insert_one(record)
    return jsonify({"ok": True, "id": record["_id"],
                    "status": "pending moderation"}), 201
```
Add the `@mongo_guarded` decorator directly under `@app.post("/api/cards/<oracle_id>/reskins")`.

Admin routes (guarded by session AND Mongo):
```python
def _require_admin():
    """Returns None if OK, else a (json, status) error response."""
    user, err = auth.authenticate()
    if err:
        msg = "unauthorized" if err == 401 else "forbidden"
        return jsonify({"error": msg}), err
    return None


@app.get("/api/admin/reskins/pending")
@mongo_guarded
def admin_pending():
    denied = _require_admin()
    if denied:
        return denied
    pending = list(_reskins().find({"approved": False}, {"created_at": 0}))
    return jsonify({"reskins": pending})


@app.post("/api/admin/reskins/<rid>/approve")
@mongo_guarded
def admin_approve(rid):
    denied = _require_admin()
    if denied:
        return denied
    res = _reskins().update_one({"_id": rid}, {"$set": {"approved": True}})
    if res.matched_count == 0:
        return jsonify({"error": "not found"}), 404
    _refresh_counts()
    return jsonify({"ok": True})


@app.post("/api/admin/reskins/<rid>/reject")
@mongo_guarded
def admin_reject(rid):
    denied = _require_admin()
    if denied:
        return denied
    res = _reskins().delete_one({"_id": rid})
    if res.deleted_count == 0:
        return jsonify({"error": "not found"}), 404
    _refresh_counts()
    return jsonify({"ok": True})
```

In `resolve_decklist`, replace the reskin lookup line:
```python
        reskins = []
        if card is not None:
            reskins = list(_reskins().find(
                {"oracle_id": card["oracle_id"], "approved": True},
                {"created_at": 0}))
```
Add `@mongo_guarded` under `@app.post("/api/resolve")`.

Delete the old `_admin_ok()` function entirely.

- [ ] **Step 4: Add the auth endpoints**

Add near the other routes:
```python
@app.post("/api/auth/login")
@mongo_guarded
def login():
    body = request.get_json(silent=True) or {}
    user = auth.verify_credentials(
        (body.get("username") or "").strip(), body.get("password") or "")
    if user is None:
        return jsonify({"error": "invalid credentials"}), 401
    sess = auth.create_session(user)
    return jsonify({"token": sess["token"],
                    "expires_at": sess["expires_at"].isoformat()})


@app.post("/api/auth/logout")
@mongo_guarded
def logout():
    auth.delete_session(auth.bearer_token())
    return ("", 204)


@app.get("/api/auth/me")
@mongo_guarded
def me():
    user, err = auth.authenticate()
    if err:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"username": user["username"], "role": user["role"]})
```

- [ ] **Step 5: Manual smoke (mongomock) — run the app import**

Run: `cd backend && UBDB_MONGO_MOCK=1 python -c "import app; print('ok', sorted(r.rule for r in app.app.url_map.iter_rules()))"`
Expected: prints `ok` and a list including `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`. No exceptions.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py
git commit -m "feat(backend): back reskins with Mongo and add admin auth endpoints"
```

---

### Task 5: Migrate tests to mongomock + cover the new flow

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_cards_api.py`

**Interfaces:**
- Consumes: `db.reset_client`, `auth`, the routes from Task 4.

- [ ] **Step 1: Update conftest to use mongomock**

Replace `backend/tests/conftest.py` with:
```python
import json
import os
import pytest


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Deterministic card snapshot (cards stay JSON).
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

    # Hermetic Mongo via mongomock; fresh client per test.
    monkeypatch.setenv("UBDB_MONGO_MOCK", "1")
    monkeypatch.setenv("UBDB_MONGO_DB", "ubdb_test")
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")

    import db
    import importlib
    importlib.reload(db)
    db.reset_client()  # mongomock data is per-client; this resets state per test

    import app as app_module
    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/auth/login",
                        json={"username": "root", "password": "s3cret"})
    assert resp.status_code == 200
    return resp.get_json()["token"]
```

- [ ] **Step 2: Update reskin tests + add moderation flow**

In `backend/tests/test_cards_api.py`, the existing `test_reskins_empty_for_known_card` and `test_reskins_404_for_unknown_card` still pass as-is (empty Mongo). Add the full flow and auth-gate coverage:
```python
def test_submit_then_moderate_flow(client, admin_token):
    # Public submit lands pending, not visible.
    sub = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "Aang, Sky Bison", "image_url": "https://x/a.jpg",
        "designer_name": "nati"})
    assert sub.status_code == 201
    rid = sub.get_json()["id"]
    assert client.get("/api/cards/oracle-1/reskins").get_json()["reskins"] == []

    # Pending list requires a session.
    assert client.get("/api/admin/reskins/pending").status_code == 401
    pend = client.get("/api/admin/reskins/pending",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert pend.status_code == 200
    assert [r["_id"] for r in pend.get_json()["reskins"]] == [rid]

    # Approve makes it live and bumps the count.
    ok = client.post(f"/api/admin/reskins/{rid}/approve",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert ok.status_code == 200
    live = client.get("/api/cards/oracle-1/reskins").get_json()["reskins"]
    assert [r["reskin_name"] for r in live] == ["Aang, Sky Bison"]
    assert client.get("/api/cards").get_json()["cards"][0]["reskin_count"] == 1


def test_reject_removes_pending(client, admin_token):
    rid = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "x", "image_url": "https://x/a.jpg",
        "designer_name": "nati"}).get_json()["id"]
    hdr = {"Authorization": f"Bearer {admin_token}"}
    assert client.post(f"/api/admin/reskins/{rid}/reject", headers=hdr).status_code == 200
    assert client.post(f"/api/admin/reskins/{rid}/reject", headers=hdr).status_code == 404


def test_bad_login_is_401(client):
    resp = client.post("/api/auth/login",
                       json={"username": "root", "password": "nope"})
    assert resp.status_code == 401


def test_me_and_logout(client, admin_token):
    hdr = {"Authorization": f"Bearer {admin_token}"}
    assert client.get("/api/auth/me", headers=hdr).get_json()["role"] == "admin"
    assert client.post("/api/auth/logout", headers=hdr).status_code == 204
    assert client.get("/api/auth/me", headers=hdr).status_code == 401
```

- [ ] **Step 3: Run the whole backend suite**

Run: `cd backend && python -m pytest -v`
Expected: PASS (existing card/search tests + new reskin/auth tests). No test reads `data/reskins/reskins.json`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_cards_api.py
git commit -m "test(backend): mongomock fixtures and moderation-flow coverage"
```

---

### Task 6: Frontend API client (`src/lib/api.ts`)

**Files:**
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: `login(username, password)`, `logout(token)`, `me(token)`; `adminPending`/`adminModerate` now send `Authorization: Bearer`.

- [ ] **Step 1: Replace `adminHeaders` and the admin calls**

Replace lines 76–96 of `src/lib/api.ts` with:
```ts
function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "invalid credentials" : `${res.status}`);
  return res.json();
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function me(token: string): Promise<{ username: string; role: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("unauthorized");
  return res.json();
}

export async function adminPending(token?: string): Promise<Reskin[]> {
  const res = await fetch(`${API_BASE_URL}/admin/reskins/pending`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "unauthorized" : `${res.status}`);
  return (await res.json()).reskins as Reskin[];
}

export async function adminModerate(
  id: string,
  action: "approve" | "reject",
  token?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/reskins/${id}/${action}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "unauthorized" : `${res.status}`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `src/lib/api.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(frontend): auth API client with Bearer sessions"
```

---

### Task 7: Admin login UI (`src/app/admin/page.tsx`)

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `login`, `logout`, `adminPending`, `adminModerate` from `@/lib/api`.

- [ ] **Step 1: Replace token-paste with a login form + logout**

Rewrite `src/app/admin/page.tsx`. Keep the moderation grid (lines 78–110 of the current file) unchanged; replace the state, effects, and the control bar:
```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminPending, adminModerate, login as apiLogin, logout as apiLogout, getImageSrc } from "@/lib/api";
import { Reskin } from "@/types/types";

const TOKEN_KEY = "ubdb.session";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Reskin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const load = useCallback(async (tok: string) => {
    setError(null);
    try {
      setPending(await adminPending(tok));
      setAuthed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "unauthorized") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setAuthed(false);
      } else {
        setError(msg);
      }
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      setToken(t);
      load(t);
    }
  }, [load]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { token: tok } = await apiLogin(username.trim(), password);
      localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      setPassword("");
      await load(tok);
    } catch {
      setError("Invalid username or password.");
    }
  }

  async function doLogout() {
    if (token) await apiLogout(token);
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAuthed(false);
    setPending([]);
  }

  async function moderate(id: string, action: "approve" | "reject") {
    if (!token) return;
    try {
      await adminModerate(id, action, token);
      setPending((p) => p.filter((r) => r._id !== id));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  if (!authed) {
    return (
      <main className="py-8">
        <h1 className="mb-6 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
          Admin login
        </h1>
        <form onSubmit={doLogin} className="grid max-w-xs gap-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)}
                 placeholder="username" autoComplete="username"
                 className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold" />
          <input value={password} onChange={(e) => setPassword(e.target.value)}
                 type="password" placeholder="password" autoComplete="current-password"
                 className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold" />
          <button type="submit"
                  className="rounded-card bg-gold px-3 py-2 font-display text-sm uppercase tracking-wide text-frame hover:brightness-110">
            Sign in
          </button>
          {error && <p className="font-mono text-sm text-mana-r">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
            Moderation
          </h1>
          <p className="font-body text-sm text-ink/55 dark:text-ink-dark/55">
            Pending reskin submissions. Approve to publish, reject to discard. Reject AI art and paper-Magic art per community rules.
          </p>
        </div>
        <button onClick={doLogout}
                className="no-print rounded-card border border-gold/40 px-3 py-1.5 font-display text-sm uppercase tracking-wide hover:border-gold hover:text-gold">
          Log out
        </button>
      </div>

      {error && <p className="mb-4 font-mono text-sm text-mana-r">Failed: {error}</p>}

      {authed && pending.length === 0 && (
        <p className="font-body italic text-ink/55 dark:text-ink-dark/50">Nothing pending. Inbox zero.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {pending.map((r) => (
          <div key={r._id} className="flex gap-3 rounded-card border-2 border-gold/40 p-3">
            <img src={getImageSrc(r.image_url)} alt={r.reskin_name} className="w-28 shrink-0 rounded-card" />
            <div className="flex flex-1 flex-col">
              <div className="font-body font-medium">{r.reskin_name}</div>
              <div className="font-mono text-[11px] text-ink/50 dark:text-ink-dark/40">
                by {r.designer_name} · art: {r.art_credit || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.art_source}</span>
                <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.style}</span>
                {(r.tags ?? []).map((t) => (
                  <span key={t} className="rounded-card bg-ink/5 px-1.5 text-[10px] text-ink/55 dark:bg-ink-dark/10 dark:text-ink-dark/50">{t}</span>
                ))}
              </div>
              <Link href={`/card/${r.oracle_id}`} className="mt-1 font-mono text-[11px] text-gold hover:underline">
                view card →
              </Link>
              <div className="mt-auto flex gap-2 pt-2">
                <button onClick={() => moderate(r._id, "approve")}
                        className="rounded-card bg-gold px-3 py-1 font-display text-sm uppercase tracking-wide text-frame hover:brightness-110">
                  Approve
                </button>
                <button onClick={() => moderate(r._id, "reject")}
                        className="rounded-card border border-mana-r/50 px-3 py-1 font-display text-sm uppercase tracking-wide text-mana-r hover:bg-mana-r/10">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check (needs live Mongo + backend)**

Start Mongo, set `UBDB_ADMIN_USER`/`UBDB_ADMIN_PASS`, run the backend and `npm run dev`. Visit `/admin`: login form appears → wrong password shows the error → correct password shows the queue → reload keeps you logged in → Log out returns to the form.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(frontend): admin username/password login and logout"
```

---

### Task 8: Env documentation

**Files:**
- Create/Modify: `.env.example`

**Interfaces:** none (docs only).

- [ ] **Step 1: Document the env vars**

Create or update `.env.example` at the repo root with:
```
# Backend
UBDB_MONGO_URI=mongodb://localhost:27017
UBDB_MONGO_DB=ubdb
UBDB_ADMIN_USER=changeme
UBDB_ADMIN_PASS=change-this-strong-password
UBDB_SESSION_TTL_HOURS=168
# Cards snapshot (JSON, read-only)
# UB_CARDS_JSON=../data/ub_cards/cards.json

# Frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document Mongo and admin auth env vars"
```

---

## Self-Review

**Spec coverage:**
- Mongo scope (reskins + users, cards stay JSON) → Tasks 1, 4. ✓
- Server-side sessions, Bearer transport → Task 3, endpoints Task 4. ✓
- Admin bootstrap from env → Task 2, wired Task 4 startup. ✓
- Hard Mongo dependency / 503 → `mongo_guarded`, Task 4. ✓
- Seed data dropped / start empty → Task 4 removes JSON reskin load; Task 5 conftest no longer seeds reskins. ✓
- Auth endpoints login/logout/me → Task 4. ✓
- Guard 401 vs 403 → Task 3 `authenticate`, Task 4 `_require_admin`. ✓
- Frontend login form + Bearer → Tasks 6, 7. ✓
- Retire old envs (`UBDB_ADMIN_TOKEN`, `UB_RESKINS_JSON`) → Task 4 deletes `_admin_ok`/`_reskins_path`. ✓
- Testing via mongomock → Tasks 1–5. ✓

**Placeholder scan:** No TBD/TODO; all steps carry real code. ✓

**Type consistency:** `authenticate()` returns `(user, status)` used by `_require_admin` and `me`. `create_session` returns `{"token", "expires_at"}`; `login` reads both. `authHeaders`/`Authorization: Bearer` consistent across api.ts and backend `bearer_token`. Storage key `ubdb.session` consistent in page.tsx. ✓
