def test_suggest_requires_description(client):
    resp = client.post("/api/suggest", json={"description": "  "})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "description required"


def test_suggest_returns_results_shape(client):
    # conftest card oracle-1 has franchise "Avatar: The Last Airbender" (no
    # colors/keywords in the fixture), so match on the franchise phrase signal.
    # "Special Guests" is one of its set names and deliberately does not score.
    resp = client.post(
        "/api/suggest",
        json={"description": "a hero from Avatar: The Last Airbender"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body.keys()) == {"results", "inferred_facets"}
    assert body["results"][0]["oracle_id"] == "oracle-1"
    assert any("avatar" in w.lower() for w in body["results"][0]["why"])


def test_suggest_does_not_match_on_set_name(client):
    # Set names are not a suggester signal; only franchises are.
    resp = client.post("/api/suggest", json={"description": "a hero from Special Guests"})
    assert resp.status_code == 200
    assert resp.get_json()["results"] == []


def test_suggest_empty_when_no_signal(client):
    resp = client.post("/api/suggest", json={"description": "qqqq zzzz"})
    assert resp.status_code == 200
    assert resp.get_json()["results"] == []
