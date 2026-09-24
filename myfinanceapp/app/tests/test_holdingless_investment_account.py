"""
An investment account with no holdings keeps its balance.

Since 2.1.0 an investment account's balance is the market value of its
holdings, set at every start and every recalculation. A gold account fed by
transfers holds nothing recorded on the Investments page, so that valuation
set it to zero, and net worth lost the gold. Such an account is now valued
from its own ledger; one with holdings is still valued from them.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_holdingless_investment_account.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase


@pytest.fixture
def path():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    yield f.name
    os.unlink(f.name)


@pytest.fixture
def db(path):
    database = FinanceDatabase(db_path=path)
    database.set_preference("display_currency", "EUR")
    return database


@pytest.fixture
def accounts(db):
    owner = db.get_owners()[0]["id"]
    new = lambda name, kind, balance: db.add_account({  # noqa: E731
        "name": name, "owner_id": owner, "balance": balance,
        "currency": "EUR", "account_type": kind})
    return {"cash": new("Checking", "checking", 5000.0),
            "gold": new("Main Gold", "investment", 0.0)}


def move(db, source, destination, amount, date="2026-09-05"):
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.name = 'Transfer' LIMIT 1").fetchone()
    db.add_transaction({
        "account_id": source, "amount": -amount, "transaction_date": date,
        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
        "description": "gold", "destinataire": "Main Gold",
        "is_transfer": True, "transfer_account_id": destination})


def balance(db, account_id):
    return next(a["balance"] for a in db.get_accounts() if a["id"] == account_id)


def test_a_transfer_in_raises_the_balance(db, accounts):
    move(db, accounts["cash"], accounts["gold"], 1000.0)
    assert balance(db, accounts["gold"]) == 1000.0


def test_the_balance_survives_a_restart(db, path, accounts):
    """The reported bug: every start re-valued the account at zero."""
    move(db, accounts["cash"], accounts["gold"], 1000.0)

    restarted = FinanceDatabase(db_path=path)

    assert balance(restarted, accounts["gold"]) == 1000.0
    assert restarted.get_net_worth()["net_worth"] == 5000.0


def test_the_balance_survives_a_recalculation(db, accounts):
    move(db, accounts["cash"], accounts["gold"], 1000.0)
    move(db, accounts["gold"], accounts["cash"], 200.0, date="2026-09-20")

    db.recalculate_all_balances()

    assert balance(db, accounts["gold"]) == 800.0
    assert balance(db, accounts["cash"]) == 4200.0


def test_a_zeroed_balance_is_repaired_at_start(db, path, accounts):
    """What an installed 2.1.0 to 2.3.0 left behind."""
    move(db, accounts["cash"], accounts["gold"], 1000.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET balance = 0 WHERE id = ?", (accounts["gold"],))

    assert balance(FinanceDatabase(db_path=path), accounts["gold"]) == 1000.0


def test_the_drift_check_covers_it(db, accounts):
    move(db, accounts["cash"], accounts["gold"], 1000.0)
    assert db.verify_balances() == []

    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET balance = 0 WHERE id = ?", (accounts["gold"],))

    assert [d["name"] for d in db.verify_balances()] == ["Main Gold"]


def test_an_account_with_holdings_is_still_valued_from_them(db, accounts):
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?",
                     (accounts["cash"], accounts["gold"]))
    holding = db.add_investment_holding({
        "account_id": accounts["gold"], "symbol": "4GLD", "name": "Xetra-Gold",
        "investment_type": "etf", "currency": "EUR", "quantity": 0, "average_cost": 0})
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "buy", "transaction_date": "2026-09-05",
        "shares": 10, "price_per_share": 70.0, "total_amount": 700.0,
        "fees": 0.0, "tax": 0.0, "currency": "EUR"})

    db.recalculate_all_balances()

    assert balance(db, accounts["gold"]) == 700.0
    assert balance(db, accounts["cash"]) == 4300.0
