"""
What each dashboard card counts, listed.

Clicking Monthly Income, Expenses, Savings or Invested opens the Transactions
page filtered on the card's own rule (`flow`). The list is only useful for
checking the card if it holds exactly what the card adds up, so these tests
pin each filter to the card's total on a month that mixes every kind of row:
salary, groceries, a refund, a transfer between own accounts, an investment
buy, money sent to the broker, money sent to a gold account (an investment
account with no holdings), and a row filed under Investments by hand.

Investing is never an expense, and savings are income - expenses: investing
is one use of what was saved, not something taken out of it.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_dashboard_flows.py -v
"""
import os
import sys
import tempfile

import pytest
from fastapi import HTTPException

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))
from database import FinanceDatabase

MONTH = {"start_date": "2026-03-01", "end_date": "2026-03-31"}


def ids_of(db, type_name, subtype_name):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.name = ? AND ts.name = ?", (type_name, subtype_name)).fetchone())


def expense_ids(db):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = 'expense' LIMIT 1").fetchone())


def add(db, account, amount, type_ids, payee, date="2026-03-10", **extra):
    return db.add_transaction({
        "account_id": account, "amount": amount, "transaction_date": date,
        "currency": "EUR", "type_id": type_ids[0], "subtype_id": type_ids[1],
        "description": payee, "destinataire": payee, **extra})


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    database.set_preference("display_currency", "EUR")
    yield database
    os.unlink(f.name)


@pytest.fixture
def month(db):
    owner = db.get_owners()[0]["id"]
    new = lambda name, kind: db.add_account({  # noqa: E731
        "name": name, "owner_id": owner, "balance": 5000.0,
        "currency": "EUR", "account_type": kind})
    cash, savings, broker = new("Cash", "checking"), new("Savings", "savings"), new("Broker", "investment")
    gold = new("Main Gold", "investment")
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))

    transfer = ids_of(db, "Transfer", "Between Accounts")
    add(db, cash, 2000.0, ids_of(db, "Salary", "Monthly Salary"), "Employer")
    add(db, cash, -50.0, expense_ids(db), "Lidl")
    add(db, cash, 10.0, expense_ids(db), "Lidl refund")
    add(db, cash, -300.0, transfer, "Savings", is_transfer=True, transfer_account_id=savings)
    add(db, cash, -500.0, transfer, "Broker", is_transfer=True, transfer_account_id=broker)
    add(db, cash, -250.0, transfer, "Main Gold", is_transfer=True, transfer_account_id=gold)
    add(db, cash, -200.0, ids_of(db, "Investments", "Securities Purchase"), "ETF plan")
    add(db, cash, -99.0, expense_ids(db), "Lidl", date="2026-04-02")   # another month

    holding = db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme Corp",
        "investment_type": "stock", "currency": "EUR", "quantity": 0, "average_cost": 0})
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "buy", "transaction_date": "2026-03-15",
        "shares": 10, "price_per_share": 10.0, "total_amount": 100.0,
        "fees": 1.0, "tax": 0.0, "currency": "EUR"})
    return {"cash": cash, "broker": broker, "gold": gold, "holding": holding}


def listed(db, flow):
    return sorted((t["destinataire"], t["amount"])
                  for t in db.get_transactions({**MONTH, "flow": flow}))


@pytest.fixture
def api(db):
    from api import transactions as transactions_api
    from api import investments as investments_api
    transactions_api.db = db
    investments_api.db = db
    return transactions_api, investments_api


def summary(api, **params):
    return api[0].get_transaction_summary(**{**MONTH, **params}, current_user=None)


# ── each card lists what it adds up ──────────────────────────────────────────

def test_income_lists_the_positive_non_transfer_rows(db, month):
    assert listed(db, "income") == [("Employer", 2000.0), ("Lidl refund", 10.0)]


def test_expenses_list_the_negative_non_transfer_rows(db, month):
    assert listed(db, "expense") == [("Lidl", -50.0)]


def test_investing_is_never_an_expense(db, month):
    invested = set(listed(db, "invested")) | set(listed(db, "investment_transfers"))
    assert invested and not invested & set(listed(db, "expense"))


def test_savings_list_income_and_expenses_only(db, month):
    assert listed(db, "savings") == [("Employer", 2000.0), ("Lidl", -50.0), ("Lidl refund", 10.0)]


def test_the_lists_add_up_to_the_cards(api, db, month):
    card = summary(api)
    assert summary(api, flow="income")["total_amount"] == card["total_income"]
    assert -summary(api, flow="expense")["total_amount"] == card["total_expense"]
    assert summary(api, flow="savings")["total_amount"] == card["net_change"] == 1960.0


def test_invested_lists_each_buy_and_each_transfer_into_gold(db, month):
    assert listed(db, "invested") == [("Acme Corp", -101.0), ("Main Gold", -250.0)]


def test_invested_adds_up_to_monthly_invested(api, db, month):
    card = api[1].get_monthly_summary(**MONTH, current_user=None)
    assert -summary(api, flow="invested")["total_amount"] == card["total_invested"] == 351.0
    assert (card["transfer_count"], card["total_transferred"]) == (1, 250.0)
    assert card["unlinked_buy_count"] == 0


def test_money_sent_to_investments_but_not_counted_is_listed_apart(db, month):
    """Transfer to the broker and the by-hand Investments row; not the transfer
    to savings, not the gold transfer (counted), not the buy's own cash leg,
    not the broker's incoming mirror."""
    assert listed(db, "investment_transfers") == [("Broker", -500.0), ("ETF plan", -200.0)]


def test_money_taken_out_of_gold_is_not_invested(db, month):
    add(db, month["gold"], -80.0, ids_of(db, "Transfer", "Between Accounts"), "Cash",
        is_transfer=True, transfer_account_id=month["cash"])
    assert ("Cash", -80.0) not in listed(db, "invested")


def test_once_gold_has_holdings_its_buys_count_instead(db, month):
    """Transfers into an account with holdings would double the buys they fund."""
    db.add_investment_holding({
        "account_id": month["gold"], "symbol": "XAU", "name": "Gold",
        "investment_type": "etf", "currency": "EUR", "quantity": 0, "average_cost": 0})
    assert ("Main Gold", -250.0) not in listed(db, "invested")
    assert ("Main Gold", -250.0) in listed(db, "investment_transfers")


def test_a_transfer_to_the_brokers_cash_account_counts_as_sent(db, month):
    savings_ids = ids_of(db, "Transfer", "Between Accounts")
    other = db.add_account({"name": "Other", "owner_id": db.get_owners()[0]["id"],
                            "balance": 100.0, "currency": "EUR", "account_type": "checking"})
    add(db, other, -40.0, savings_ids, "Cash", is_transfer=True, transfer_account_id=month["cash"])
    assert ("Cash", -40.0) in listed(db, "investment_transfers")


def test_counting_agrees_with_listing(db, month):
    for flow in ("income", "expense", "savings", "invested", "investment_transfers"):
        filters = {**MONTH, "flow": flow}
        assert db.count_transactions(filters) == len(db.get_transactions(filters)), flow


def test_a_buy_without_cash_transaction_is_reported(api, db, month):
    with db.db_connection(commit=True) as conn:
        conn.execute(
            "INSERT INTO investment_transactions (holding_id, transaction_type, transaction_date,"
            " shares, price_per_share, total_amount, fees, tax, currency)"
            " VALUES (?, 'buy', '2026-03-20', 1, 50, 50, 0, 0, 'EUR')", (month["holding"],))

    card = api[1].get_monthly_summary(**MONTH, current_user=None)

    assert card["buy_count"] == 2
    assert card["unlinked_buy_count"] == 1


def test_an_unknown_flow_is_refused(api, month):
    with pytest.raises(HTTPException) as err:
        summary(api, flow="everything")
    assert err.value.status_code == 400
