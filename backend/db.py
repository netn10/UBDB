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
