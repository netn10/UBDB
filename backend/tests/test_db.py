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
