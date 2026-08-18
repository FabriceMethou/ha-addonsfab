"""
Debt payments: what a payment costs, and which debt it belongs to.

Two problems, one code path. A 200 payment on a loan was booked as a single
200 expense, but only the interest is a cost — the rest reduces the debt, which
raises net worth. And every payment landed under a generic 'Debt → Payment'
subtype, even though add_debt() already creates a subtype named after each debt.

One entry by the user still produces one payment; the split happens underneath.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_debt_payments.py -v
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
    database.set_preference("display_currency", "EUR")
    yield database
    os.unlink(f.name)


@pytest.fixture
def setup(db):
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 10000.0,
                           "currency": "EUR", "account_type": "checking"})
    debt = db.add_debt({
        "name": "Car loan", "principal_amount": 5000.0, "current_balance": 5000.0,
        "interest_rate": 3.0, "interest_type": "simple", "monthly_payment": 200.0,
        "payment_day": 1, "currency": "EUR", "linked_account_id": cash,
        "start_date": "2026-01-01"})
    return {"cash": cash, "debt": debt}


def pay(db, debt_id, amount, kind="regular", date="2026-02-01"):
    from api import debts as debts_api
    debts_api.db = db

    class Payment:
        pass
    payment = Payment()
    payment.debt_id = debt_id
    payment.amount = amount
    payment.payment_date = date
    payment.payment_type = kind
    payment.notes = None
    return debts_api.add_debt_payment(payment, current_user=None)


def rows(db, date="2026-02-01"):
    return [t for t in db.get_transactions() if t["transaction_date"] == date]


def balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        return round(conn.execute(
            "SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()[0], 2)


# ── only the interest is a cost ──────────────────────────────────────────────

def test_one_entry_still_debits_the_full_payment(setup, db):
    pay(db, setup["debt"], 200.0)
    assert balance(db, setup["cash"]) == 9800.0


def test_the_rows_written_sum_to_the_payment(setup, db):
    pay(db, setup["debt"], 200.0)
    assert round(sum(t["amount"] for t in rows(db)), 2) == -200.0


def test_only_the_interest_counts_as_an_expense(setup, db):
    pay(db, setup["debt"], 200.0)
    summary = db.get_monthly_summary(2026, 2)
    assert round(summary["total_expenses"], 2) == 12.50, (
        "187.50 of the 200 reduced the debt — that is not spending"
    )


def test_the_principal_row_is_a_transfer(setup, db):
    pay(db, setup["debt"], 200.0)
    principal = [t for t in rows(db) if round(t["amount"], 2) == -187.50]
    assert principal, "the principal should be its own row"
    assert principal[0]["category"] == "transfer"


def test_net_worth_only_drops_by_the_interest(setup, db):
    before = db.get_net_worth()["net_worth"]
    pay(db, setup["debt"], 200.0)
    assert round(before - db.get_net_worth()["net_worth"], 2) == 12.50


def test_an_extra_payment_is_all_principal(setup, db):
    pay(db, setup["debt"], 500.0, kind="extra", date="2026-02-10")
    summary = db.get_monthly_summary(2026, 2)
    assert round(summary["total_expenses"], 2) == 0.0
    assert balance(db, setup["cash"]) == 9500.0


# ── each debt is its own subcategory ─────────────────────────────────────────

def test_a_payment_is_filed_under_its_own_debt(setup, db):
    pay(db, setup["debt"], 200.0)
    assert all(t["subtype_name"].startswith("Car loan") for t in rows(db)), (
        f"expected the debt's own subtype, got {[t['subtype_name'] for t in rows(db)]}"
    )


def test_extra_payments_have_their_own_subcategory(setup, db):
    pay(db, setup["debt"], 500.0, kind="extra", date="2026-02-10")
    names = {t["subtype_name"] for t in rows(db, "2026-02-10")}
    assert names == {"Car loan (extra)"}


def test_two_debts_do_not_share_a_subcategory(setup, db):
    second = db.add_debt({
        "name": "Home loan", "principal_amount": 8000.0, "current_balance": 8000.0,
        "interest_rate": 2.0, "interest_type": "simple", "monthly_payment": 300.0,
        "payment_day": 5, "currency": "EUR", "linked_account_id": setup["cash"],
        "start_date": "2026-01-01"})

    pay(db, setup["debt"], 200.0, date="2026-02-01")
    pay(db, second, 300.0, date="2026-02-05")

    assert {t["subtype_name"] for t in rows(db, "2026-02-01")} == {"Car loan"}
    assert {t["subtype_name"] for t in rows(db, "2026-02-05")} == {"Home loan"}


def test_renaming_a_debt_renames_its_subcategories(setup, db):
    pay(db, setup["debt"], 200.0)
    db.update_debt(setup["debt"], {"name": "Vehicle loan"})

    assert {t["subtype_name"] for t in rows(db)} == {"Vehicle loan"}


# ── a payment can be undone ──────────────────────────────────────────────────

def test_deleting_a_payment_restores_everything(setup, db):
    payment_id = db.get_debt_payments(setup["debt"])
    pay(db, setup["debt"], 200.0)
    payment_id = db.get_debt_payments(setup["debt"])[0]["id"]

    assert db.delete_debt_payment(payment_id) is True

    assert balance(db, setup["cash"]) == 10000.0
    assert db.get_debt(setup["debt"])["current_balance"] == 5000.0
    assert rows(db) == [], "both ledger rows must go"
    assert db.get_debt_payments(setup["debt"]) == []


def test_deleting_an_unknown_payment_is_refused(setup, db):
    assert db.delete_debt_payment(9999) is False
