"""Circles: anyone creates, the creator owns, members join by invitation."""
import pytest

from app.authz import visible_device_ids
from app.database import get_session
from app.tests.conftest import auth, seed_session

pytestmark = pytest.mark.asyncio


async def _person(unique_id: str, device_id: int, name: str) -> str:
    return await seed_session(device_unique_id=unique_id, traccar_device_id=device_id,
                              display_name=name)


async def _circle(client, token: str, name: str = "Family") -> dict:
    resp = await client.post("/groups", json={"name": name}, headers=auth(token))
    assert resp.status_code == 201
    return resp.json()


async def _invite_and_join(client, owner: str, joiner: str, group_id: int) -> None:
    code = (await client.post(f"/groups/{group_id}/invites", headers=auth(owner))).json()["code"]
    resp = await client.post("/groups/join", json={"code": code}, headers=auth(joiner))
    assert resp.status_code == 200


async def test_list_groups_empty(client):
    token = await seed_session()
    resp = await client.get("/groups", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json() == []


async def test_creator_owns_and_belongs_to_new_circle(client):
    token = await seed_session()
    data = await _circle(client, token)
    assert data["role"] == "owner"
    assert data["member_count"] == 1
    listed = (await client.get("/groups", headers=auth(token))).json()
    assert [g["name"] for g in listed] == ["Family"]


async def test_two_people_can_both_name_a_circle_family(client):
    a = await _person("ml360-a", 1, "A")
    b = await _person("ml360-b", 2, "B")
    await _circle(client, a)
    await _circle(client, b)


async def test_others_circles_are_not_listed(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    await _circle(client, alice, "Alice's")
    assert (await client.get("/groups", headers=auth(bob))).json() == []


async def test_invitation_joins_circle_and_makes_members_visible(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    circle = await _circle(client, alice)
    await _invite_and_join(client, alice, bob, circle["id"])

    assert await visible_device_ids(await get_session(bob)) == {1, 2}
    members = (await client.get(f"/groups/{circle['id']}/members", headers=auth(bob))).json()
    assert {(m["name"], m["role"], m["is_me"]) for m in members["members"]} == {
        ("Alice", "owner", False), ("Bob", "member", True),
    }


async def test_invite_codes_are_forgiving_about_case_and_spaces(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    circle = await _circle(client, alice)
    code = (await client.post(f"/groups/{circle['id']}/invites", headers=auth(alice))).json()["code"]
    messy = f" {code[:4].lower()} {code[4:]} "
    resp = await client.post("/groups/join", json={"code": messy}, headers=auth(bob))
    assert resp.status_code == 200


async def test_wrong_invite_code_is_refused(client):
    bob = await _person("ml360-bob", 2, "Bob")
    resp = await client.post("/groups/join", json={"code": "NOPE1234"}, headers=auth(bob))
    assert resp.status_code == 404


async def test_outsider_cannot_invite_themselves(client):
    """Regression for E-07: membership is no longer open to any enrolled phone."""
    alice = await _person("ml360-alice", 1, "Alice")
    mallory = await _person("ml360-mallory", 9, "Mallory")
    circle = await _circle(client, alice)
    resp = await client.post(f"/groups/{circle['id']}/invites", headers=auth(mallory))
    assert resp.status_code == 404
    resp = await client.get(f"/groups/{circle['id']}/members", headers=auth(mallory))
    assert resp.status_code == 404
    assert await visible_device_ids(await get_session(mallory)) == {9}


async def test_the_old_add_member_route_is_gone(client):
    alice = await _person("ml360-alice", 1, "Alice")
    circle = await _circle(client, alice)
    resp = await client.post(
        f"/groups/{circle['id']}/members", json={"device_unique_id": "ml360-x"}, headers=auth(alice)
    )
    assert resp.status_code == 405


async def test_only_the_owner_renames_or_deletes(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    circle = await _circle(client, alice)
    await _invite_and_join(client, alice, bob, circle["id"])

    resp = await client.put(f"/groups/{circle['id']}", json={"name": "Mine"}, headers=auth(bob))
    assert resp.status_code == 403
    resp = await client.delete(f"/groups/{circle['id']}", headers=auth(bob))
    assert resp.status_code == 403

    resp = await client.put(f"/groups/{circle['id']}", json={"name": "Home crew", "color": "#112233"},
                            headers=auth(alice))
    assert resp.status_code == 200
    assert resp.json()["name"] == "Home crew"
    resp = await client.delete(f"/groups/{circle['id']}", headers=auth(alice))
    assert resp.status_code == 204
    assert (await client.get("/groups", headers=auth(bob))).json() == []


async def test_owner_removes_a_member(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    circle = await _circle(client, alice)
    await _invite_and_join(client, alice, bob, circle["id"])

    resp = await client.delete(f"/groups/{circle['id']}/members/2", headers=auth(bob))
    assert resp.status_code == 403
    resp = await client.delete(f"/groups/{circle['id']}/members/2", headers=auth(alice))
    assert resp.status_code == 204
    assert await visible_device_ids(await get_session(bob)) == {2}


async def test_owner_leaving_hands_the_circle_on(client):
    alice = await _person("ml360-alice", 1, "Alice")
    bob = await _person("ml360-bob", 2, "Bob")
    circle = await _circle(client, alice)
    await _invite_and_join(client, alice, bob, circle["id"])

    resp = await client.delete(f"/groups/{circle['id']}/members/me", headers=auth(alice))
    assert resp.status_code == 204
    listed = (await client.get("/groups", headers=auth(bob))).json()
    assert listed[0]["role"] == "owner"


async def test_last_member_leaving_deletes_the_circle(client):
    alice = await _person("ml360-alice", 1, "Alice")
    circle = await _circle(client, alice)
    await client.delete(f"/groups/{circle['id']}/members/me", headers=auth(alice))
    assert (await client.get("/groups", headers=auth(alice))).json() == []


async def test_groups_require_auth(client):
    resp = await client.get("/groups")
    assert resp.status_code == 401
