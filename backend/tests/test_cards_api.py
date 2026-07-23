def test_list_cards_returns_count_and_cards(client):
    resp = client.get("/api/cards")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["count"] == 1
    assert body["cards"][0]["name"] == "Aang, Airbending Master"


def test_get_card_by_oracle_id(client):
    resp = client.get("/api/cards/oracle-1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["prints"]) == 2
    assert body["prints"][0]["set"] == "tla"


def test_get_missing_card_404(client):
    resp = client.get("/api/cards/nope")
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "not found"


def test_reskins_empty_for_known_card(client):
    resp = client.get("/api/cards/oracle-1/reskins")
    assert resp.status_code == 200
    assert resp.get_json()["reskins"] == []


def test_reskins_404_for_unknown_card(client):
    resp = client.get("/api/cards/nope/reskins")
    assert resp.status_code == 404


def test_search_endpoint_returns_paged_shape(client):
    resp = client.get("/api/search?q=&page_size=1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body.keys()) == {"cards", "total", "page", "page_size", "has_more", "warnings"}
    assert body["page_size"] == 1


def test_search_endpoint_bad_operator_is_soft(client):
    resp = client.get("/api/search?q=foo:bar")
    assert resp.status_code == 200
    assert resp.get_json()["warnings"]


def test_franchises_lists_counts(client):
    resp = client.get("/api/franchises")
    assert resp.status_code == 200
    fr = resp.get_json()["franchises"]
    names = {f["name"]: f["count"] for f in fr}
    assert names["Avatar: The Last Airbender"] == 1
    assert names["Special Guests"] == 1


def test_random_returns_known_oracle_id(client):
    known_ids = {c["oracle_id"] for c in client.get("/api/cards").get_json()["cards"]}
    resp = client.get("/api/random")
    assert resp.status_code == 200
    assert resp.get_json()["oracle_id"] in known_ids


def test_submit_reskin_pending_and_hidden(client):
    resp = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "Aang UW", "designer_name": "me",
        "image_url": "https://x/aang.jpg", "art_source": "original",
        "style": "name-bottom", "tags": ["Avatar"],
    })
    assert resp.status_code == 201
    assert resp.get_json()["status"] == "pending moderation"
    # Unapproved submissions stay hidden from the public list.
    assert client.get("/api/cards/oracle-1/reskins").get_json()["reskins"] == []


def test_submit_reskin_requires_fields(client):
    resp = client.post("/api/cards/oracle-1/reskins", json={"reskin_name": "x"})
    assert resp.status_code == 400


def test_submit_reskin_rejects_non_http_image(client):
    resp = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "x", "designer_name": "me", "image_url": "javascript:alert(1)",
    })
    assert resp.status_code == 400


def test_submit_reskin_unknown_card_404(client):
    resp = client.post("/api/cards/nope/reskins", json={
        "reskin_name": "x", "designer_name": "me", "image_url": "https://x/y.jpg",
    })
    assert resp.status_code == 404


def test_resolve_matches_and_flags_unknown(client):
    resp = client.post("/api/resolve", json={"names": [
        {"name": "Aang, Airbending Master", "qty": 2},
        {"name": "Totally Not A Card", "qty": 1},
    ]})
    assert resp.status_code == 200
    results = resp.get_json()["results"]
    assert results[0]["card"]["oracle_id"] == "oracle-1"
    assert results[0]["qty"] == 2
    assert results[1]["card"] is None


def test_resolve_accepts_bare_string_names(client):
    resp = client.post("/api/resolve", json={"names": ["aang, airbending master"]})
    assert resp.get_json()["results"][0]["card"]["oracle_id"] == "oracle-1"


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
