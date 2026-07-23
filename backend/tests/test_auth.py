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
