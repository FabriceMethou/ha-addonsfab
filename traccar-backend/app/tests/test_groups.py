"""Tests for /groups endpoints (CRUD + members)."""
import pytest

from app.tests.conftest import seed_session

pytestmark = pytest.mark.asyncio


async def test_list_groups_empty(client):
    token = await seed_session()
    resp = await client.get("/groups", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_group(client):
    token = await seed_session()
    resp = await client.post(
        "/groups",
        json={"name": "Family", "color": "#FF0000"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Family"
    assert data["color"] == "#FF0000"
    assert "id" in data


async def test_create_and_list_groups(client):
    token = await seed_session()
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/groups", json={"name": "Family"}, headers=headers)
    await client.post("/groups", json={"name": "Friends"}, headers=headers)

    resp = await client.get("/groups", headers=headers)
    assert resp.status_code == 200
    names = [g["name"] for g in resp.json()]
    assert "Family" in names
    assert "Friends" in names


async def test_update_group(client):
    token = await seed_session()
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/groups", json={"name": "Old"}, headers=headers)
    gid = create.json()["id"]

    resp = await client.put(
        f"/groups/{gid}",
        json={"name": "New", "color": "#00FF00"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["color"] == "#00FF00"


async def test_update_nonexistent_group(client):
    token = await seed_session()
    resp = await client.put(
        "/groups/999",
        json={"name": "X"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_delete_group(client):
    token = await seed_session()
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/groups", json={"name": "Delete Me"}, headers=headers)
    gid = create.json()["id"]

    resp = await client.delete(f"/groups/{gid}", headers=headers)
    assert resp.status_code == 204

    # Verify gone
    listing = await client.get("/groups", headers=headers)
    assert all(g["id"] != gid for g in listing.json())


async def test_delete_nonexistent_group(client):
    token = await seed_session()
    resp = await client.delete(
        "/groups/999", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

async def test_add_and_list_members(client):
    token = await seed_session(device_unique_id="ml360-alice", traccar_device_id=7)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/groups", json={"name": "Family"}, headers=headers)
    gid = create.json()["id"]

    resp = await client.post(
        f"/groups/{gid}/members",
        json={"device_unique_id": "ml360-alice"},
        headers=headers,
    )
    assert resp.status_code == 204

    members = await client.get(f"/groups/{gid}/members", headers=headers)
    assert "ml360-alice" in members.json()["device_unique_ids"]
    assert "7" in members.json()["device_ids"]


async def test_remove_member(client):
    token = await seed_session(device_unique_id="ml360-bob", traccar_device_id=8)
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/groups", json={"name": "G"}, headers=headers)
    gid = create.json()["id"]

    await client.post(
        f"/groups/{gid}/members",
        json={"device_unique_id": "ml360-bob"},
        headers=headers,
    )
    resp = await client.delete(f"/groups/{gid}/members/ml360-bob", headers=headers)
    assert resp.status_code == 204

    members = await client.get(f"/groups/{gid}/members", headers=headers)
    assert members.json()["device_unique_ids"] == []


async def test_add_member_to_nonexistent_group(client):
    token = await seed_session()
    resp = await client.post(
        "/groups/999/members",
        json={"device_unique_id": "ml360-x"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_groups_require_auth(client):
    resp = await client.get("/groups")
    assert resp.status_code == 403
