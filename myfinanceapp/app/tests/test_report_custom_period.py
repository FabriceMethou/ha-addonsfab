"""
Tests for the "Custom Range" time filter on the Reports page.

Every period-based report endpoint accepts an explicit start_date/end_date
pair, which overrides the months/year presets.

Run:
  cd /home/fab/Documents/Dev/ha-addonsfab/myfinanceapp/app
  PYTHONPATH=. /home/fab/Documents/Dev/myfinanceapp/backend/venv/bin/python3 \
    -m pytest tests/test_report_custom_period.py -v --tb=short
"""
import os
import sys
import tempfile
from datetime import datetime

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

# ── helpers ──────────────────────────────────────────────────────────────────


def make_db() -> FinanceDatabase:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    db = FinanceDatabase(db_path=f.name)
    reports_api.db = db
    return db


def add_account(db):
    return db.add_account({
        "name": "Checking",
        "owner_id": db.get_owners()[0]["id"],
        "balance": 0.0,
        "currency": "EUR",
        "account_type": "checking",
    })


def type_ids(db, category="expense"):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1",
            (category,)
        )
        row = cur.fetchone()
        return row[0], row[1]


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


# ── period helpers ───────────────────────────────────────────────────────────


class TestResolvePeriod:
    def test_explicit_dates_win_over_months(self):
        start, end = reports_api._resolve_period(6, "2024-03-05", "2024-07-20")

        assert start == datetime(2024, 3, 5)
        assert end == datetime(2024, 7, 20)

    def test_months_fall_back_to_month_start(self):
        start, end = reports_api._resolve_period(3, None, None)

        assert start.day == 1
        assert start < end

    def test_partial_dates_are_ignored(self):
        # Only one half of the range is not enough to override the preset
        start, _ = reports_api._resolve_period(3, "2024-03-05", None)

        assert start.day == 1


class TestMonthWindows:
    def test_one_window_per_calendar_month(self):
        windows = reports_api._month_windows(
            datetime(2024, 1, 1), datetime(2024, 3, 31))

        assert [w[0].strftime('%Y-%m') for w in windows] == [
            "2024-01", "2024-02", "2024-03"]

    def test_windows_are_clipped_to_the_range(self):
        windows = reports_api._month_windows(
            datetime(2024, 1, 10), datetime(2024, 3, 5))

        # First window starts on the requested day, not the 1st
        assert windows[0][1] == datetime(2024, 1, 10)
        assert windows[0][2] == datetime(2024, 1, 31)
        # Last window stops on the requested day, not the month end
        assert windows[-1][2] == datetime(2024, 3, 5)
        # Middle months stay whole
        assert windows[1][1] == datetime(2024, 2, 1)
        assert windows[1][2] == datetime(2024, 2, 29)

    def test_labels_use_the_calendar_month_even_when_clipped(self):
        windows = reports_api._month_windows(
            datetime(2024, 1, 10), datetime(2024, 1, 20))

        assert len(windows) == 1
        assert windows[0][0] == datetime(2024, 1, 1)


# ── endpoints ────────────────────────────────────────────────────────────────


class TestSpendingTrendsCustomRange:
    def test_covers_only_the_requested_months(self):
        db = make_db()
        acc = add_account(db)
        type_id, subtype_id = type_ids(db)

        add_txn(db, acc, -10.0, "2024-01-15", type_id, subtype_id)
        add_txn(db, acc, -20.0, "2024-02-15", type_id, subtype_id)
        add_txn(db, acc, -40.0, "2024-05-15", type_id, subtype_id)  # outside

        result = reports_api.spending_trends(
            start_date="2024-01-01", end_date="2024-02-29", current_user=None)

        assert [t["date"] for t in result["trends"]] == ["2024-01", "2024-02"]
        assert result["trends"][0]["total_expenses"] == 10.0
        assert result["trends"][1]["total_expenses"] == 20.0
        assert result["start_date"] == "2024-01-01"
        assert result["end_date"] == "2024-02-29"

    def test_range_starting_mid_month_excludes_earlier_days(self):
        db = make_db()
        acc = add_account(db)
        type_id, subtype_id = type_ids(db)

        add_txn(db, acc, -10.0, "2024-01-05", type_id, subtype_id)   # before start
        add_txn(db, acc, -25.0, "2024-01-20", type_id, subtype_id)   # inside

        result = reports_api.spending_trends(
            start_date="2024-01-10", end_date="2024-01-31", current_user=None)

        assert len(result["trends"]) == 1
        assert result["trends"][0]["total_expenses"] == 25.0


class TestCategoryBreakdownCustomRange:
    def test_uses_the_requested_range(self):
        db = make_db()
        acc = add_account(db)
        type_id, subtype_id = type_ids(db)

        add_txn(db, acc, -30.0, "2024-02-10", type_id, subtype_id)
        add_txn(db, acc, -70.0, "2024-03-10", type_id, subtype_id)
        add_txn(db, acc, -99.0, "2024-06-10", type_id, subtype_id)  # outside

        result = reports_api.category_breakdown(
            type_id=type_id, start_date="2024-02-01", end_date="2024-03-31",
            current_user=None)

        assert result["summary"]["total"] == 100.0
        assert result["summary"]["monthly_average"] == 50.0  # two months
        assert [m["date"] for m in result["monthly_trend"]] == [
            "2024-02", "2024-03"]


class TestMonthlySummaryCustomRange:
    def test_summarises_an_arbitrary_range(self):
        db = make_db()
        acc = add_account(db)
        expense_type, expense_sub = type_ids(db, "expense")
        income_type, income_sub = type_ids(db, "income")

        add_txn(db, acc, -40.0, "2024-02-10", expense_type, expense_sub)
        add_txn(db, acc, 100.0, "2024-03-10", income_type, income_sub)
        add_txn(db, acc, -55.0, "2024-05-10", expense_type, expense_sub)  # outside

        result = reports_api.monthly_summary(
            start_date="2024-02-01", end_date="2024-03-31", current_user=None)

        assert result["expenses"] == 40.0
        assert result["income"] == 100.0
        assert result["transaction_count"] == 2
        # Budget vs actual is per calendar month, so it is empty for a range
        assert result["budget_vs_actual"] == []

    def test_year_and_month_still_work(self):
        db = make_db()
        acc = add_account(db)
        type_id, subtype_id = type_ids(db)

        add_txn(db, acc, -12.0, "2024-04-10", type_id, subtype_id)
        add_txn(db, acc, -99.0, "2024-05-01", type_id, subtype_id)

        result = reports_api.monthly_summary(
            year=2024, month=4, current_user=None)

        assert result["expenses"] == 12.0
        assert result["start_date"] == "2024-04-01"
        assert result["end_date"] == "2024-04-30"

    def test_missing_period_returns_400(self):
        make_db()

        with pytest.raises(HTTPException) as excinfo:
            reports_api.monthly_summary(current_user=None)

        assert excinfo.value.status_code == 400


class TestYearByYearCustomRange:
    def test_uses_the_requested_range(self):
        db = make_db()
        acc = add_account(db)
        expense_type, expense_sub = type_ids(db, "expense")

        add_txn(db, acc, -20.0, "2024-02-10", expense_type, expense_sub)
        add_txn(db, acc, -50.0, "2024-11-10", expense_type, expense_sub)  # outside

        result = reports_api.year_by_year_stats(
            start_date="2024-01-01", end_date="2024-06-30", current_user=None)

        assert result["summary"]["total_expenses"] == 20.0
        assert result["start_date"] == "2024-01-01"

    def test_missing_period_returns_400(self):
        make_db()

        with pytest.raises(HTTPException) as excinfo:
            reports_api.year_by_year_stats(current_user=None)

        assert excinfo.value.status_code == 400


class TestNetWorthTrendCustomRange:
    def test_echoes_the_requested_range(self):
        make_db()

        result = reports_api.net_worth_trend(
            start_date="2024-01-01", end_date="2024-06-30", current_user=None)

        assert result["start_date"] == "2024-01-01"
        assert result["end_date"] == "2024-06-30"
