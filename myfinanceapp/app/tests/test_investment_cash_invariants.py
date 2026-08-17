"""
Cash invariants for investment transactions.

An investment transaction writes two records: the investment_transactions row,
and a linked row in `transactions` recording the cash movement in the account
the investment account draws from. The two must agree in sign and magnitude, or
deleting the investment reverses the cash the wrong way.

CLAUDE.md records this exact failure ("using abs(cash_impact) when storing
linked transactions causes balance reversals to go in the wrong direction") and
scripts/fix_investment_transaction_signs.py exists to repair it after the fact.
These tests pin the property so it cannot come back silently.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_investment_cash_invariants.py -v
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
    yield database
    os.unlink(f.name)


@pytest.fixture
def portfolio(db):
    """A cash account, an investment account drawing on it, and one holding."""
    owner = db.get_owners()[0]["id"]

    cash = db.add_account({
        "name": "Checking", "owner_id": owner, "balance": 10000.0,
        "currency": "EUR", "account_type": "checking",
    })
    investment = db.add_account({
        "name": "Broker", "owner_id": owner, "balance": 0.0,
        "currency": "EUR", "account_type": "investment",
    })
    # The investment account draws its cash from the checking account.
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?",
                     (cash, investment))

    holding = db.add_investment_holding({
        "account_id": investment,
        "symbol": "ACME",
        "name": "Acme Corp",
        "investment_type": "stock",
        "currency": "EUR",
        "quantity": 0,
        "average_cost": 0,
    })
    return {"cash": cash, "investment": investment, "holding": holding}


def balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        return round(conn.execute(
            "SELECT balance FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()[0], 2)


def linked_rows(db, account_id):
    with db.db_connection(commit=False) as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, amount FROM transactions WHERE account_id = ? ORDER BY id",
            (account_id,)
        ).fetchall()]


def ledger_sum(db, account_id):
    with db.db_connection(commit=False) as conn:
        opening = conn.execute(
            "SELECT COALESCE(opening_balance, 0) FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()[0]
        total = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ? "
            "AND confirmed = 1 AND COALESCE(is_historical, 0) = 0", (account_id,)
        ).fetchone()[0]
        return round(opening + total, 2)


def buy(db, portfolio, shares=10, price=100.0, fees=5.0, tax=0.0):
    return db.add_investment_transaction({
        "holding_id": portfolio["holding"],
        "transaction_type": "buy",
        "transaction_date": "2026-01-15",
        "shares": shares,
        "price_per_share": price,
        "total_amount": shares * price,
        "fees": fees,
        "tax": tax,
        "currency": "EUR",
    })


# ── buying ───────────────────────────────────────────────────────────────────

def test_buying_removes_cash_including_fees(portfolio, db):
    buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    # 10000 - (1000 + 5) = 8995
    assert balance(db, portfolio["cash"]) == 8995.0


def test_the_linked_cash_row_is_negative_for_a_purchase(portfolio, db):
    """The sign is the whole point: abs() here reverses deletions later."""
    buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    rows = linked_rows(db, portfolio["cash"])
    assert len(rows) == 1
    assert rows[0]["amount"] == -1005.0, "a purchase must be stored as a negative amount"


def test_cash_balance_matches_its_ledger_after_a_purchase(portfolio, db):
    buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    assert balance(db, portfolio["cash"]) == ledger_sum(db, portfolio["cash"])


def test_tax_is_deducted_as_well(portfolio, db):
    buy(db, portfolio, shares=10, price=100.0, fees=5.0, tax=20.0)
    assert balance(db, portfolio["cash"]) == 8975.0


# ── deleting ─────────────────────────────────────────────────────────────────

def test_deleting_a_purchase_restores_the_cash(portfolio, db):
    txn = buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    assert balance(db, portfolio["cash"]) == 8995.0

    db.delete_investment_transaction(txn)

    assert balance(db, portfolio["cash"]) == 10000.0, "cash must come back, not double-debit"
    assert balance(db, portfolio["cash"]) == ledger_sum(db, portfolio["cash"])


def test_deleting_a_purchase_removes_the_linked_row(portfolio, db):
    txn = buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    db.delete_investment_transaction(txn)
    assert linked_rows(db, portfolio["cash"]) == []


def test_buy_then_delete_repeatedly_does_not_drift(portfolio, db):
    for _ in range(5):
        txn = buy(db, portfolio, shares=3, price=33.33, fees=1.11)
        db.delete_investment_transaction(txn)
    assert balance(db, portfolio["cash"]) == 10000.0


# ── selling ──────────────────────────────────────────────────────────────────

def test_selling_returns_cash_net_of_fees(portfolio, db):
    buy(db, portfolio, shares=10, price=100.0, fees=0.0)
    assert balance(db, portfolio["cash"]) == 9000.0

    db.add_investment_transaction({
        "holding_id": portfolio["holding"],
        "transaction_type": "sell",
        "transaction_date": "2026-02-15",
        "shares": 10,
        "price_per_share": 120.0,
        "total_amount": 1200.0,
        "fees": 10.0,
        "tax": 0.0,
        "currency": "EUR",
    })

    # 9000 + (1200 - 10) = 10190
    assert balance(db, portfolio["cash"]) == 10190.0
    assert balance(db, portfolio["cash"]) == ledger_sum(db, portfolio["cash"])


def test_deleting_a_holding_restores_all_its_cash(portfolio, db):
    """Deleting the whole position must unwind every transaction it carried."""
    buy(db, portfolio, shares=10, price=100.0, fees=5.0)
    buy(db, portfolio, shares=5, price=110.0, fees=2.0)
    assert balance(db, portfolio["cash"]) != 10000.0

    db.delete_investment_holding(portfolio["holding"])

    assert balance(db, portfolio["cash"]) == 10000.0
    assert linked_rows(db, portfolio["cash"]) == []
    assert balance(db, portfolio["cash"]) == ledger_sum(db, portfolio["cash"])


def test_validation_errors_reach_the_caller_as_ValueError(portfolio, db):
    """The API routers catch ValueError to answer 400.

    db_connection() must not repackage application errors as DatabaseError, or
    every bad request turns into a 500.
    """
    with pytest.raises(ValueError):
        db.add_investment_transaction({
            "holding_id": portfolio["holding"],
            "transaction_type": "not-a-real-type",
            "transaction_date": "2026-01-15",
            "shares": 1,
            "price_per_share": 1.0,
            "total_amount": 1.0,
            "fees": 0.0,
            "currency": "EUR",
        })


def test_a_failed_investment_transaction_leaves_cash_untouched(portfolio, db):
    """Two records and a balance update: all of it, or none."""
    before = balance(db, portfolio["cash"])
    with pytest.raises(Exception):
        db.add_investment_transaction({
            "holding_id": 99999,          # no such holding
            "transaction_type": "buy",
            "transaction_date": "2026-01-15",
            "shares": 10,
            "price_per_share": 100.0,
            "total_amount": 1000.0,
            "fees": 0.0,
            "currency": "EUR",
        })
    assert balance(db, portfolio["cash"]) == before
