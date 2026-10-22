"""
Spending trends: what changed in spending, and whether it is a real change.

The old analysis set the first month of the period against the last one: one
noisy month against another, the last being the month in progress, sorted by
percentage so that 5 -> 15 came before 400 -> 600. Now only complete months
are compared: the last one against the usual month (the median of the ones
before it, so one exceptional month does not shift it), sorted by the difference in money, with a label saying what kind
of change it is.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_spending_trends.py -v
"""
import os
import sys
import tempfile
from datetime import datetime

import pytest
from dateutil.relativedelta import relativedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))
from database import FinanceDatabase
from api import reports as reports_api
from api.reports import _spending_changes


def changes_by_name(months):
    return {c["name"]: c for c in _spending_changes(months)["changes"]}


# ── the comparison ───────────────────────────────────────────────────────────

def test_the_last_month_is_compared_with_the_usual_month():
    result = _spending_changes([{"Food": 400}, {"Food": 500}, {"Food": 450}, {"Food": 600}])  # median 450
    food = result["changes"][0]
    assert (food["usual"], food["last"], food["difference"]) == (450.0, 600.0, 150.0)
    assert food["difference_percent"] == 33.3
    assert result["summary"] == {"usual": 450.0, "usual_months": 3, "last": 600.0,
                                 "difference": 150.0, "difference_percent": 33.3}


def test_changes_are_sorted_by_money_not_by_percent():
    months = [{"Coffee": 5, "Rent": 400}, {"Coffee": 5, "Rent": 400}, {"Coffee": 15, "Rent": 600}]
    assert [c["name"] for c in _spending_changes(months)["changes"]] == ["Rent", "Coffee"]


def test_two_complete_months_are_needed():
    assert _spending_changes([{"Food": 100}]) is None
    assert _spending_changes([]) is None


# ── what kind of change ──────────────────────────────────────────────────────

def test_above_and_below_usual():
    months = [{"Food": 100, "Fun": 100, "Car": 100}] * 3 + [{"Food": 130, "Fun": 70, "Car": 115}]
    labels = {n: c["label"] for n, c in changes_by_name(months).items()}
    assert labels == {"Food": "above", "Fun": "below", "Car": "usual"}   # Car: +15%, within 20%


def test_a_small_amount_is_not_flagged():
    months = [{"Coffee": 10}] * 3 + [{"Coffee": 18}]   # +80%, but only 8
    assert changes_by_name(months)["Coffee"]["label"] == "usual"


def test_rising_and_falling_need_three_months_in_a_row():
    months = [{"Food": 100, "Fun": 300}, {"Food": 110, "Fun": 290}, {"Food": 105, "Fun": 310},
              {"Food": 150, "Fun": 200}, {"Food": 160, "Fun": 210}, {"Food": 155, "Fun": 190}]
    labels = {n: c["label"] for n, c in changes_by_name(months).items()}
    assert labels == {"Food": "rising", "Fun": "falling"}


def test_one_expensive_month_does_not_shift_the_usual_month():
    months = [{"Food": 100}, {"Food": 100}, {"Food": 100}, {"Food": 100}, {"Food": 400}, {"Food": 100}]
    food = changes_by_name(months)["Food"]
    assert (food["usual"], food["label"]) == (100.0, "usual")


def test_a_yearly_bill_is_occasional():
    months = [{"Insurance": 600}, {}, {}, {}, {}, {"Insurance": 0.0}]
    assert changes_by_name(months)["Insurance"]["label"] == "occasional"


def test_a_bill_every_other_month_is_occasional_not_new():
    months = [{"Water": 80}, {}, {"Water": 80}, {}, {}, {"Water": 80}]   # 3 months of 6
    assert changes_by_name(months)["Water"]["label"] == "occasional"


def test_a_category_never_seen_before_is_new():
    months = [{"Food": 100}, {"Food": 100}, {"Food": 100, "Pets": 80}]
    pets = changes_by_name(months)["Pets"]
    assert (pets["label"], pets["difference_percent"]) == ("new", None)


# ── the endpoint ─────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    database.set_preference("display_currency", "EUR")
    reports_api.db = database
    yield database
    os.unlink(f.name)


def ids_of(db, type_name):
    with db.db_connection(commit=False) as conn:
        return [tuple(r) for r in conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.name = ? ORDER BY ts.id", (type_name,)).fetchall()]


def spend(db, account, amount, date, type_ids):
    db.add_transaction({"account_id": account, "amount": -amount, "transaction_date": date,
                        "currency": "EUR", "type_id": type_ids[0], "subtype_id": type_ids[1],
                        "description": "", "destinataire": "Shop"})


@pytest.fixture
def account(db):
    return db.add_account({"name": "Card", "owner_id": db.get_owners()[0]["id"], "balance": 5000.0,
                           "currency": "EUR", "account_type": "checking"})


def month(offset, day=10):
    return (datetime.now().replace(day=day) + relativedelta(months=offset)).strftime("%Y-%m-%d")


def test_the_month_in_progress_is_shown_but_not_compared(db, account):
    food = ids_of(db, "Food")[0]
    for offset, amount in [(-3, 100), (-2, 100), (-1, 100), (0, 5)]:
        spend(db, account, amount, month(offset, day=1), food)
    result = reports_api.spending_trends(months=3, current_user=None)
    assert [m["complete"] for m in result["trends"]] == [True, True, True, False]
    summary = result["analysis"]["summary"]
    assert (summary["usual"], summary["last"], summary["usual_months"]) == (100.0, 100.0, 2)
    assert result["analysis"]["changes"][0]["label"] == "usual"


def test_a_range_cut_mid_month_does_not_count_that_month(db, account):
    food = ids_of(db, "Food")[0]
    for date in ["2025-01-10", "2025-02-10", "2025-03-10", "2025-04-10"]:
        spend(db, account, 50, date, food)
    result = reports_api.spending_trends(start_date="2025-01-15", end_date="2025-04-05", current_user=None)
    assert [m["complete"] for m in result["trends"]] == [False, True, True, False]


def test_the_chart_draws_the_biggest_groups_and_other(db, account):
    names = ["Food", "Transport", "Housing", "Health", "Shopping", "Entertainment", "Education"]
    for rank, name in enumerate(names):
        spend(db, account, 100 - rank * 10, "2025-03-10", ids_of(db, name)[0])
    result = reports_api.spending_trends(start_date="2025-03-01", end_date="2025-03-31", current_user=None)
    assert result["series"] == names[:6] + ["Other categories"]
    assert result["trends"][0]["series"]["Other categories"] == 40.0


def test_a_category_filter_splits_by_subcategory(db, account):
    food = ids_of(db, "Food")
    spend(db, account, 30, "2025-03-10", food[0])
    spend(db, account, 20, "2025-03-12", food[1])
    spend(db, account, 99, "2025-03-12", ids_of(db, "Transport")[0])
    result = reports_api.spending_trends(start_date="2025-03-01", end_date="2025-03-31",
                                         category="Food", current_user=None)
    groups = result["trends"][0]["groups"]
    assert sum(groups.values()) == 50.0 and len(groups) == 2
    assert "Transport" not in result["series"]
