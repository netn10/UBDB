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
