"""
Tests for subcategory breakdowns in the reports API.

Reports must aggregate on the full category hierarchy (main category +
subcategory), not only the main category.

Run:
  cd /home/fab/Documents/Dev/ha-addonsfab/myfinanceapp/app
  PYTHONPATH=. /home/fab/Documents/Dev/myfinanceapp/backend/venv/bin/python3 \
    -m pytest tests/test_report_subcategories.py -v --tb=short
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
# The routers open their database at import time; point them at a throwaway file
# so importing them never touches (or requires) the real one.
_import_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_import_db.close()
os.environ["DATABASE_PATH"] = _import_db.name

from database import FinanceDatabase
from api import reports as reports_api

# ── helpers ──────────────────────────────────────────────────────────────────


def make_db() -> FinanceDatabase:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    return FinanceDatabase(db_path=f.name)


def add_account(db, name="Checking"):
    return db.add_account({
        "name": name,
        "owner_id": db.get_owners()[0]["id"],
        "balance": 0.0,
        "currency": "EUR",
        "account_type": "checking",
    })


def subtype_ids(db, category="expense", count=2):
    """Return (type_id, [subtype_id, ...]) for a type with enough subtypes."""
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? GROUP BY tt.id HAVING COUNT(ts.id) >= ? LIMIT 1",
            (category, count)
        )
        type_id = cur.fetchone()[0]
        cur.execute(
            "SELECT id FROM transaction_subtypes WHERE type_id = ? LIMIT ?",
            (type_id, count)
        )
        return type_id, [row[0] for row in cur.fetchall()]


def names_for(db, type_id, subtype_id):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM transaction_types WHERE id = ?", (type_id,))
        type_name = cur.fetchone()[0]
        cur.execute("SELECT name FROM transaction_subtypes WHERE id = ?", (subtype_id,))
        return type_name, cur.fetchone()[0]


def add_txn(db, acc_id, amount, date_str, type_id, subtype_id):
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


def use_test_db(db):
    """Point the reports router at a throwaway database."""
    reports_api.db = db


# ── breakdown helpers ────────────────────────────────────────────────────────


class TestBreakdownHelpers:
    def test_subcategories_are_nested_under_their_category(self):
        breakdown = {}
        reports_api._accumulate_category(
            breakdown, {"type_name": "Housing", "subtype_name": "Rent"}, 800.0)
        reports_api._accumulate_category(
            breakdown, {"type_name": "Housing", "subtype_name": "Utilities"}, 120.0)
        reports_api._accumulate_category(
            breakdown, {"type_name": "Housing", "subtype_name": "Rent"}, 200.0)

        result = reports_api._format_breakdown(breakdown)

        assert len(result) == 1
        assert result[0]["category"] == "Housing"
        assert result[0]["total"] == 1120.0
        assert result[0]["subcategories"] == [
            {"category": "Rent", "total": 1000.0},
            {"category": "Utilities", "total": 120.0},
        ]

    def test_categories_and_subcategories_sorted_by_amount(self):
        breakdown = {}
        reports_api._accumulate_category(
            breakdown, {"type_name": "Food", "subtype_name": "Snacks"}, 10.0)
        reports_api._accumulate_category(
            breakdown, {"type_name": "Food", "subtype_name": "Groceries"}, 90.0)
        reports_api._accumulate_category(
            breakdown, {"type_name": "Travel", "subtype_name": "Flights"}, 500.0)

        result = reports_api._format_breakdown(breakdown)

        assert [c["category"] for c in result] == ["Travel", "Food"]
        assert [s["category"] for s in result[1]["subcategories"]] == [
            "Groceries", "Snacks"]

    def test_missing_names_fall_back_to_placeholders(self):
        breakdown = {}
        reports_api._accumulate_category(breakdown, {}, 25.0)

        result = reports_api._format_breakdown(breakdown)

        assert result[0]["category"] == reports_api.UNCATEGORIZED
        assert result[0]["subcategories"][0]["category"] == reports_api.NO_SUBCATEGORY

    def test_amount_key_is_configurable(self):
        breakdown = {}
        reports_api._accumulate_category(
            breakdown, {"type_name": "Food", "subtype_name": "Groceries"}, 42.0)

        result = reports_api._format_breakdown(breakdown, amount_key="amount")

        assert result[0]["amount"] == 42.0
        assert result[0]["subcategories"][0]["amount"] == 42.0


# ── endpoints ────────────────────────────────────────────────────────────────


class TestSpendingByCategory:
    def test_splits_one_category_into_subcategories(self):
        db = make_db()
        use_test_db(db)
        acc = add_account(db)
        type_id, subs = subtype_ids(db)
        type_name, sub_a_name = names_for(db, type_id, subs[0])
        _, sub_b_name = names_for(db, type_id, subs[1])

        add_txn(db, acc, -60.0, "2025-03-05", type_id, subs[0])
        add_txn(db, acc, -40.0, "2025-03-06", type_id, subs[1])

        result = asyncio.run(reports_api.spending_by_category(
            start_date="2025-03-01", end_date="2025-03-31", current_user=None))

        assert len(result["categories"]) == 1
        category = result["categories"][0]
        assert category["category"] == type_name
        assert category["total"] == 100.0
        assert {s["category"]: s["total"] for s in category["subcategories"]} == {
            sub_a_name: 60.0,
            sub_b_name: 40.0,
        }
        assert result["total"] == 100.0


class TestMonthlySummary:
    def test_spending_by_category_carries_subcategories(self):
        db = make_db()
        use_test_db(db)
        acc = add_account(db)
        type_id, subs = subtype_ids(db)
        _, sub_a_name = names_for(db, type_id, subs[0])

        add_txn(db, acc, -25.0, "2025-04-10", type_id, subs[0])
        add_txn(db, acc, -75.0, "2025-04-11", type_id, subs[1])

        result = asyncio.run(reports_api.monthly_summary(
            year=2025, month=4, current_user=None))

        category = result["spending_by_category"][0]
        assert category["amount"] == 100.0
        # Sorted by amount, so the 75 subcategory comes first
        assert category["subcategories"][0]["amount"] == 75.0
        assert category["subcategories"][1]["category"] == sub_a_name
        assert category["subcategories"][1]["amount"] == 25.0


class TestSpendingTrends:
    def test_each_month_reports_subcategory_totals(self):
        db = make_db()
        use_test_db(db)
        acc = add_account(db)
        type_id, subs = subtype_ids(db)
        type_name, sub_a_name = names_for(db, type_id, subs[0])

        from datetime import datetime
        today = datetime.now().strftime('%Y-%m-%d')
        add_txn(db, acc, -30.0, today, type_id, subs[0])
        add_txn(db, acc, -20.0, today, type_id, subs[1])

        result = asyncio.run(reports_api.spending_trends(
            months=1, current_user=None))

        current_month = result["trends"][-1]
        assert current_month["categories"][type_name] == 50.0
        assert current_month["subcategories"][type_name][sub_a_name] == 30.0
        assert sub_a_name in result["all_subcategories"][type_name]


class TestIncomeVsExpenses:
    def test_income_categories_carry_subcategories(self):
        db = make_db()
        use_test_db(db)
        acc = add_account(db)
        type_id, subs = subtype_ids(db, category="income")
        type_name, sub_a_name = names_for(db, type_id, subs[0])

        add_txn(db, acc, 1500.0, "2025-05-01", type_id, subs[0])

        result = asyncio.run(reports_api.income_vs_expenses(
            start_date="2025-05-01", end_date="2025-05-31", current_user=None))

        category = result["income_categories"][0]
        assert category["category"] == type_name
        assert category["total"] == 1500.0
        assert category["subcategories"] == [
            {"category": sub_a_name, "total": 1500.0}]


# ── transaction filtering (drill-down from a report subcategory) ─────────────


class TestSubtypeFilter:
    def test_get_transactions_filters_by_subtype(self):
        db = make_db()
        acc = add_account(db)
        type_id, subs = subtype_ids(db)

        add_txn(db, acc, -10.0, "2025-06-01", type_id, subs[0])
        add_txn(db, acc, -20.0, "2025-06-02", type_id, subs[1])

        filtered = db.get_transactions({"subtype_id": subs[0]})

        assert len(filtered) == 1
        assert filtered[0]["amount"] == -10.0

    def test_count_transactions_filters_by_subtype(self):
        db = make_db()
        acc = add_account(db)
        type_id, subs = subtype_ids(db)

        add_txn(db, acc, -10.0, "2025-06-01", type_id, subs[0])
        add_txn(db, acc, -20.0, "2025-06-02", type_id, subs[1])
        add_txn(db, acc, -30.0, "2025-06-03", type_id, subs[1])

        assert db.count_transactions({"subtype_id": subs[1]}) == 2
