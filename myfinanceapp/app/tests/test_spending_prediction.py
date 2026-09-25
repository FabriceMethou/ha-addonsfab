"""
Next-month spending prediction.

The previous method averaged each recipient over the months since it first
appeared, so a one-off purchase last month was predicted to repeat in full;
it summed absolute amounts, so a refund raised the prediction; it never saw
yearly bills; its "confidence" was a formula; and it compared the whole
forecast with whatever budgets existed.

These tests pin the replacement on a synthetic household: rent and an energy
bill every month, groceries twice a month, a yearly insurance.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_spending_prediction.py -v
"""
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from predictions import SpendingPredictor

TODAY = date(2026, 9, 25)
MONTHS = ([f"2024-{m:02d}" for m in range(10, 13)]
          + [f"2025-{m:02d}" for m in range(1, 13)]
          + [f"2026-{m:02d}" for m in range(1, 9)])   # two years, up to August 2026


def tx(day, amount, payee, category="Food"):
    return {"transaction_date": day, "amount": amount, "destinataire": payee,
            "type_name": category, "category": "expense"}


def household(months=MONTHS, insurance=True):
    rows = []
    for m in months:
        rows += [tx(f"{m}-01", -900.0, "Landlord", "Housing"),
                 tx(f"{m}-10", -45.0, "Stadtwerke", "Utilities"),
                 tx(f"{m}-05", -120.0, "Lidl"), tx(f"{m}-19", -140.0, "Lidl")]
    if insurance:
        rows += [tx("2024-10-14", -470.0, "Allianz", "Insurance"),
                 tx("2025-10-15", -480.0, "Allianz", "Insurance")]
    return rows


def predict(rows, today=TODAY, **kwargs):
    return SpendingPredictor(rows, today=today, **kwargs).predict_monthly_spending()


def bills(result):
    return {(b["payee"], b["kind"]): b["amount"] for b in result["upcoming_bills"]}


# ── what is predicted ────────────────────────────────────────────────────────

def test_next_month_is_bills_plus_variable_spending():
    result = predict(household())
    assert result["target_month"] == "2026-10"
    assert result["recurring_total"] == 900 + 45 + 480
    assert result["non_recurring_total"] == pytest.approx(260)
    assert result["predicted"] == pytest.approx(1685)


def test_monthly_bills_are_listed_with_their_day():
    result = predict(household())
    assert [(b["payee"], b["day"]) for b in result["upcoming_bills"]] == [
        ("Landlord", 1), ("Stadtwerke", 10), ("Allianz", 15)]


def test_groceries_paid_several_times_a_month_are_not_a_bill():
    assert ("Lidl", "monthly") not in bills(predict(household()))


def test_a_yearly_bill_counts_only_in_the_month_it_is_due():
    october = predict(household())                       # Allianz due October 2026
    november = predict(household(), today=date(2026, 10, 20))
    assert bills(october)[("Allianz", "yearly")] == 480.0
    assert ("Allianz", "yearly") not in bills(november)


def test_a_rent_increase_is_followed():
    rows = [r for r in household() if not (r["destinataire"] == "Landlord" and r["transaction_date"] >= "2026-07")]
    rows += [tx("2026-07-01", -950.0, "Landlord", "Housing"), tx("2026-08-01", -950.0, "Landlord", "Housing")]
    assert bills(predict(rows))[("Landlord", "monthly")] == 950.0


def test_a_cancelled_subscription_stops_counting():
    rows = household() + [tx(f"{m}-20", -13.0, "Netflix", "Leisure") for m in MONTHS[:-3]]
    assert ("Netflix", "monthly") not in bills(predict(rows))


# ── the old method's failures ────────────────────────────────────────────────

def test_a_one_off_purchase_is_spread_over_the_year():
    """The old method predicted €1,500 more for the month after a repair."""
    base = predict(household())["predicted"]
    after = predict(household() + [tx("2026-08-14", -1500.0, "Car garage", "Transport")])["predicted"]
    assert after - base == pytest.approx(1500 / 12)


def test_an_unusually_expensive_month_is_capped():
    rows = household() + [tx(f"{m}-12", -60.0, "Shell", "Transport") for m in MONTHS]
    rows += [tx("2026-08-13", -2000.0, "Shell", "Transport")]   # 2,060 in August, typical 60
    transport = next(c for c in SpendingPredictor(rows, today=TODAY).predict_category_spending()
                     if c["category"] == "Transport")
    assert transport["predicted"] == pytest.approx((11 * 60 + 3 * 60) / 12)


def test_a_refund_lowers_the_prediction():
    """The old method counted a refund as spending."""
    base = predict(household())["predicted"]
    after = predict(household() + [tx("2026-08-20", 80.0, "Lidl")])["predicted"]
    assert after == pytest.approx(base - 80 / 12)


# ── accuracy, measured ───────────────────────────────────────────────────────

def test_accuracy_is_measured_on_the_last_six_months():
    accuracy = predict(household())["accuracy"]
    assert [m["month"] for m in accuracy["months"]] == \
        ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]
    for month in accuracy["months"]:
        assert month["actual"] == pytest.approx(900 + 45 + 260)
    assert accuracy["typical_error"] == pytest.approx(0, abs=1)


def test_the_range_widens_with_the_measured_error():
    result = predict(household() + [tx("2026-08-14", -1500.0, "Car garage", "Transport")])
    error = result["accuracy"]["typical_error"]
    assert error > 200
    assert result["range"] == {"low": pytest.approx(result["predicted"] - error),
                               "high": pytest.approx(result["predicted"] + error)}


def test_with_too_little_history_there_is_no_accuracy_claim():
    result = predict(household(MONTHS[-3:], insurance=False))
    assert result["accuracy"] is None and result["range"] is None


# ── seasonality ──────────────────────────────────────────────────────────────

def test_a_month_that_was_higher_last_year_is_predicted_higher():
    rows = household() + [tx("2025-10-20", -130.0, "Lidl")]   # October 2025: 390 instead of 260
    result = predict(rows)
    assert result["seasonal_factor"] > 1
    assert result["non_recurring_total"] > 260


def test_the_seasonal_adjustment_stays_mild():
    rows = household() + [tx("2025-10-20", -5000.0, "Lidl")]
    assert predict(rows)["seasonal_factor"] == SpendingPredictor.SEASONAL_RANGE[1]


# ── this month ───────────────────────────────────────────────────────────────

def test_this_month_adds_what_is_still_expected():
    rows = household() + [tx("2026-09-01", -900.0, "Landlord", "Housing"),
                          tx("2026-09-05", -120.0, "Lidl")]
    this_month = predict(rows)["this_month"]
    assert this_month["spent"] == 1020.0
    assert [b["payee"] for b in this_month["bills_remaining"]] == ["Stadtwerke"]
    assert this_month["days_left"] == 5
    assert this_month["projected"] == pytest.approx(1020 + 45 + 260 * 5 / 30)


# ── budgets ──────────────────────────────────────────────────────────────────

def test_only_budgeted_categories_are_compared():
    """A Food budget alone must not be 'exceeded' by rent."""
    budgets = [{"type_name": "Food", "amount": 300.0, "period": "monthly"}]
    comparison = predict(household(), budgets=budgets)["budget_comparison"]
    assert comparison["over_budget"] is False
    assert comparison["categories"] == [{
        "category": "Food", "budget": 300.0, "predicted": pytest.approx(260),
        "difference": pytest.approx(-40), "over": False}]


def test_a_category_forecast_over_its_budget_is_named():
    budgets = [{"type_name": "Food", "amount": 200.0, "period": "monthly"},
               {"type_name": "Insurance", "amount": 1200.0, "period": "yearly"}]
    comparison = predict(household(), budgets=budgets)["budget_comparison"]
    assert comparison["over_categories"] == ["Food", "Insurance"]   # 480 due > 100/month


# ── edge cases ───────────────────────────────────────────────────────────────

def test_no_history_predicts_nothing():
    result = SpendingPredictor([], today=TODAY).predict_monthly_spending()
    assert result["predicted"] == 0 and result["upcoming_bills"] == []


def test_transfers_and_income_are_ignored():
    rows = household() + [
        {"transaction_date": "2026-08-02", "amount": -500.0, "destinataire": "Broker",
         "type_name": "Transfer", "category": "transfer"},
        {"transaction_date": "2026-08-25", "amount": 3000.0, "destinataire": "Employer",
         "type_name": "Salary", "category": "income"}]
    assert predict(rows)["predicted"] == pytest.approx(predict(household())["predicted"])
