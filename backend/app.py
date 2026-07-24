"""UBDB backend. Loads the Scryfall UB snapshot from git JSON and serves it.
Reads work even with no database; writes (reskins/auth) arrive in later slices.
"""
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
from suggest import score_cards

app = Flask(__name__)
CORS(app)

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CARDS = os.path.join(_HERE, "..", "data", "ub_cards", "cards.json")


def _cards_path() -> str:
    return os.getenv("UB_CARDS_JSON", _DEFAULT_CARDS)


def _load_json(path) -> list:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def load_cards() -> list:
    return _load_json(_cards_path())


# Loaded once at import; the sync script + redeploy refreshes it.
_CARDS = load_cards()
_BY_ORACLE = {c["oracle_id"]: c for c in _CARDS}

# Name lookup for decklist resolution. Index both the full name and the DFC
# front-face name (before "//") so "Aang, at the Crossroads" resolves too.
_BY_NAME = {}
for _c in _CARDS:
    _nm = (_c.get("name") or "").strip().lower()
    if _nm:
        _BY_NAME.setdefault(_nm, _c)
        _front = _nm.split("//")[0].strip()
        _BY_NAME.setdefault(_front, _c)

def _reskins():
    return db.get_db().reskins


def _load_counts() -> dict:
    """Approved-reskin counts per oracle_id, computed per request. Drives
    is:reskinned + tile badges — recomputed each call so counts never go stale
    across worker processes."""
    try:
        pipeline = [
            {"$match": {"approved": True}},
            {"$group": {"_id": "$oracle_id", "n": {"$sum": 1}}},
        ]
        return {d["_id"]: d["n"] for d in _reskins().aggregate(pipeline)}
    except PyMongoError:
        return {}


def _count_for(oracle_id: str) -> int:
    """Approved-reskin count for one card; 0 if Mongo is unavailable."""
    try:
        return _reskins().count_documents({"oracle_id": oracle_id, "approved": True})
    except PyMongoError:
        return 0


def mongo_guarded(fn):
    """Reskin/admin routes hard-depend on Mongo — surface outages as 503."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except PyMongoError:
            return jsonify({"error": "database unavailable"}), 503
    return wrapper


try:
    db.ensure_indexes()
    auth.bootstrap_admin()
except PyMongoError:
    pass  # cards still serve from JSON; reskin/admin routes will 503


def get_card(oracle_id: str):
    return _BY_ORACLE.get(oracle_id)


@app.get("/api/cards")
def list_cards():
    counts = _load_counts()
    cards = [{**c, "reskin_count": counts.get(c["oracle_id"], 0)} for c in _CARDS]
    return jsonify({"cards": cards, "count": len(cards)})


@app.get("/api/cards/<oracle_id>")
def card_detail(oracle_id):
    card = get_card(oracle_id)
    if card is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({**card, "reskin_count": _count_for(oracle_id)})


@app.get("/api/cards/<oracle_id>/reskins")
@mongo_guarded
def card_reskins(oracle_id):
    if get_card(oracle_id) is None:
        return jsonify({"error": "not found"}), 404
    live = list(_reskins().find(
        {"oracle_id": oracle_id, "approved": True}, {"created_at": 0}))
    return jsonify({"reskins": live})


_ART_SOURCES = {"original", "token", "unset", "alchemy"}
_STYLES = {"name-bottom", "nickname-bar", "code"}


@app.post("/api/cards/<oracle_id>/reskins")
@mongo_guarded
def submit_reskin(oracle_id):
    """Accept a community reskin submission. Lands unapproved (moderation gate);
    image is a designer-hosted URL (no upload storage). AI art is banned per the
    community rules, enforced by a human at approval time."""
    if get_card(oracle_id) is None:
        return jsonify({"error": "not found"}), 404
    body = request.get_json(silent=True) or {}

    name = (body.get("reskin_name") or "").strip()
    image = (body.get("image_url") or "").strip()
    designer = (body.get("designer_name") or "").strip()
    if not name or not image or not designer:
        return jsonify({"error": "reskin_name, image_url and designer_name are required"}), 400
    if not image.lower().startswith(("http://", "https://")):
        return jsonify({"error": "image_url must be an http(s) link"}), 400

    art_source = (body.get("art_source") or "original").strip().lower()
    style = (body.get("style") or "name-bottom").strip().lower()
    tags = [t.strip() for t in (body.get("tags") or []) if isinstance(t, str) and t.strip()]
    try:
        face = int(body.get("face", 0))
    except (TypeError, ValueError):
        face = 0

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


@app.get("/api/search")
def search_cards():
    def _int(name, default):
        try:
            return int(request.args.get(name, default))
        except (TypeError, ValueError):
            return default

    result = search_engine.search(
        _CARDS,
        q=request.args.get("q", ""),
        order=request.args.get("order", "name"),
        direction=request.args.get("dir", "asc"),
        page=_int("page", 1),
        page_size=_int("page_size", 60),
        reskin_counts=_load_counts(),
    )
    return jsonify(result)


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
    return jsonify({"ok": True})


@app.post("/api/resolve")
@mongo_guarded
def resolve_decklist():
    """Resolve decklist names to cards + their approved reskins. Body:
    {"names": [{"name": str, "qty": int}, ...]}. Unmatched names come back with
    card=null so the UI can flag them."""
    body = request.get_json(silent=True) or {}
    entries = body.get("names") or []
    results = []
    for entry in entries:
        if isinstance(entry, str):
            name, qty = entry, 1
        else:
            name = entry.get("name", "")
            try:
                qty = max(1, int(entry.get("qty", 1)))
            except (TypeError, ValueError):
                qty = 1
        key = (name or "").strip().lower()
        card = _BY_NAME.get(key) or _BY_NAME.get(key.split("//")[0].strip())
        reskins = []
        if card is not None:
            reskins = list(_reskins().find(
                {"oracle_id": card["oracle_id"], "approved": True},
                {"created_at": 0}))
        results.append({"query": name, "qty": qty, "card": card, "reskins": reskins})
    return jsonify({"results": results})


def _count_by(field):
    counts = {}
    for c in _CARDS:
        for name in c.get(field, []):
            counts[name] = counts.get(name, 0) + 1
    return [{"name": n, "count": counts[n]} for n in sorted(counts)]


@app.get("/api/franchises")
def list_franchises():
    return jsonify({"franchises": _count_by("franchises")})


@app.get("/api/sets")
def list_sets():
    return jsonify({"sets": _count_by("set_names")})


_MAX_COMPLETE = 20


@app.get("/api/complete/cards")
def complete_cards():
    q = (request.args.get("q") or "").strip().lower()
    try:
        limit = int(request.args.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, _MAX_COMPLETE))
    if not q:
        return jsonify({"names": []})
    prefix, substr, seen = [], [], set()
    for c in _CARDS:
        name = c.get("name") or ""
        if not name or name in seen:
            continue
        low = name.lower()
        if low.startswith(q):
            prefix.append(name)
            seen.add(name)
        elif q in low:
            substr.append(name)
            seen.add(name)
    prefix.sort(key=str.lower)
    substr.sort(key=str.lower)
    return jsonify({"names": (prefix + substr)[:limit]})


_COMPLETE_FIELDS = {
    "designer": "designer_name",
    "art_credit": "art_credit",
    "tags": "tags",
}


@app.get("/api/complete/reskin-values")
@mongo_guarded
def complete_reskin_values():
    key = _COMPLETE_FIELDS.get(request.args.get("field", ""))
    if key is None:
        return jsonify({"error": "unknown field"}), 400
    raw = _reskins().distinct(key, {"approved": True})
    values = sorted({v.strip() for v in raw if isinstance(v, str) and v.strip()})
    return jsonify({"values": values})


@app.get("/api/random")
def random_card():
    if not _CARDS:
        return jsonify({"error": "no cards"}), 404
    return jsonify({"oracle_id": _random.choice(_CARDS)["oracle_id"]})


if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", 5000)))
