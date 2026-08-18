"""
A balance check that leads somewhere.

Entering the real balance from a bank recorded the gap in balance_validations
and stopped there: the discrepancy was measured, then forgotten. Nothing offered
to rebuild the balance, and nothing connected it to the CSV reconciliation that
can actually find the missing transaction.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_balance_validation_followup.py -v
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
def account(db):
    return db.add_account({"name": "Cash", "owner_id": db.get_owners()[0]["id"],
                           "balance": 1000.0, "currency": "EUR",
                           "account_type": "checking"})


def nudge(db, account_id, amount):
    """Corrupt the counter the way a buggy write path would."""
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                     (amount, account_id))


def balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        return round(conn.execute(
            "SELECT balance FROM accounts WHERE id = ?", (account_id,)).fetchone()[0], 2)


# ── recalculating one account ────────────────────────────────────────────────

def test_recalculating_repairs_a_drifting_account(db, account):
    nudge(db, account, 42.50)
    assert balance(db, account) == 1042.50

    result = db.recalculate_account_balance(account)

    assert balance(db, account) == 1000.0
    assert result["adjustment"] == -42.50


def test_recalculating_a_correct_account_changes_nothing(db, account):
    result = db.recalculate_account_balance(account)
    assert result["adjustment"] == 0
    assert balance(db, account) == 1000.0


def test_recalculating_leaves_the_other_accounts_alone(db, account):
    other = db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                            "balance": 500.0, "currency": "EUR",
                            "account_type": "savings"})
    nudge(db, other, 99.0)

    db.recalculate_account_balance(account)

    assert balance(db, other) == 599.0, "only the account asked for should move"


def test_an_investment_account_is_repriced_not_replayed(db):
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 5000.0,
                           "currency": "EUR", "account_type": "checking"})
    broker = db.add_account({"name": "Broker", "owner_id": owner, "balance": 0.0,
                             "currency": "EUR", "account_type": "investment"})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))
    holding = db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme", "investment_type": "stock",
        "currency": "EUR", "quantity": 0, "average_cost": 0})
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "buy", "transaction_date": "2026-01-05",
        "shares": 10, "price_per_share": 100.0, "total_amount": 1000.0,
        "fees": 0.0, "tax": 0.0, "currency": "EUR"})

    db.recalculate_account_balance(broker)

    assert balance(db, broker) == 1000.0, "replaying transactions would have zeroed it"


def test_recalculating_an_unknown_account_is_refused(db):
    with pytest.raises(ValueError):
        db.recalculate_account_balance(9999)


# ── the validation points somewhere ──────────────────────────────────────────

def test_a_mismatch_offers_what_to_do_next(db, account):
    from api import accounts as accounts_api
    accounts_api.db = db

    class Validation:
        pass
    validation = Validation()
    validation.account_id = account
    validation.validation_date = "2026-03-01"
    validation.actual_balance = 950.0
    validation.notes = None

    response = accounts_api.create_balance_validation(validation, current_user=None)

    assert response["is_match"] is False
    assert "next_steps" in response, "a gap you can do nothing about is just a number"
    assert response["next_steps"]["reconcile"]["account_id"] == account
    assert response["next_steps"]["reconcile"]["end_date"] == "2026-03-01"


def test_a_match_offers_nothing(db, account):
    from api import accounts as accounts_api
    accounts_api.db = db

    class Validation:
        pass
    validation = Validation()
    validation.account_id = account
    validation.validation_date = "2026-03-01"
    validation.actual_balance = 1000.0
    validation.notes = None

    response = accounts_api.create_balance_validation(validation, current_user=None)

    assert response["is_match"] is True
    assert "next_steps" not in response
