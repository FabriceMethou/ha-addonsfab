"""
Tests for the net worth change shown on the Dashboard and Reports KPI cards.

The cards used to take the last two points of a two-month trend — the 1st of
the current month and today — so they showed the same month-to-date figure on
every page and every month. /net-worth/change compares the end of two given
days instead.

Run:
  cd myfinanceapp/app
  JWT_SECRET_KEY=test PYTHONPATH=$PWD python -m pytest tests/test_net_worth_change.py -q
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
_import_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_import_db.close()
os.environ.setdefault("DATABASE_PATH", _import_db.name)

import pytest
from fastapi import HTTPException

from database import FinanceDatabase
from api import reports as reports_api


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    reports_api.db = database
    return database


def add_account(db, owner_id, opening_balance=1000.0):
    return db.add_account({
        "name": f"Checking {owner_id}",
        "owner_id": owner_id,
        "balance": opening_balance,
        "opening_balance": opening_balance,
        "opening_date": "2026-01-01",
        "currency": "EUR",
        "account_type": "checking",
        # The opening checkpoint opens a second write connection inside
        # add_account's and deadlocks; it plays no part in net worth.
        "create_initial_validation": False,
    })


def add_txn(db, acc_id, amount, date_str):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1",
            ("income" if amount > 0 else "expense",))
        type_id, subtype_id = cur.fetchone()
    return db.add_transaction({
        "account_id": acc_id,
        "amount": amount,
        "transaction_date": date_str,
        "currency": "EUR",
        "type_id": type_id,
        "subtype_id": subtype_id,
        "description": "test",
        "destinataire": "",
        "tags": "",
        "confirmed": True,
        "is_historical": False,
        "is_transfer": False,
    })


def change(start, end, owner_id=None):
    return reports_api.net_worth_change(
        start_date=start, end_date=end, owner_id=owner_id, current_user=None)


class TestNetWorthAt:
    def test_counts_transactions_up_to_the_end_of_the_day(self, db):
        acc = add_account(db, db.get_owners()[0]["id"])
        add_txn(db, acc, 500.0, "2026-09-30")
        add_txn(db, acc, 200.0, "2026-10-01")

        assert db.get_net_worth_at("2026-09-29")["net_worth"] == 1000.0
        assert db.get_net_worth_at("2026-09-30")["net_worth"] == 1500.0
        assert db.get_net_worth_at("2026-10-01")["net_worth"] == 1700.0

    def test_matches_the_trend_points(self, db):
        acc = add_account(db, db.get_owners()[0]["id"])
        add_txn(db, acc, 300.0, "2026-03-15")
        add_txn(db, acc, -50.0, "2026-04-02")

        trend = db.get_net_worth_trend("2026-03-01", "2026-04-10")["data"]
        for point in trend:
            at = db.get_net_worth_at(point["date"])
            assert at["net_worth"] == point["net_worth"]
            assert at["assets"] == point["assets"]


class TestNetWorthChange:
    def test_month_on_month(self, db):
        acc = add_account(db, db.get_owners()[0]["id"])
        add_txn(db, acc, 1000.0, "2026-08-15")    # August: 1000 -> 2000
        add_txn(db, acc, -500.0, "2026-09-10")    # September: 2000 -> 1500

        aug = change("2026-07-31", "2026-08-31")
        sep = change("2026-08-31", "2026-09-30")

        assert aug["start_net_worth"] == 1000.0
        assert aug["end_net_worth"] == 2000.0
        assert aug["change_percent"] == 100.0
        assert sep["change"] == -500.0
        assert sep["change_percent"] == -25.0

    def test_transactions_on_the_1st_belong_to_the_new_month(self, db):
        acc = add_account(db, db.get_owners()[0]["id"])
        add_txn(db, acc, 100.0, "2026-10-01")

        sep = change("2026-08-31", "2026-09-30")
        octo = change("2026-09-30", "2026-10-31")

        assert sep["change"] == 0
        assert octo["change"] == 100.0

    def test_owner_filter(self, db):
        owners = [o["id"] for o in db.get_owners()]
        if len(owners) < 2:
            owners.append(db.add_owner("Second"))
        mine = add_account(db, owners[0])
        theirs = add_account(db, owners[1])
        add_txn(db, mine, 100.0, "2026-09-10")
        add_txn(db, theirs, 900.0, "2026-09-10")

        result = change("2026-08-31", "2026-09-30", owner_id=owners[0])

        assert result["start_net_worth"] == 1000.0
        assert result["end_net_worth"] == 1100.0
        assert result["change_percent"] == 10.0

    def test_debt_taken_out_in_the_period_lowers_net_worth(self, db):
        acc = add_account(db, db.get_owners()[0]["id"], opening_balance=10000.0)
        debt = db.add_debt({
            "name": "Car loan", "principal_amount": 5000.0,
            "current_balance": 5000.0, "interest_rate": 3.0,
            "interest_type": "simple", "monthly_payment": 200.0,
            "payment_day": 1, "currency": "EUR", "linked_account_id": acc,
            "start_date": "2026-11-01"})
        with db.db_connection(commit=True) as conn:
            conn.execute("UPDATE debts SET created_at = '2026-09-15 10:00:00' WHERE id = ?",
                         (debt,))

        result = change("2026-08-31", "2026-09-30")

        assert result["start_net_worth"] == 10000.0
        assert result["end_net_worth"] == 5000.0
        assert result["change_percent"] == -50.0

    def test_negative_start_reads_a_gain_as_positive(self, db):
        acc = add_account(db, db.get_owners()[0]["id"], opening_balance=-1000.0)
        add_txn(db, acc, 500.0, "2026-09-10")

        assert change("2026-08-31", "2026-09-30")["change_percent"] == 50.0

    def test_no_percent_from_zero(self, db):
        acc = add_account(db, db.get_owners()[0]["id"], opening_balance=0.0)
        add_txn(db, acc, 500.0, "2026-09-10")

        result = change("2026-08-31", "2026-09-30")

        assert result["change"] == 500.0
        assert result["change_percent"] is None

    @pytest.mark.parametrize("start,end", [
        ("2026-09-30", "2026-08-31"),
        ("2026-09-xx", "2026-09-30"),
    ])
    def test_rejects_bad_ranges(self, db, start, end):
        with pytest.raises(HTTPException) as exc:
            change(start, end)
        assert exc.value.status_code == 400
