"""
The Investments page's figures: total return and net invested, filterable.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_16_0.py -v
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from tests.test_release_2_11_1 import add_account, add_broker, add_security
from tests.test_release_2_15_0 import buy_shares, trade


@pytest.fixture
def portfolio(api):
    db = api.db
    broker = add_broker(db, add_account(db, balance=100000.0))
    held = buy_shares(api, broker, "HELD", quantity=10, price=100, date_="2026-01-10")
    db.update_holding_price(held, 120.0)                 # 200 of unrealised gain
    sold = buy_shares(api, broker, "SOLD", quantity=5, price=100, date_="2026-01-10")
    trade(api, sold, "sell", 5, 160, "2026-03-01")       # 300 of realised gain
    trade(api, held, "dividend", 0, 40, "2026-04-01")    # 40 of income
    return {"broker": broker, "held": held, "sold": sold}


def test_total_return_is_its_three_parts(api, portfolio):
    summary = api.get("/api/investments/summary").json()

    assert summary["total_gain_loss"] == pytest.approx(200.0)
    assert summary["realised_gains"] == pytest.approx(300.0)
    assert summary["total_dividends"] == pytest.approx(40.0)
    assert summary["total_return"] == pytest.approx(540.0)


def test_selling_with_a_gain_does_not_lower_the_total_return(api):
    """Selling used to turn the gain card to 0, as if the gain had gone."""
    db = api.db
    broker = add_broker(db, add_account(db, balance=10000.0))
    holding = buy_shares(api, broker, quantity=5, price=100, date_="2026-01-10")
    db.update_holding_price(holding, 200.0)
    before = api.get("/api/investments/summary").json()["total_return"]

    trade(api, holding, "sell", 5, 200, "2026-03-01")

    assert api.get("/api/investments/summary").json()["total_return"] == pytest.approx(before)


def test_net_invested_is_bought_less_what_sales_brought_in(api, portfolio):
    summary = api.get("/api/investments/summary").json()

    assert summary["net_invested"] == pytest.approx(1000.0 + 500.0 - 800.0)


def test_buy_fees_are_not_counted_twice_in_the_return(api):
    db = api.db
    broker = add_broker(db, add_account(db, balance=10000.0))
    holding = buy_shares(api, broker, "FEE", quantity=0, price=0)
    trade(api, holding, "buy", 10, 100, "2026-02-01", fees=10.0)
    db.update_holding_price(holding, 100.0)

    summary = api.get("/api/investments/summary").json()

    assert summary["total_return"] == pytest.approx(-10.0)
    assert summary["net_invested"] == pytest.approx(1010.0)


def test_the_figures_follow_the_account_filter(api, portfolio):
    db = api.db
    other_broker = add_broker(db, add_account(db, "Second cash", balance=1000.0))
    buy_shares(api, other_broker, "BETA", quantity=1, price=50, date_="2026-02-01")

    summary = api.get("/api/investments/summary", params={"account_id": other_broker}).json()

    assert summary["net_invested"] == pytest.approx(50.0)
    assert summary["realised_gains"] == 0
    assert summary["holdings_count"] == 1
