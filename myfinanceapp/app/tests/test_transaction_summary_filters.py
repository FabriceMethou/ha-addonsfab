"""
Tests for /api/transactions/stats/summary.

The Transactions page KPI cards read their income/expense totals from this
endpoint, so it must accept the same filter set as the transaction list and
must never be limited by the page size the list is using.

Run:
  cd /home/fab/Documents/Dev/ha-addonsfab/myfinanceapp/app
  PYTHONPATH=. /home/fab/Documents/Dev/myfinanceapp/backend/venv/bin/python3 \
    -m pytest tests/test_transaction_summary_filters.py -v --tb=short
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

from database import FinanceDatabase
from api import transactions as transactions_api

# ── helpers ──────────────────────────────────────────────────────────────────


def make_db() -> FinanceDatabase:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    db = FinanceDatabase(db_path=f.name)
    transactions_api.db = db
    return db


def owner_id(db, index=0):
    return db.get_owners()[index]["id"]


def add_account(db, name="Checking", currency="EUR", owner=None):
    return db.add_account({
        "name": name,
        "owner_id": owner if owner is not None else owner_id(db),
        "balance": 0.0,
        "currency": currency,
        "account_type": "checking",
    })


def type_ids(db, category="expense", index=0):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? ORDER BY tt.id, ts.id",
            (category,)
        )
        rows = cur.fetchall()
        return rows[index][0], rows[index][1]


def add_txn(db, acc_id, amount, date_str="2025-03-15", category="expense",
            destinataire="", tags="", owner=None, type_id=None, subtype_id=None):
    tid, sid = type_ids(db, category)
    data = {
        "account_id": acc_id,
        "amount": amount,
        "transaction_date": date_str,
        "currency": "EUR",
        "type_id": type_id if type_id is not None else tid,
        "subtype_id": subtype_id if subtype_id is not None else sid,
        "description": "test",
        "destinataire": destinataire,
        "tags": tags,
        "confirmed": True,
        "is_historical": False,
        "is_transfer": False,
    }
    if owner is not None:
        data["owner_id"] = owner
    return db.add_transaction(data)


def summary(**kwargs):
    kwargs.setdefault("current_user", None)
    return transactions_api.get_transaction_summary(**kwargs)


# ── the bug: totals must cover every matching transaction ────────────────────


class TestSummaryIgnoresPageSize:
    def test_totals_cover_all_transactions_not_just_one_page(self):
        db = make_db()
        acc = add_account(db)
        for day in range(1, 31):
            add_txn(db, acc, -10.0, f"2025-03-{day:02d}")

        result = summary()

        assert result["total_transactions"] == 30
        assert result["total_expense"] == 300.0, (
            "Summary must sum every transaction, not a single page"
        )


# ── filters ──────────────────────────────────────────────────────────────────


class TestSummaryFilters:
    def test_filters_by_owner(self):
        db = make_db()
        mine = owner_id(db, 0)
        theirs = owner_id(db, 1)
        acc_mine = add_account(db, "Mine", owner=mine)
        acc_theirs = add_account(db, "Theirs", owner=theirs)
        add_txn(db, acc_mine, -100.0)
        add_txn(db, acc_theirs, -40.0)

        result = summary(owner_id=mine)

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0

    def test_filters_by_type(self):
        db = make_db()
        acc = add_account(db)
        expense_type, _ = type_ids(db, "expense")
        add_txn(db, acc, -100.0, category="expense")
        add_txn(db, acc, 500.0, category="income")

        result = summary(type_id=expense_type)

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0
        assert result["total_income"] == 0

    def test_filters_by_subtype(self):
        db = make_db()
        acc = add_account(db)
        tid_a, sid_a = type_ids(db, "expense", 0)
        tid_b, sid_b = type_ids(db, "expense", 1)
        add_txn(db, acc, -100.0, type_id=tid_a, subtype_id=sid_a)
        add_txn(db, acc, -25.0, type_id=tid_b, subtype_id=sid_b)

        result = summary(subtype_id=sid_a)

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0

    def test_filters_by_recipient(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -100.0, destinataire="Landlord")
        add_txn(db, acc, -40.0, destinataire="Supermarket")

        result = summary(recipient="Landlord")

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0

    def test_filters_by_tag(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -100.0, tags="holiday")
        add_txn(db, acc, -40.0, tags="groceries")

        result = summary(tags="holiday")

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0

    def test_filters_combine(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -100.0, "2025-03-15", tags="holiday")
        add_txn(db, acc, -60.0, "2025-05-15", tags="holiday")   # outside range
        add_txn(db, acc, -40.0, "2025-03-16", tags="groceries")  # other tag

        result = summary(start_date="2025-03-01", end_date="2025-03-31",
                         tags="holiday")

        assert result["total_transactions"] == 1
        assert result["total_expense"] == 100.0


# ── currency conversion + transfers (existing behaviour, guarded) ────────────


class TestSummaryConversion:
    def test_amounts_are_converted_to_display_currency(self):
        db = make_db()
        eur = add_account(db, "EUR account", currency="EUR")
        sek = add_account(db, "SEK account", currency="SEK")
        add_txn(db, eur, -100.0)
        add_txn(db, sek, -100.0)
        rate = db.convert_currency(100.0, "SEK", "EUR")

        result = summary()

        assert result["currency"] == "EUR"
        assert rate != 100.0, "Test needs a real SEK→EUR rate to be meaningful"
        assert abs(result["total_expense"] - (100.0 + rate)) < 0.01, (
            "Foreign-currency amounts must be converted, not summed raw"
        )

    def test_transfers_are_excluded(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -100.0, category="expense")
        add_txn(db, acc, -500.0, category="transfer")

        result = summary()

        assert result["total_expense"] == 100.0
