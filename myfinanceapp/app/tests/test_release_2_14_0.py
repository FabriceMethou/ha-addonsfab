"""
Where the money went: what "kept" means has to match the cash that really moved.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_14_0.py -v
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from tests.test_release_2_11_1 import (add_account, add_broker, add_debt, add_expense,
                                       add_security, pay)


def income_type(db):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.category = 'income' AND tt.name != 'Investment Income' LIMIT 1
        """).fetchone())


def add_income(db, account, amount=3000.0, date="2026-03-01", **extra):
    type_id, subtype_id = income_type(db)
    return db.add_transaction({
        "account_id": account, "amount": amount, "transaction_date": date, "currency": "EUR",
        "type_id": type_id, "subtype_id": subtype_id, "description": "pay",
        "destinataire": "Employer", "confirmed": True, **extra})


def trade(api, holding, kind, quantity, price, date, fees=0.0):
    assert api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": kind, "quantity": quantity, "price": price,
        "transaction_date": date, "fees": fees, "tax": 0}).status_code == 200


def month_of_everything(api):
    """A month with one of each kind of movement."""
    db = api.db
    cash = add_account(db, balance=10000.0)
    savings = add_account(db, "Savings", balance=0.0)
    broker = add_broker(db, cash)
    holding = api.post("/api/investments/holdings", json={
        "security_id": add_security(api), "account_id": broker, "quantity": 10,
        "purchase_price": 100, "purchase_date": "2026-02-01"}).json()["holding_id"]
    debt = add_debt(db, cash, principal=2000.0, rate=12.0)

    add_income(db, cash, 3000.0)
    add_expense(db, cash, amount=-500.0, date="2026-03-02")
    trade(api, holding, "buy", 5, 100, "2026-03-03", fees=2.0)      # 502 out
    trade(api, holding, "sell", 2, 150, "2026-03-04")               # 300 in, of which a gain
    trade(api, holding, "dividend", 0, 20, "2026-03-05")            # 20 of income
    assert pay(api, debt, 100.0, date="2026-03-06").status_code == 200   # 20 interest, 80 capital
    return {"cash": cash, "savings": savings, "broker": broker, "debt": debt}


def cash_on(db, as_of):
    return db.get_net_worth_at(as_of)["cash"]


# ── Where the money went ─────────────────────────────────────────────────────

def test_what_was_kept_is_the_cash_that_really_stayed(api):
    month_of_everything(api)

    flow = api.get("/api/reports/where-money-went", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31"}).json()

    assert flow["kept"] == pytest.approx(
        cash_on(api.db, "2026-03-31") - cash_on(api.db, "2026-02-28"), abs=0.01)


def test_each_use_of_the_money_is_reported(api):
    month_of_everything(api)

    flow = api.get("/api/reports/where-money-went", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31"}).json()

    assert flow["loan_capital_repaid"] == 80.0
    assert flow["invested"] == 502.0
    assert flow["realised_gains"] > 0
    assert flow["dividends"] == 20.0
    assert flow["savings"] == flow["income"] - flow["expenses"]
    assert flow["kept"] == pytest.approx(
        flow["savings"] - flow["net_invested"] - flow["loan_capital_repaid"], abs=0.01)


def test_a_transfer_between_your_own_accounts_changes_nothing(api):
    db = api.db
    cash = add_account(db, balance=1000.0)
    savings = add_account(db, "Savings", balance=0.0)
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.category = 'transfer' AND tt.name != 'Investments' LIMIT 1
        """).fetchone()
    db.add_transaction({"account_id": cash, "amount": -400.0, "transaction_date": "2026-03-01",
                        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
                        "description": "x", "destinataire": "Savings", "confirmed": True,
                        "transfer_account_id": savings, "is_transfer": True})

    flow = api.get("/api/reports/where-money-went", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31"}).json()

    assert flow["kept"] == 0


def test_a_pending_row_is_not_counted_as_kept(api):
    db = api.db
    add_income(db, add_account(db), 500.0, confirmed=False)

    flow = api.get("/api/reports/where-money-went", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31"}).json()

    assert flow["income"] == 0


def test_where_the_money_went_follows_the_owner_filter(api):
    db = api.db
    other = db.add_owner("Other")
    month_of_everything(api)
    theirs = add_account(db, "Theirs", owner=other, balance=0.0)
    add_income(db, theirs, 70.0)

    flow = api.get("/api/reports/where-money-went", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31", "owner_id": other}).json()

    assert flow["income"] == 70.0
    assert flow["invested"] == 0
    assert flow["loan_capital_repaid"] == 0
    assert flow["kept"] == 70.0


def test_investment_activity_follows_the_owner_filter(api):
    db = api.db
    other = db.add_owner("Other")
    month_of_everything(api)

    mine = api.get("/api/investments/monthly", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31"}).json()
    theirs = api.get("/api/investments/monthly", params={
        "start_date": "2026-03-01", "end_date": "2026-03-31", "owner_id": other}).json()

    assert mine["buy_count"] == 1
    assert mine["loan_capital_repaid"] == 80.0
    assert theirs["buy_count"] == 0


def test_money_flow_carries_the_breakdown_and_its_diagram_adds_up(api):
    month_of_everything(api)

    report = api.get("/api/reports/year-by-year", params={"year": 2026, "month": 3}).json()

    assert report["where_money_went"]["loan_capital_repaid"] == 80.0
    labels = {node["label"] for node in report["sankey"]["nodes"]}
    assert {"Invested", "Loan capital repaid", "Kept"} <= labels
    links = report["sankey"]["links"]
    into = sum(link["value"] for link in links if link["target"] == "budget")
    out = sum(link["value"] for link in links if link["source"] == "budget")
    assert into == pytest.approx(out, abs=0.05)


def test_money_taken_from_existing_cash_shows_as_coming_in(api):
    """More spent and invested than earned: the diagram has to balance on the left."""
    db = api.db
    cash = add_account(db, balance=5000.0)
    add_expense(db, cash, amount=-900.0, date="2026-03-02")
    add_income(db, cash, 100.0)

    report = api.get("/api/reports/year-by-year", params={"year": 2026, "month": 3}).json()

    assert "From money you already had" in {node["label"] for node in report["sankey"]["nodes"]}
    links = report["sankey"]["links"]
    into = sum(link["value"] for link in links if link["target"] == "budget")
    out = sum(link["value"] for link in links if link["source"] == "budget")
    assert into == pytest.approx(out, abs=0.05)


# ── Net worth, split ─────────────────────────────────────────────────────────

def test_net_worth_splits_into_cash_and_investments(api):
    db = api.db
    state = month_of_everything(api)
    db.update_holding_price(db.get_investment_holdings()[0]["id"], 200.0)

    worth = api.get("/api/reports/net-worth").json()

    assert worth["cash"] == pytest.approx(db.get_account(state["cash"])["balance"])
    assert worth["investments"] == pytest.approx(db.get_account(state["broker"])["balance"])
    assert worth["cash"] + worth["investments"] == pytest.approx(worth["total_assets"])
    assert worth["net_worth"] == pytest.approx(worth["total_assets"] - worth["total_debts"])


def test_the_trend_carries_the_split(api):
    month_of_everything(api)

    point = api.get("/api/reports/net-worth/trend", params={
        "start_date": "2026-03-31", "end_date": "2026-03-31"}).json()["trend"][-1]

    assert point["cash"] + point["investments"] == pytest.approx(point["assets"])


def test_an_investment_account_without_holdings_keeps_its_value_in_history(api):
    """A gold account fed by transfers has no holdings: its worth is its ledger."""
    db = api.db
    db.add_account({"name": "Gold", "owner_id": db.get_owners()[0]["id"], "balance": 1050.0,
                    "opening_balance": 1050.0, "currency": "EUR", "account_type": "investment",
                    "opening_date": "2026-01-01"})

    point = db.get_net_worth_at("2026-03-31")

    assert point["investments"] == 1050.0
    assert point["assets"] == 1050.0


# ── Realised gains ───────────────────────────────────────────────────────────

def test_the_portfolio_summary_shows_realised_gains(api):
    month_of_everything(api)

    summary = api.get("/api/investments/summary").json()

    assert summary["realised_gains"] == pytest.approx(
        api.get("/api/reports/where-money-went", params={
            "start_date": "2026-01-01", "end_date": "2026-12-31"}).json()["realised_gains"])
    assert summary["realised_gains"] > 0
