import json
import pytest


@pytest.fixture
def cc(monkeypatch, tmp_path):
    """Client over a multi-card snapshot so ranking is observable."""
    sample = [
        {"oracle_id": "o1", "name": "Bolas's Citadel", "prints": []},
        {"oracle_id": "o2", "name": "Nicol Bolas, the Ravager", "prints": []},
        {"oracle_id": "o3", "name": "Boros Charm", "prints": []},
        {"oracle_id": "o4", "name": "Llanowar Elves", "prints": []},
        # duplicate name (different printing) must dedupe to one suggestion
        {"oracle_id": "o5", "name": "Boros Charm", "prints": []},
    ]
    f = tmp_path / "cards.json"
    f.write_text(json.dumps(sample), encoding="utf-8")
    monkeypatch.setenv("UB_CARDS_JSON", str(f))
    monkeypatch.setenv("UBDB_MONGO_MOCK", "1")
    monkeypatch.setenv("UBDB_MONGO_DB", "ubdb_test")
    monkeypatch.setenv("UBDB_ADMIN_USER", "root")
    monkeypatch.setenv("UBDB_ADMIN_PASS", "s3cret")
    import importlib
    import db
    importlib.reload(db)
    db.reset_client()
    import app as app_module
    importlib.reload(app_module)
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_complete_cards_prefix_before_substring(cc):
    body = cc.get("/api/complete/cards?q=bol").get_json()
    # "Bolas's Citadel" starts with "bol" → ranks before "Nicol Bolas…"
    assert body["names"][0] == "Bolas's Citadel"
    assert "Nicol Bolas, the Ravager" in body["names"]
    assert body["names"].index("Bolas's Citadel") < body["names"].index("Nicol Bolas, the Ravager")


def test_complete_cards_case_insensitive_and_dedup(cc):
    names = cc.get("/api/complete/cards?q=BOROS").get_json()["names"]
    assert names.count("Boros Charm") == 1


def test_complete_cards_empty_query_is_empty(cc):
    assert cc.get("/api/complete/cards?q=").get_json()["names"] == []
    assert cc.get("/api/complete/cards").get_json()["names"] == []


def test_complete_cards_limit_clamped(cc):
    # limit below 1 clamps to 1; "bo" matches Bolas's Citadel, Boros Charm, Nicol Bolas
    names = cc.get("/api/complete/cards?q=bo&limit=0").get_json()["names"]
    assert len(names) == 1
    names = cc.get("/api/complete/cards?q=bo&limit=999").get_json()["names"]
    assert len(names) <= 20


def _seed_reskins(cc):
    import db
    db.get_db().reskins.insert_many([
        {"_id": "r1", "oracle_id": "o1", "designer_name": "Ada",
         "art_credit": "Artist X", "tags": ["fallout", "ghoul"], "approved": True},
        {"_id": "r2", "oracle_id": "o2", "designer_name": "Ben",
         "art_credit": "Artist Y", "tags": ["ghoul", "flavor"], "approved": True},
        # unapproved, must NOT appear in any suggestion
        {"_id": "r3", "oracle_id": "o3", "designer_name": "Hidden",
         "art_credit": "Secret", "tags": ["secret"], "approved": False},
    ])


def test_reskin_values_designer_approved_only_sorted(cc):
    _seed_reskins(cc)
    values = cc.get("/api/complete/reskin-values?field=designer").get_json()["values"]
    assert values == ["Ada", "Ben"]
    assert "Hidden" not in values


def test_reskin_values_tags_flattened_distinct(cc):
    _seed_reskins(cc)
    values = cc.get("/api/complete/reskin-values?field=tags").get_json()["values"]
    assert values == ["fallout", "flavor", "ghoul"]
    assert "secret" not in values


def test_reskin_values_bad_field_400(cc):
    resp = cc.get("/api/complete/reskin-values?field=nope")
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "unknown field"
