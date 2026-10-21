"""
Every transaction has a subcategory: transactions.subtype_id is NOT NULL.

The form called it optional, so a transaction saved without one failed with
"NOT NULL constraint failed". The API now answers that plainly, before
touching the database.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_subcategory_required.py -v
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


@pytest.fixture
def api():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    db = FinanceDatabase(db_path=f.name)
    from api import transactions as transactions_api
    transactions_api.db = db
    owner = db.get_owners()[0]["id"]
    account = db.add_account({"name": "Card", "owner_id": owner, "balance": 100.0,
                              "currency": "EUR", "account_type": "checking"})
    with db.db_connection(commit=False) as conn:
        food = conn.execute("SELECT id FROM transaction_types WHERE name = 'Food'").fetchone()[0]
    yield transactions_api, account, food
    os.unlink(f.name)


def test_a_transaction_without_subcategory_is_refused_plainly(api):
    transactions_api, account, food = api
    with pytest.raises(HTTPException) as err:
        transactions_api.create_transaction(transactions_api.TransactionCreate(
            account_id=account, date="2026-10-21", amount=12.3, type_id=food,
            destinataire="Lidl"), current_user=None)
    assert (err.value.status_code, err.value.detail) == (400, "Choose a subcategory")


def test_a_bulk_row_without_subcategory_is_reported(api):
    transactions_api, account, food = api
    result = transactions_api.create_transactions_bulk([transactions_api.TransactionCreate(
        account_id=account, date="2026-10-21", amount=12.3, type_id=food,
        destinataire="Lidl")], current_user=None)
    assert result["errors"] == [{"index": 0, "error": "Choose a subcategory"}]
