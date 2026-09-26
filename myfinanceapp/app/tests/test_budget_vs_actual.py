"""
The budget card's spending for a month.

Three ways it disagreed with the rest of the app:
- the month stopped at "< last day", so the last day of every month never
  counted towards any budget;
- it added absolute amounts, so a refund counted as more spending;
- it used the account's owner even when a transaction names its own, so a
  budget set for one person missed what was assigned to them.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_budget_vs_actual.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    database.set_preference("display_currency", "EUR")
    yield database
    os.unlink(f.name)


@pytest.fixture
def setup(db):
    owners = [o["id"] for o in db.get_owners()]
    account = db.add_account({"name": "Checking", "owner_id": owners[0], "balance": 5000.0,
                              "currency": "EUR", "account_type": "checking"})
    with db.db_connection(commit=False) as conn:
        food = tuple(conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.name = 'Food' LIMIT 1").fetchone())
    return {"account": account, "food": food, "owners": owners}


def spend(db, setup, amount, day, owner=None):
    db.add_transaction({
        "account_id": setup["account"], "amount": amount, "transaction_date": day,
        "currency": "EUR", "type_id": setup["food"][0], "subtype_id": setup["food"][1],
        "description": "groceries", "destinataire": "Lidl", "owner_id": owner})


def budget(db, setup, amount=300.0, owner=None):
    db.add_budget({"type_id": setup["food"][0], "amount": amount, "currency": "EUR",
                   "period": "monthly", "start_date": "2026-01-01", "owner_id": owner})


def actual(db, owner=None):
    rows = db.get_budget_vs_actual(2026, 3)["categories"]
    return next(r["actual"] for r in rows if r["owner_id"] == owner)


def test_the_last_day_of_the_month_counts(db, setup):
    budget(db, setup)
    spend(db, setup, -40.0, "2026-03-30")
    spend(db, setup, -60.0, "2026-03-31")
    spend(db, setup, -99.0, "2026-04-01")   # next month
    assert actual(db) == 100.0


def test_a_refund_reduces_spending(db, setup):
    budget(db, setup)
    spend(db, setup, -100.0, "2026-03-10")
    spend(db, setup, 30.0, "2026-03-12")
    assert actual(db) == 70.0


def test_more_refunded_than_spent_leaves_nothing_spent(db, setup):
    budget(db, setup)
    spend(db, setup, 30.0, "2026-03-12")
    assert actual(db) == 0.0


def test_a_transaction_assigned_to_another_owner_counts_for_them(db, setup):
    first, second = setup["owners"][:2]
    budget(db, setup, owner=first)
    budget(db, setup, owner=second)
    spend(db, setup, -50.0, "2026-03-10")                 # account owner: first
    spend(db, setup, -80.0, "2026-03-11", owner=second)   # assigned to second

    assert actual(db, owner=first) == 50.0
    assert actual(db, owner=second) == 80.0
