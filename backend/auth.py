"""Admin auth: password hashing, env bootstrap, sessions, request guard.
Admins only for now; no public signup."""
import os
import secrets
from datetime import datetime, timedelta, timezone

from flask import request
from werkzeug.security import generate_password_hash, check_password_hash

import db


_DUMMY_HASH = generate_password_hash("x")


def _now():
    return datetime.now(timezone.utc)


def bootstrap_admin() -> None:
    """If UBDB_ADMIN_USER/PASS are set and that username has no user doc,
    insert it as an admin. Idempotent, safe on every boot."""
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
    stored = user["password_hash"] if user else _DUMMY_HASH
    ok = check_password_hash(stored, password)
    if not user or not ok:
        return None
    return user


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
