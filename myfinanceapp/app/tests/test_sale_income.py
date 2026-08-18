"""
A sale returns capital; only the gain is income.

Selling was booked as `Investment Income → Sale Proceeds` for the full amount
received, so selling 1300 of shares bought for 1000 recorded 1300 of income.
The 1000 is your own money coming back. Purchases were already treated as
transfers — the two halves of the same operation followed opposite conventions.

The cash movement is unchanged: the two rows written for a sale always sum to
what actually landed in the account.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_sale_income.py -v
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
    database.set_preference("dashboard_currency", "EUR")
    yield database
    os.unlink(f.name)


@pytest.fixture
def portfolio(db):
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 10000.0,
                           "currency": "EUR", "account_type": "checking"})
    broker = db.add_account({"name": "Broker", "owner_id": owner, "balance": 0.0,
                             "currency": "EUR", "account_type": "investment"})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))
    holding = db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme Corp",
        "investment_type": "stock", "currency": "EUR", "quantity": 0, "average_cost": 0})
    return {"cash": cash, "broker": broker, "holding": holding}


def buy(db, holding_id, shares, price, fees=0.0, date="2026-01-05"):
    return db.add_investment_transaction({
        "holding_id": holding_id, "transaction_type": "buy", "transaction_date": date,
        "shares": shares, "price_per_share": price, "total_amount": shares * price,
        "fees": fees, "tax": 0.0, "currency": "EUR"})


def sell(db, holding_id, shares, price, fees=0.0, date="2026-01-20"):
    return db.add_investment_transaction({
        "holding_id": holding_id, "transaction_type": "sell", "transaction_date": date,
        "shares": shares, "price_per_share": price, "total_amount": shares * price,
        "fees": fees, "tax": 0.0, "currency": "EUR"})


def balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        return round(conn.execute(
            "SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()[0], 2)


def month(db):
    return db.get_monthly_summary(2026, 1)


# ── the headline ─────────────────────────────────────────────────────────────

def test_only_the_gain_counts_as_income(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 130.0)

    assert round(month(db)["total_income"], 2) == 300.0, (
        "1300 was received but 1000 of it was the capital going back out"
    )


def test_the_cash_received_is_unchanged(portfolio, db):
    """Splitting the booking must not change what landed in the account."""
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 130.0)

    assert balance(db, portfolio["cash"]) == 10300.0


def test_a_sale_writes_rows_that_sum_to_the_proceeds(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 130.0)

    rows = [t for t in db.get_transactions() if t["transaction_date"] == "2026-01-20"]
    assert round(sum(t["amount"] for t in rows), 2) == 1300.0


def test_the_capital_half_is_not_income(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 130.0)

    rows = [t for t in db.get_transactions() if t["transaction_date"] == "2026-01-20"]
    capital = [t for t in rows if round(t["amount"], 2) == 1000.0]
    assert capital, "the returned capital should be its own row"
    assert capital[0]["category"] == "transfer"


# ── losses ───────────────────────────────────────────────────────────────────

def test_selling_at_a_loss_produces_no_income(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 70.0)

    summary = month(db)
    assert round(summary["total_income"], 2) == 0.0
    assert balance(db, portfolio["cash"]) == 9700.0


def test_a_realised_loss_is_recorded(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 70.0)

    rows = [t for t in db.get_transactions() if t["transaction_date"] == "2026-01-20"]
    assert round(sum(t["amount"] for t in rows), 2) == 700.0
    assert any(round(t["amount"], 2) == -300.0 for t in rows), "the loss is its own row"


# ── partial sales and fees ───────────────────────────────────────────────────

def test_a_partial_sale_only_returns_the_capital_sold(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 4, 130.0)

    assert round(month(db)["total_income"], 2) == 120.0
    assert balance(db, portfolio["cash"]) == 9520.0


def test_fees_reduce_the_gain_not_the_capital(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    sell(db, portfolio["holding"], 10, 130.0, fees=20.0)

    assert round(month(db)["total_income"], 2) == 280.0
    assert balance(db, portfolio["cash"]) == 10280.0


# ── the other operations are untouched ───────────────────────────────────────

def test_a_purchase_is_still_neutral(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    summary = month(db)
    assert round(summary["total_income"], 2) == 0.0
    assert round(summary["total_expenses"], 2) == 0.0


def test_a_dividend_is_still_income(portfolio, db):
    """A dividend is genuinely earned — it was classified correctly all along."""
    buy(db, portfolio["holding"], 10, 100.0)
    db.add_investment_transaction({
        "holding_id": portfolio["holding"], "transaction_type": "dividend",
        "transaction_date": "2026-01-25", "shares": 0, "price_per_share": 0,
        "total_amount": 45.0, "fees": 0.0, "tax": 0.0, "currency": "EUR"})

    assert round(month(db)["total_income"], 2) == 45.0


def test_deleting_a_sale_removes_every_row_it_wrote(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    txn = sell(db, portfolio["holding"], 10, 130.0)

    db.delete_investment_transaction(txn)

    assert balance(db, portfolio["cash"]) == 9000.0
    remaining = [t for t in db.get_transactions() if t["transaction_date"] == "2026-01-20"]
    assert remaining == [], "both rows of the sale must go"
