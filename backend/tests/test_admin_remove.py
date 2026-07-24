"""An admin can remove a reskin that is already approved (confirmed),
not just reject a pending one."""


def test_admin_can_remove_approved_reskin(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}

    sub = client.post("/api/cards/oracle-1/reskins", json={
        "reskin_name": "Fire Nation Aang",
        "image_url": "https://i.imgur.com/x.jpg",
        "designer_name": "d",
    })
    rid = sub.get_json()["id"]

    # Approve it, so it's live on the public card endpoint.
    assert client.post(f"/api/admin/reskins/{rid}/approve", headers=h).status_code == 200
    live = client.get("/api/cards/oracle-1/reskins").get_json()["reskins"]
    assert any(r["_id"] == rid for r in live)

    # Remove the already-approved reskin.
    assert client.post(f"/api/admin/reskins/{rid}/reject", headers=h).status_code == 200
    after = client.get("/api/cards/oracle-1/reskins").get_json()["reskins"]
    assert all(r["_id"] != rid for r in after)


def test_removing_missing_reskin_is_404(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    assert client.post("/api/admin/reskins/rk-does-not-exist/reject", headers=h).status_code == 404
