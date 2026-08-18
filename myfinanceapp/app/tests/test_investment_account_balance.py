"""
An investment account's balance is its portfolio's market value.

Cash movements for a trade land on the *linked* cash account; the investment
account itself holds securities, not money. Its balance column was never
updated, so it sat at zero and net worth — the sum of account balances minus
debts — simply did not see the portfolio. Buying made you poorer on paper and a
price rise was invisible until you sold.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_investment_account_balance.py -v
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
    database.set_preference("dashboard_currency", "EUR")
    database.set_preference("display_currency", "EUR")
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


def balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        return round(conn.execute(
            "SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()[0], 2)


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


# ── the balance follows the portfolio ────────────────────────────────────────

def test_buying_moves_value_it_does_not_destroy_it(portfolio, db):
    """The headline symptom: buying used to reduce net worth by the amount spent."""
    before = db.get_net_worth()["net_worth"]

    buy(db, portfolio["holding"], 10, 100.0)

    assert balance(db, portfolio["cash"]) == 9000.0
    assert balance(db, portfolio["broker"]) == 1000.0
    assert round(db.get_net_worth()["net_worth"], 2) == round(before, 2)


def test_a_price_rise_raises_net_worth(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    before = db.get_net_worth()["net_worth"]

    db.update_holding_price(portfolio["holding"], 130.0)

    assert balance(db, portfolio["broker"]) == 1300.0
    assert round(db.get_net_worth()["net_worth"] - before, 2) == 300.0


def test_a_price_fall_lowers_net_worth(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    db.update_holding_price(portfolio["holding"], 70.0)
    assert balance(db, portfolio["broker"]) == 700.0


def test_selling_returns_value_to_cash(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    db.update_holding_price(portfolio["holding"], 130.0)

    sell(db, portfolio["holding"], 10, 130.0)

    assert balance(db, portfolio["broker"]) == 0.0, "nothing is held any more"
    assert balance(db, portfolio["cash"]) == 10300.0
    assert round(db.get_net_worth()["net_worth"], 2) == 10300.0


def test_selling_part_leaves_the_rest_valued(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    db.update_holding_price(portfolio["holding"], 130.0)

    sell(db, portfolio["holding"], 4, 130.0)

    assert balance(db, portfolio["broker"]) == 780.0, "6 shares still held at 130"


def test_several_holdings_add_up(portfolio, db):
    second = db.add_investment_holding({
        "account_id": portfolio["broker"], "symbol": "BETA", "name": "Beta Ltd",
        "investment_type": "stock", "currency": "EUR", "quantity": 0, "average_cost": 0})

    buy(db, portfolio["holding"], 10, 100.0)
    buy(db, second, 5, 40.0)

    assert balance(db, portfolio["broker"]) == 1200.0


def test_deleting_a_purchase_unwinds_both_sides(portfolio, db):
    txn = buy(db, portfolio["holding"], 10, 100.0)
    db.delete_investment_transaction(txn)

    assert balance(db, portfolio["cash"]) == 10000.0
    assert balance(db, portfolio["broker"]) == 0.0


def test_deleting_a_holding_empties_the_account(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    db.delete_investment_holding(portfolio["holding"])

    assert balance(db, portfolio["broker"]) == 0.0
    assert balance(db, portfolio["cash"]) == 10000.0


# ── consistency checks must understand the new rule ──────────────────────────

def test_recalculating_balances_keeps_the_portfolio_valued(portfolio, db):
    """recalculate_all_balances replays transactions; the broker has none."""
    buy(db, portfolio["holding"], 10, 100.0)
    db.update_holding_price(portfolio["holding"], 130.0)

    db.recalculate_all_balances()

    assert balance(db, portfolio["broker"]) == 1300.0, (
        "rebuilding from the ledger must not wipe the portfolio's value"
    )
    assert balance(db, portfolio["cash"]) == 9000.0


def test_no_drift_is_reported_for_an_investment_account(portfolio, db):
    buy(db, portfolio["holding"], 10, 100.0)
    db.update_holding_price(portfolio["holding"], 130.0)

    drift = db.verify_balances()
    assert drift == [], f"an investment account is not measured against transactions: {drift}"


# ── the trend must see the portfolio too ─────────────────────────────────────

def test_the_net_worth_trend_includes_the_portfolio(portfolio, db):
    """The trend rebuilds each account by replaying its transactions, and an
    investment account has none — so it reported the portfolio as worth zero
    while the current net worth counted it in full."""
    buy(db, portfolio["holding"], 10, 100.0, date="2026-01-05")
    db.update_holding_price(portfolio["holding"], 130.0)

    current = db.get_net_worth()["net_worth"]
    trend = db.get_net_worth_trend(start_date="2026-01-01", end_date="2026-12-31")
    latest = trend["data"][-1]

    assert round(latest["net_worth"], 2) == round(current, 2), (
        "the last point of the trend should agree with net worth today"
    )


def test_the_trend_values_what_was_held_at_the_time(portfolio, db):
    """Shares bought in March are not part of February's wealth."""
    buy(db, portfolio["holding"], 10, 100.0, date="2026-03-10")
    db.update_holding_price(portfolio["holding"], 100.0)

    trend = db.get_net_worth_trend(start_date="2026-01-01", end_date="2026-04-30")
    points = trend["data"]
    by_date = {p["date"]: p for p in points}

    february = next((p for d, p in by_date.items() if d.startswith("2026-02")), None)
    april = next((p for d, p in by_date.items() if d.startswith("2026-04")), None)

    if february:
        assert round(february["assets"], 2) == 10000.0, "nothing held yet in February"
    if april:
        assert round(april["assets"], 2) == 10000.0, "cash down 1000, portfolio up 1000"


# ── debts appear when contracted, not when payments start ────────────────────

def test_a_debt_counts_before_its_first_payment(db):
    """start_date is when instalments begin, not when the money was borrowed.

    Skipping debts whose first payment is still ahead made the trend disagree
    with current net worth by the whole loan — a car bought in January but
    repaid from October simply did not exist on the chart.
    """
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 10000.0,
                           "currency": "EUR", "account_type": "checking"})
    db.add_debt({
        "name": "Car loan", "principal_amount": 20000.0, "current_balance": 20000.0,
        "interest_rate": 3.0, "interest_type": "simple", "monthly_payment": 300.0,
        "payment_day": 1, "currency": "EUR", "linked_account_id": cash,
        # Contracted now, first instalment far in the future.
        "start_date": "2027-10-01"})

    current = db.get_net_worth()
    trend = db.get_net_worth_trend(start_date="2026-01-01", end_date="2026-12-31")
    latest = trend["data"][-1]

    assert round(latest["debts"], 2) == round(current["total_debts"], 2), (
        "the trend must owe the same as today's net worth"
    )
    assert round(latest["net_worth"], 2) == round(current["net_worth"], 2)
