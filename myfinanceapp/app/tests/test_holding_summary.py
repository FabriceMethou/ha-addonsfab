"""
Per-holding cost basis and gains.

calculate_holding_summary() computes exactly what the rest of the app is
missing — cost basis, unrealised gain, realised gain — and has been raising
KeyError since securities were split out of investment_holdings. It is the
building block for showing a portfolio in net worth (L-01) and for booking only
the gain as income on a sale (L-02), so it gets pinned first.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_holding_summary.py -v
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
def holding(db):
    """A cash account, an investment account drawing on it, and one position."""
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 100000.0,
                           "currency": "EUR", "account_type": "checking"})
    broker = db.add_account({"name": "Broker", "owner_id": owner, "balance": 0.0,
                             "currency": "EUR", "account_type": "investment"})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))
    return db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme Corp",
        "investment_type": "stock", "currency": "EUR", "quantity": 0, "average_cost": 0,
    })


def buy(db, holding_id, shares, price, fees=0.0, date="2026-01-05"):
    return db.add_investment_transaction({
        "holding_id": holding_id, "transaction_type": "buy", "transaction_date": date,
        "shares": shares, "price_per_share": price, "total_amount": shares * price,
        "fees": fees, "tax": 0.0, "currency": "EUR"})


def sell(db, holding_id, shares, price, fees=0.0, date="2026-02-05"):
    return db.add_investment_transaction({
        "holding_id": holding_id, "transaction_type": "sell", "transaction_date": date,
        "shares": shares, "price_per_share": price, "total_amount": shares * price,
        "fees": fees, "tax": 0.0, "currency": "EUR"})


# ── it runs at all ───────────────────────────────────────────────────────────

def test_the_summary_can_be_computed(db, holding):
    """symbol, name and investment_type live on securities, not on the holding."""
    buy(db, holding, 10, 100.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["symbol"] == "ACME"
    assert summary["name"] == "Acme Corp"
    assert summary["investment_type"] == "stock"


def test_an_untouched_holding_summarises_to_zero(db, holding):
    summary = db.calculate_holding_summary(holding)
    assert summary["total_shares"] == 0
    assert summary["current_value"] == 0
    assert summary["unrealized_gains"] == 0


# ── cost basis ───────────────────────────────────────────────────────────────

def test_buying_builds_the_cost_basis(db, holding):
    buy(db, holding, 10, 100.0, fees=5.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["total_shares"] == 10
    assert summary["total_cost"] == 1005.0, "fees are part of what the position cost"
    assert summary["avg_cost_per_share"] == 100.5


def test_two_purchases_average_out(db, holding):
    buy(db, holding, 10, 100.0, date="2026-01-05")
    buy(db, holding, 10, 120.0, date="2026-01-20")
    summary = db.calculate_holding_summary(holding)
    assert summary["total_shares"] == 20
    assert summary["total_cost"] == 2200.0
    assert summary["avg_cost_per_share"] == 110.0


# ── unrealised gain ──────────────────────────────────────────────────────────

def test_a_price_rise_shows_as_an_unrealised_gain(db, holding):
    buy(db, holding, 10, 100.0)
    db.update_holding_price(holding, 130.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["current_value"] == 1300.0
    assert summary["unrealized_gains"] == 300.0


def test_a_price_fall_shows_as_an_unrealised_loss(db, holding):
    buy(db, holding, 10, 100.0)
    db.update_holding_price(holding, 80.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["unrealized_gains"] == -200.0


# ── realised gain ────────────────────────────────────────────────────────────

def test_selling_realises_the_gain_not_the_proceeds(db, holding):
    """The whole point of L-02: 1300 received on a 1000 position is a 300 gain."""
    buy(db, holding, 10, 100.0)
    sell(db, holding, 10, 130.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["total_shares"] == 0
    assert summary["realized_gains"] == 300.0


def test_selling_part_of_a_position_realises_part_of_the_gain(db, holding):
    buy(db, holding, 10, 100.0)
    sell(db, holding, 4, 130.0)
    summary = db.calculate_holding_summary(holding)
    assert summary["total_shares"] == 6
    assert summary["realized_gains"] == 120.0, "4 shares bought at 100, sold at 130"
    assert summary["total_cost"] == 600.0, "the remaining 6 shares still cost 100 each"


def test_selling_at_a_loss_is_negative(db, holding):
    buy(db, holding, 10, 100.0)
    sell(db, holding, 10, 70.0)
    assert db.calculate_holding_summary(holding)["realized_gains"] == -300.0


def test_fees_reduce_the_realised_gain(db, holding):
    buy(db, holding, 10, 100.0)
    sell(db, holding, 10, 130.0, fees=20.0)
    assert db.calculate_holding_summary(holding)["realized_gains"] == 280.0


# ── dividends ────────────────────────────────────────────────────────────────

def test_dividends_are_counted_separately_from_gains(db, holding):
    buy(db, holding, 10, 100.0)
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "dividend",
        "transaction_date": "2026-03-01", "shares": 0, "price_per_share": 0,
        "total_amount": 45.0, "fees": 0.0, "tax": 0.0, "currency": "EUR"})
    summary = db.calculate_holding_summary(holding)
    assert summary["total_dividends"] == 45.0
    assert summary["realized_gains"] == 0, "a dividend is income, not a capital gain"


def test_the_total_return_adds_the_three_components(db, holding):
    buy(db, holding, 10, 100.0)
    sell(db, holding, 4, 130.0)
    db.update_holding_price(holding, 110.0)
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "dividend",
        "transaction_date": "2026-03-01", "shares": 0, "price_per_share": 0,
        "total_amount": 30.0, "fees": 0.0, "tax": 0.0, "currency": "EUR"})

    summary = db.calculate_holding_summary(holding)
    assert summary["total_return"] == pytest.approx(
        summary["unrealized_gains"] + summary["realized_gains"] + summary["total_dividends"]
    )
