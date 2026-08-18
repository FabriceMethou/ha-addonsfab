"""
Authentication.

auth.py holds password hashing, account lockout, MFA and the login audit trail,
and was 21% covered — the security-relevant paths were the untested ones. These
tests pin the behaviour that protects the account.

Run:
  cd app && PYTHONPATH=$PWD ../.venv-dev/bin/python -m pytest tests/test_auth.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth import AuthManager

GOOD_PASSWORD = "Str0ngPassw0rd"
OTHER_PASSWORD = "An0therStr0ng1"


@pytest.fixture
def auth():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    os.environ["ADMIN_DEFAULT_PASSWORD"] = GOOD_PASSWORD
    manager = AuthManager(db_path=f.name)
    yield manager
    os.unlink(f.name)
    os.environ.pop("ADMIN_DEFAULT_PASSWORD", None)


def make_user(auth, username="alice"):
    ok, message = auth.create_user(username, f"{username}@example.com",
                                   GOOD_PASSWORD, role="user")
    assert ok, message
    return auth.get_user_by_username(username)


# ── password hashing ─────────────────────────────────────────────────────────

def test_the_password_is_never_stored_in_clear(auth):
    user = make_user(auth)
    assert GOOD_PASSWORD not in str(user.get("password_hash"))
    assert user["salt"]


def test_two_users_with_the_same_password_get_different_hashes(auth):
    a = make_user(auth, "alice")
    b = make_user(auth, "bob")
    assert a["salt"] != b["salt"], "each account needs its own salt"
    assert a["password_hash"] != b["password_hash"]


# ── creating accounts ────────────────────────────────────────────────────────

def test_a_weak_password_is_refused(auth):
    ok, message = auth.create_user("weak", "weak@example.com", "abc")
    assert not ok and message


def test_a_duplicate_username_is_refused(auth):
    make_user(auth, "alice")
    ok, _ = auth.create_user("alice", "other@example.com", OTHER_PASSWORD)
    assert not ok


def test_usernames_are_stored_lowercase(auth):
    auth.create_user("MixedCase", "mc@example.com", GOOD_PASSWORD)
    assert auth.get_user_by_username("mixedcase") is not None


# ── authenticating ───────────────────────────────────────────────────────────

def test_the_right_password_authenticates(auth):
    make_user(auth)
    ok, _, user = auth.authenticate("alice", GOOD_PASSWORD)
    assert ok and user["username"] == "alice"


def test_the_wrong_password_does_not(auth):
    make_user(auth)
    ok, _, user = auth.authenticate("alice", "wrong-password")
    assert not ok and not user


def test_an_unknown_user_does_not_authenticate(auth):
    ok, _, _ = auth.authenticate("nobody", GOOD_PASSWORD)
    assert not ok


# ── lockout ──────────────────────────────────────────────────────────────────

def test_repeated_failures_lock_the_account(auth):
    """Brute force must stop being cheap after a handful of tries."""
    make_user(auth)
    for _ in range(6):
        auth.authenticate("alice", "wrong-password")

    ok, message, _ = auth.authenticate("alice", GOOD_PASSWORD)
    assert not ok, "the correct password must not work while locked"
    assert "lock" in message.lower()


def test_a_successful_login_clears_the_failure_counter(auth):
    user = make_user(auth)
    auth.authenticate("alice", "wrong-password")
    auth.authenticate("alice", GOOD_PASSWORD)
    assert auth.get_user_by_id(user["id"])["failed_login_attempts"] == 0


def test_an_admin_reset_unlocks_the_account(auth):
    """The way back in when a user has locked themselves out."""
    user = make_user(auth)
    for _ in range(6):
        auth.authenticate("alice", "wrong-password")
    assert auth.authenticate("alice", GOOD_PASSWORD)[0] is False

    auth.update_user_password(user["id"], OTHER_PASSWORD)
    auth._reset_failed_attempts(user["id"])

    assert auth.authenticate("alice", OTHER_PASSWORD)[0] is True


# ── login history ────────────────────────────────────────────────────────────

def test_the_login_history_records_the_client(auth):
    make_user(auth)
    auth.authenticate("alice", GOOD_PASSWORD,
                      ip_address="192.0.2.10", user_agent="TestAgent/1.0")

    entry = auth.get_login_history(limit=5)[0]
    assert entry["ip_address"] == "192.0.2.10"
    assert entry["user_agent"] == "TestAgent/1.0"


def test_failed_attempts_are_recorded_too(auth):
    make_user(auth)
    auth.authenticate("alice", "wrong-password", ip_address="192.0.2.11")
    assert any(not e["success"] for e in auth.get_login_history(limit=5))


# ── password change ──────────────────────────────────────────────────────────

def test_changing_the_password_invalidates_the_old_one(auth):
    user = make_user(auth)
    auth.update_user_password(user["id"], OTHER_PASSWORD)

    assert auth.authenticate("alice", GOOD_PASSWORD)[0] is False
    assert auth.authenticate("alice", OTHER_PASSWORD)[0] is True


def test_changing_the_password_clears_the_change_requirement(auth):
    user = make_user(auth)
    auth.update_user_password(user["id"], OTHER_PASSWORD,
                              clear_password_change_requirement=True)
    assert not auth.get_user_by_id(user["id"])["requires_password_change"]


def test_a_weak_new_password_is_refused(auth):
    user = make_user(auth)
    ok, _ = auth.update_user_password(user["id"], "abc")
    assert not ok
    assert auth.authenticate("alice", GOOD_PASSWORD)[0] is True


# ── user management ──────────────────────────────────────────────────────────

def test_deleting_a_user_removes_them(auth):
    user = make_user(auth)
    assert auth.delete_user(user["id"]) is True
    assert auth.get_user_by_username("alice") is None


def test_the_default_admin_must_change_its_password(auth):
    admin = auth.get_user_by_username("admin")
    assert admin is not None
    assert admin["requires_password_change"], (
        "a freshly created admin has a known or generated password"
    )
