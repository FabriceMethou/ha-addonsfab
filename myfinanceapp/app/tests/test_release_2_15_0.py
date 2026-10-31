"""
Price history, the daily refresh and the Investments report.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_15_0.py -v
"""
import os
import sqlite3
import sys
from datetime import date, timedelta

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from database import FinanceDatabase
from tests.test_release_2_11_1 import add_account, add_broker, add_security


def buy_shares(api, broker, symbol="ACME", quantity=5, price=100, date_="2026-02-10"):
    return api.post("/api/investments/holdings", json={
        "security_id": add_security(api, symbol), "account_id": broker, "quantity": quantity,
        "purchase_price": price, "purchase_date": date_}).json()["holding_id"]


def trade(api, holding, kind, quantity, price, date_, fees=0.0, tax=0.0):
    response = api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": kind, "quantity": quantity, "price": price,
        "transaction_date": date_, "fees": fees, "tax": tax})
    assert response.status_code == 200, response.text


def prices(db, holding):
    with db.db_connection(commit=False) as conn:
        return {row["price_date"]: row["price"] for row in conn.execute(
            "SELECT price_date, price FROM price_history WHERE holding_id = ? ORDER BY price_date",
            (holding,)).fetchall()}


def set_quote(db, holding, price, on):
    """A quote as it would have been saved on an earlier day."""
    with db.db_connection(commit=True) as conn:
        conn.execute("""
            INSERT OR REPLACE INTO price_history (holding_id, price_date, price, source)
            VALUES (?, ?, ?, 'quote')
        """, (holding, on, price))
        conn.execute("UPDATE investment_holdings SET current_price = ? WHERE id = ?", (price, holding))


@pytest.fixture
def broker(api):
    return add_broker(api.db, add_account(api.db, balance=100000.0))


# ── Price history ────────────────────────────────────────────────────────────

def test_a_quote_is_written_to_history(api, broker):
    holding = buy_shares(api, broker)

    api.db.update_holding_price(holding, 120.0)

    assert prices(api.db, holding)[date.today().isoformat()] == 120.0


def test_a_trade_is_a_price_anchor(api, broker):
    holding = buy_shares(api, broker, price=100, date_="2026-02-10")
    trade(api, holding, "buy", 1, 130, "2026-04-01")

    assert prices(api.db, holding) == {"2026-02-10": 100.0, "2026-04-01": 130.0}


def test_a_dividend_is_not_a_price(api, broker):
    holding = buy_shares(api, broker)
    trade(api, holding, "dividend", 0, 20, "2026-05-01")

    assert "2026-05-01" not in prices(api.db, holding)


def test_a_quote_on_the_same_day_outranks_a_trade(api, broker):
    today = date.today().isoformat()
    holding = buy_shares(api, broker, price=100, date_=today)

    api.db.update_holding_price(holding, 110.0)
    trade(api, holding, "buy", 1, 105, today)

    assert prices(api.db, holding)[today] == 110.0


def test_deleting_a_trade_removes_its_anchor(api, broker):
    db = api.db
    holding = buy_shares(api, broker, date_="2026-02-10")
    trade(api, holding, "buy", 1, 130, "2026-04-01")
    with db.db_connection(commit=False) as conn:
        trade_id = conn.execute("SELECT id FROM investment_transactions WHERE transaction_date = '2026-04-01'").fetchone()[0]

    assert api.delete(f"/api/investments/transactions/{trade_id}").status_code == 200

    assert "2026-04-01" not in prices(db, holding)


def test_deleting_a_holding_removes_its_history(api, broker):
    db = api.db
    holding = buy_shares(api, broker)

    assert api.delete(f"/api/investments/holdings/{holding}").status_code == 200

    assert prices(db, holding) == {}


def test_the_upgrade_fills_history_from_past_trades_and_todays_quote(tmp_path):
    path = str(tmp_path / "old.db")
    db = FinanceDatabase(db_path=path)
    cash = add_account(db, balance=10000.0)
    broker = add_broker(db, cash)
    sec = db.add_security({"symbol": "OLD", "name": "Old Co", "investment_type": "stock", "currency": "EUR"})
    holding = db.add_investment_holding({"account_id": broker, "security_id": sec, "currency": "EUR", "current_price": 0})
    db.add_investment_transaction({
        "holding_id": holding, "transaction_type": "buy", "transaction_date": "2026-02-10", "shares": 5,
        "price_per_share": 100, "total_amount": 500, "fees": 0, "tax": 0, "currency": "EUR"})
    db.update_holding_price(holding, 150.0)
    conn = sqlite3.connect(path)
    conn.execute("DROP TABLE price_history")
    conn.execute("UPDATE investment_holdings SET last_price_update = '2026-09-15T08:00:00'")
    conn.commit()
    conn.close()

    reopened = FinanceDatabase(db_path=path)

    assert prices(reopened, holding) == {"2026-02-10": 100.0, "2026-09-15": 150.0}


# ── Past values use the price of the day ─────────────────────────────────────

def test_past_net_worth_uses_the_price_of_that_day(api, broker):
    """The review's own example: bought at 100, worth 300 today, was about 500 in February."""
    db = api.db
    holding = buy_shares(api, broker, quantity=5, price=100, date_="2026-02-10")
    db.update_holding_price(holding, 300.0)

    assert db.get_net_worth_at("2026-02-28")["investments"] == 500.0
    assert db.get_net_worth_at(date.today().isoformat())["investments"] == 1500.0


def test_history_between_two_prices_uses_the_earlier_one(api, broker):
    db = api.db
    holding = buy_shares(api, broker, quantity=1, price=100, date_="2026-02-10")
    set_quote(db, holding, 140.0, "2026-05-01")

    assert db.get_net_worth_at("2026-04-30")["investments"] == 100.0
    assert db.get_net_worth_at("2026-05-01")["investments"] == 140.0


def test_an_unquoted_holding_stays_at_its_cost(api, broker):
    """Life insurance and the like have no market price: worth what they cost."""
    db = api.db
    holding = buy_shares(api, broker, quantity=1, price=100, date_="2026-02-10")
    trade(api, holding, "buy", 1, 200, "2026-03-10")

    assert db.get_net_worth_at(date.today().isoformat())["investments"] == 300.0
    assert db.get_account(broker)["balance"] == 300.0


def test_todays_history_agrees_with_the_account_value(api, broker):
    db = api.db
    holding = buy_shares(api, broker, quantity=3, price=100)
    db.update_holding_price(holding, 123.45)

    assert db.get_net_worth_at(date.today().isoformat())["investments"] == pytest.approx(
        db.get_account(broker)["balance"])


# ── Daily refresh ────────────────────────────────────────────────────────────

def test_the_refresh_runs_once_a_day_and_catches_up_after_a_restart(api):
    import price_refresh

    calls = []
    today = date(2026, 3, 10)

    assert price_refresh.refresh_if_due(api.db, lambda: calls.append(1), today) is True
    assert price_refresh.refresh_if_due(api.db, lambda: calls.append(1), today) is False
    assert calls == [1]
    # Off for days, then back: one refresh, on the first check.
    assert price_refresh.refresh_if_due(api.db, lambda: calls.append(1), today + timedelta(days=5)) is True
    assert calls == [1, 1]


def test_the_refresh_can_be_turned_off(api):
    import price_refresh

    calls = []
    api.db.set_preference(price_refresh.ENABLED_PREFERENCE, "false")

    assert price_refresh.refresh_if_due(api.db, lambda: calls.append(1), date(2026, 3, 10)) is False
    assert calls == []


def test_a_failed_refresh_is_tried_again_at_the_next_check(api):
    import price_refresh

    def fail():
        raise RuntimeError("no network")

    today = date(2026, 3, 10)
    assert price_refresh.refresh_if_due(api.db, fail, today) is False

    calls = []
    assert price_refresh.refresh_if_due(api.db, lambda: calls.append(1), today) is True
    assert calls == [1]


def test_the_setting_is_accepted_by_the_settings_api(api):
    import price_refresh

    response = api.put(f"/api/settings/{price_refresh.ENABLED_PREFERENCE}", json={"value": "false"})

    assert response.status_code == 200
    assert api.db.get_preference(price_refresh.ENABLED_PREFERENCE) == "false"


# ── The report ───────────────────────────────────────────────────────────────

@pytest.fixture
def activity(api, broker):
    """Start the year with 5 shares at 100; then a buy, a sale and a dividend."""
    db = api.db
    holding = buy_shares(api, broker, quantity=5, price=100, date_="2025-12-10")
    trade(api, holding, "buy", 5, 120, "2026-02-01", fees=4.0)      # 604 out
    trade(api, holding, "sell", 2, 150, "2026-03-01", fees=1.0)     # 299 in
    trade(api, holding, "dividend", 0, 20, "2026-04-01", tax=3.0)
    set_quote(db, holding, 160.0, "2026-06-30")
    return {"holding": holding}


def report(api, **params):
    return api.get("/api/reports/investments", params={
        "start_date": "2026-01-01", "end_date": "2026-06-30", **params}).json()


def test_the_report_tiles_add_up(api, activity):
    tiles = report(api)["summary"]

    assert tiles["start_value"] == 500.0
    assert tiles["end_value"] == 8 * 160.0
    assert tiles["net_contributed"] == 604.0 - 299.0
    assert tiles["market_gain"] == pytest.approx(
        tiles["end_value"] - tiles["start_value"] - tiles["net_contributed"])
    assert tiles["dividends"] == 20.0
    assert tiles["fees_and_tax"] == 8.0
    assert tiles["realised_gains"] > 0


def test_each_holding_shows_its_movements(api, activity):
    row = report(api)["holdings"][0]

    assert row["symbol"] == "ACME"
    assert row["start_value"] == 500.0
    assert row["bought"] == 604.0
    assert row["sold"] == 299.0
    assert row["income"] == 20.0
    assert row["end_value"] == 1280.0
    assert row["gain"] == pytest.approx(1280.0 - 500.0 - 604.0 + 299.0 + 20.0)


def test_a_holding_with_nothing_in_the_period_is_left_out(api, broker, activity):
    buy_shares(api, broker, "GONE", quantity=1, price=10, date_="2025-01-01")
    with api.db.db_connection(commit=False) as conn:
        gone = conn.execute("""
            SELECT h.id FROM investment_holdings h JOIN securities s ON s.id = h.security_id
             WHERE s.symbol = 'GONE'
        """).fetchone()[0]
    trade(api, gone, "sell", 1, 12, "2025-06-01")

    assert [row["symbol"] for row in report(api)["holdings"]] == ["ACME"]


def test_the_series_has_a_point_per_month_end(api, activity):
    series = report(api)["series"]

    assert [point["date"] for point in series] == [
        "2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31",
        "2026-04-30", "2026-05-31", "2026-06-30"]
    assert series[0]["value"] == 500.0
    assert series[0]["contributed"] == 500.0
    assert series[-1]["contributed"] == 500.0 + 604.0 - 299.0
    assert series[-1]["value"] == 1280.0


def test_dividends_are_listed_by_month(api, activity):
    assert report(api)["dividends_by_month"] == [{"month": "2026-04", "amount": 20.0}]


def test_allocation_is_at_the_end_of_the_period(api, activity):
    allocation = report(api)["allocation"]

    assert allocation[0]["category"] == "stock"
    assert allocation[0]["total"] == 1280.0
    assert allocation[0]["subcategories"][0]["category"] == "ACME"


def test_the_report_filters_by_owner_and_account(api, activity, broker):
    db = api.db
    other = db.add_owner("Other")
    second = add_broker(db, add_account(db, "Second cash", balance=1000.0))
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET name = 'Second broker' WHERE id = ?", (second,))
    buy_shares(api, second, "BETA", quantity=1, price=50, date_="2026-02-01")

    assert [r["symbol"] for r in report(api, account_id=second)["holdings"]] == ["BETA"]
    assert report(api, owner_id=other)["holdings"] == []
    assert report(api, owner_id=other)["summary"]["end_value"] == 0
    assert sorted(r["symbol"] for r in report(api)["holdings"]) == ["ACME", "BETA"]


def test_the_report_converts_to_the_display_currency(api):
    db = api.db
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE currencies SET exchange_rate_to_eur = 0.1 WHERE code = 'SEK'")
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "SEK cash", "owner_id": owner, "balance": 10000.0, "opening_balance": 10000.0,
                           "currency": "SEK", "account_type": "checking", "create_initial_validation": False})
    broker = db.add_account({"name": "SEK broker", "owner_id": owner, "balance": 0.0, "opening_balance": 0.0,
                             "currency": "SEK", "account_type": "investment", "linked_account_id": cash,
                             "create_initial_validation": False})
    buy_shares(api, broker, "SWE", quantity=1, price=1000, date_="2026-02-01")

    tiles = report(api)["summary"]

    assert tiles["end_value"] == pytest.approx(100.0)
    assert tiles["net_contributed"] == pytest.approx(100.0)


def test_the_portfolio_summary_filters_too(api, activity):
    other = api.db.add_owner("Other")

    assert api.get("/api/investments/summary").json()["holdings_count"] == 1
    theirs = api.get("/api/investments/summary", params={"owner_id": other}).json()
    assert theirs["total_value"] == 0
    assert theirs["holdings_count"] == 0


def test_a_trade_after_the_last_quote_does_not_change_todays_value(api, broker):
    """The price after a later trade may differ, but today agrees with the account."""
    db = api.db
    holding = buy_shares(api, broker, quantity=3, price=100, date_="2026-01-10")
    db.update_holding_price(holding, 110.0)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE price_history SET price_date = '2026-02-01' WHERE source = 'quote'")
    trade(api, holding, "buy", 1, 500, yesterday)

    assert db.get_net_worth_at(date.today().isoformat())["investments"] == pytest.approx(
        db.get_account(broker)["balance"])
    assert db.get_net_worth_at(yesterday)["investments"] == 4 * 500.0


def test_an_account_without_holdings_is_in_the_report(api):
    """Otherwise the report and net worth disagree by the whole gold account."""
    db = api.db
    cash = add_account(db, balance=1000.0)
    gold = db.add_account({"name": "Gold", "owner_id": db.get_owners()[0]["id"], "balance": 0.0,
                           "opening_balance": 0.0, "currency": "EUR", "account_type": "investment",
                           "opening_date": "2026-01-01"})
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.category = 'transfer' LIMIT 1
        """).fetchone()
    db.add_transaction({"account_id": cash, "amount": -150.0, "transaction_date": "2026-04-01",
                        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
                        "description": "x", "destinataire": "Gold", "confirmed": True,
                        "transfer_account_id": gold, "is_transfer": True})

    result = report(api)

    assert result["summary"]["end_value"] == 150.0
    assert result["summary"]["net_contributed"] == 150.0
    assert result["summary"]["market_gain"] == 0
    assert result["holdings"][0]["symbol"] == "Gold"
    assert result["summary"]["end_value"] == db.get_net_worth_at("2026-06-30")["investments"]


def test_a_gain_of_nothing_is_not_negative(api, broker):
    db = api.db
    holding = buy_shares(api, broker, quantity=3, price=33.333, date_="2026-02-10")
    assert holding

    gain = report(api)["holdings"][0]["gain"]

    assert str(gain) == "0.0"
