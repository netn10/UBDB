"""Regression tests for the public-endpoint hardening:
regex ReDoS safety, request/field size caps, and batch limits."""
import urllib.parse


def _q(query):
    return "/api/search?q=" + urllib.parse.quote(query)


def test_regex_search_still_matches(client):
    # A normal /regex/ still works: "Flying" matches /fly/ case-insensitively.
    r = client.get(_q("o:/fly/"))
    assert r.status_code == 200
    assert r.get_json()["total"] == 1


def test_regex_redos_pattern_returns_promptly(client):
    # A classic catastrophic-backtracking pattern must not hang (RE2 is linear).
    r = client.get(_q("o:/(a+)+$/"))
    assert r.status_code == 200


def test_overlong_regex_is_rejected_with_warning(client):
    r = client.get(_q("o:/" + "a" * 300 + "/"))
    assert r.status_code == 200
    assert any("regex too long" in w for w in (r.get_json().get("warnings") or []))


def test_reskin_fields_and_tags_are_capped(client, admin_token):
    resp = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "x" * 500,
        "image_url": "https://i.imgur.com/a.jpg",
        "designer_name": "d" * 500,
        "art_credit": "c" * 500,
        "tags": [f"t{i}" for i in range(100)],
    })
    assert resp.status_code == 201
    pending = client.get(
        "/api/admin/reskins/pending",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()["reskins"]
    rk = next(r for r in pending if r["reskin_name"].startswith("x"))
    assert len(rk["reskin_name"]) == 200
    assert len(rk["designer_name"]) == 100
    assert len(rk["art_credit"]) == 200
    assert len(rk["tags"]) == 20


def test_resolve_batch_is_capped(client):
    names = [{"name": f"card {i}", "qty": 1} for i in range(500)]
    r = client.post("/api/resolve", json={"names": names})
    assert r.status_code == 200
    assert len(r.get_json()["results"]) == 200


def test_oversized_body_is_rejected(client):
    r = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "a" * 70000,
        "image_url": "https://x/a.jpg",
        "designer_name": "d",
    })
    assert r.status_code == 413
