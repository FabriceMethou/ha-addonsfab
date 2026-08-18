"""
What an account really has free.

An envelope earmarks money that never leaves the account, so a balance of 1000
says nothing about how much of it is already promised. Nothing stopped reserving
2000 against a 500 account, and several envelopes could each claim the same euro.

Reserving ahead of money arriving is a legitimate way to plan, so this warns
rather than refuses — but it says so.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_envelope_allocations.py -v
"""
import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))
from database import FinanceDatabase


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


@pytest.fixture
def savings(db):
    return db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                           "balance": 1000.0, "currency": "EUR",
                           "account_type": "savings"})


def envelope(db, name, target=5000.0):
    return db.add_envelope({"name": name, "target_amount": target, "current_amount": 0.0})


def allocate(db, envelope_id, account_id, amount, date="2026-01-10"):
    return db.add_envelope_transaction({
        "envelope_id": envelope_id, "amount": amount, "transaction_date": date,
        "account_id": account_id, "description": "allocation"})


def account_row(db, account_id):
    return next(a for a in db.get_envelope_allocations_by_account()
                if a["account_id"] == account_id)


# ── what is free ─────────────────────────────────────────────────────────────

def test_an_untouched_account_is_entirely_free(db, savings):
    row = account_row(db, savings)
    assert row["balance"] == 1000.0
    assert row["allocated"] == 0
    assert row["available"] == 1000.0


def test_reserving_reduces_what_is_available(db, savings):
    allocate(db, envelope(db, "Holiday"), savings, 300.0)
    row = account_row(db, savings)
    assert row["allocated"] == 300.0
    assert row["available"] == 700.0
    assert row["over_allocated"] is False


def test_several_envelopes_add_up(db, savings):
    allocate(db, envelope(db, "Holiday"), savings, 300.0)
    allocate(db, envelope(db, "Car"), savings, 250.0)
    assert account_row(db, savings)["available"] == 450.0


def test_taking_money_back_frees_it_again(db, savings):
    holiday = envelope(db, "Holiday")
    allocate(db, holiday, savings, 300.0)
    allocate(db, holiday, savings, -100.0, date="2026-02-01")
    assert account_row(db, savings)["allocated"] == 200.0


def test_over_allocation_is_visible(db, savings):
    allocate(db, envelope(db, "Ambitious"), savings, 2000.0)
    row = account_row(db, savings)
    assert row["over_allocated"] is True
    assert row["available"] == -1000.0


# ── who reserved what ────────────────────────────────────────────────────────

def test_the_detail_says_which_envelope_holds_what(db, savings):
    allocate(db, envelope(db, "Holiday"), savings, 300.0)
    allocate(db, envelope(db, "Car"), savings, 250.0)

    detail = {d["envelope_name"]: d["allocated"] for d in db.get_envelope_allocations_detail()}
    assert detail == {"Holiday": 300.0, "Car": 250.0}


def test_the_detail_can_be_narrowed_to_one_account(db, savings):
    other = db.add_account({"name": "Current", "owner_id": db.get_owners()[0]["id"],
                            "balance": 500.0, "currency": "EUR",
                            "account_type": "checking"})
    allocate(db, envelope(db, "Holiday"), savings, 300.0)
    allocate(db, envelope(db, "Car"), other, 100.0)

    names = {d["envelope_name"] for d in db.get_envelope_allocations_detail(savings)}
    assert names == {"Holiday"}


# ── the warning ──────────────────────────────────────────────────────────────

def test_an_allocation_within_the_balance_says_nothing(db, savings):
    assert db.check_envelope_allocation(savings, 400.0) is None


def test_an_allocation_beyond_the_balance_warns(db, savings):
    message = db.check_envelope_allocation(savings, 1500.0)
    assert message and "free" in message


def test_the_warning_counts_what_is_already_reserved(db, savings):
    """400 is fine on its own, but not once 800 is already spoken for."""
    allocate(db, envelope(db, "Holiday"), savings, 800.0)
    assert db.check_envelope_allocation(savings, 400.0) is not None


def test_taking_money_out_never_warns(db, savings):
    assert db.check_envelope_allocation(savings, -500.0) is None


def test_an_allocation_with_no_account_cannot_be_checked(db):
    assert db.check_envelope_allocation(None, 1000.0) is None


def test_the_endpoint_returns_the_warning_but_still_allocates(db, savings):
    from api import envelopes as envelopes_api
    envelopes_api.db = db

    class Payload:
        pass
    payload = Payload()
    payload.envelope_id = envelope(db, "Ambitious")
    payload.amount = 2000.0
    payload.account_id = savings
    payload.date = "2026-01-10"
    payload.description = "planning ahead"
    payload.transaction_id = None

    result = envelopes_api.add_envelope_transaction(payload, current_user=None)

    assert result["transaction_id"], "planning beyond the balance stays allowed"
    assert any("free" in w for w in result["warnings"])
