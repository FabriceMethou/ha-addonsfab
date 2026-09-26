"""
The Investments page review.

- Editing a trade crashed on every call since 2.1.0 (a misnamed variable), and
  behind the crash an edited sale was rewritten as whole-proceeds income next
  to its gain row. An edit is now the old trade deleted and the new one added.
- A sale's capital was the average cost of *all* buys, later ones included.
  It is now the buys made up to the sale; editing an earlier buy re-splits it.
- Editing a holding stored its quantity and average cost, which then overrode
  every later trade. A holding with trades takes both from them; values frozen
  by earlier edits are cleared at start.
- Price updates wrote the price straight to the table, so the investment
  account (and net worth) kept the old value. They also stored the quote in
  whatever currency Yahoo gave it.
- Holdings are valued in their own currency and, for display, converted; cost
  basis includes buy fees everywhere.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_investment_fixes.py -v
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
def path():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    yield f.name
    os.unlink(f.name)


@pytest.fixture
def db(path):
    database = FinanceDatabase(db_path=path)
    database.set_preference("display_currency", "EUR")
    return database


def make_portfolio(db, currency="EUR"):
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 10000.0,
                           "currency": currency, "account_type": "checking"})
    broker = db.add_account({"name": "Broker", "owner_id": owner, "balance": 0.0,
                             "currency": currency, "account_type": "investment"})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))
    holding = db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme Corp", "investment_type": "stock",
        "currency": currency, "quantity": 0, "average_cost": 0})
    return {"cash": cash, "broker": broker, "holding": holding}


@pytest.fixture
def pf(db):
    return make_portfolio(db)


def trade(db, pf, kind, shares, price, date, fees=0.0, tax=0.0):
    return db.add_investment_transaction(data(pf, kind, shares, price, date, fees, tax))


def data(pf, kind, shares, price, date, fees=0.0, tax=0.0):
    total = price if kind == "dividend" else shares * price
    return {"holding_id": pf["holding"], "transaction_type": kind, "transaction_date": date,
            "shares": shares, "price_per_share": price, "total_amount": total,
            "fees": fees, "tax": tax, "currency": "EUR"}


def holding(db, pf):
    return next(h for h in db.get_investment_holdings() if h["id"] == pf["holding"])


def balance(db, account_id):
    return next(a["balance"] for a in db.get_accounts() if a["id"] == account_id)


def sale_rows(db, date):
    with db.db_connection(commit=False) as conn:
        return [(r[0], r[1]) for r in conn.execute(
            "SELECT t.amount, tt.category FROM transactions t "
            "JOIN transaction_types tt ON tt.id = t.type_id "
            "WHERE t.transaction_date = ? ORDER BY t.id", (date,))]


def last_trade_id(db):
    return max(t["id"] for t in db.get_investment_transactions())


# ── editing trades ───────────────────────────────────────────────────────────

def test_a_buy_can_be_edited(db, pf):
    """It raised NameError on every call since 2.1.0."""
    buy = trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    assert db.update_investment_transaction(buy, data(pf, "buy", 12, 100.0, "2026-09-01")) is True
    assert holding(db, pf)["quantity"] == 12
    assert balance(db, pf["cash"]) == 10000 - 1200


def test_an_edited_sale_keeps_capital_and_gain_apart(db, pf):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    sale = trade(db, pf, "sell", 10, 130.0, "2026-09-10")

    db.update_investment_transaction(sale, data(pf, "sell", 10, 140.0, "2026-09-10"))

    assert sale_rows(db, "2026-09-10") == [(1000.0, "transfer"), (400.0, "income")]
    assert balance(db, pf["cash"]) == 10000 - 1000 + 1400


def test_editing_an_unknown_trade_finds_nothing(db, pf):
    assert db.update_investment_transaction(9999, data(pf, "buy", 1, 1.0, "2026-09-01")) is False


# ── the sale split ───────────────────────────────────────────────────────────

def test_a_later_buy_does_not_change_an_earlier_sale(db, pf):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    trade(db, pf, "sell", 10, 130.0, "2026-09-10")
    trade(db, pf, "buy", 10, 200.0, "2026-09-20")
    assert sale_rows(db, "2026-09-10") == [(1000.0, "transfer"), (300.0, "income")]


def test_editing_an_earlier_buy_re_splits_the_sale(db, pf):
    buy = trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    trade(db, pf, "sell", 10, 130.0, "2026-09-10")
    cash_after_sale = balance(db, pf["cash"])

    db.update_investment_transaction(buy, data(pf, "buy", 10, 110.0, "2026-09-01"))

    assert sale_rows(db, "2026-09-10") == [(1100.0, "transfer"), (200.0, "income")]
    assert balance(db, pf["cash"]) == cash_after_sale - 100   # only the buy's own change
    assert db.verify_balances() == []


def test_a_sale_at_cost_has_no_gain_row(db, pf):
    buy = trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    trade(db, pf, "sell", 10, 130.0, "2026-09-10")
    db.update_investment_transaction(buy, data(pf, "buy", 10, 130.0, "2026-09-01"))
    assert sale_rows(db, "2026-09-10") == [(1300.0, "transfer")]


def test_buy_fees_are_part_of_the_cost(db, pf):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01", fees=10.0)
    assert holding(db, pf)["average_cost"] == 101.0
    trade(db, pf, "sell", 10, 130.0, "2026-09-10")
    assert sale_rows(db, "2026-09-10") == [(1010.0, "transfer"), (290.0, "income")]


def test_a_dividend_credits_the_net_amount_and_records_the_tax(db, pf):
    """Dividends are entered net; the tax is kept for the record only."""
    trade(db, pf, "dividend", 0, 85.0, "2026-09-15", tax=15.0)
    assert balance(db, pf["cash"]) == 10085.0
    from api import investments as api
    api.db = db
    summary = api.get_summary(current_user=None)
    assert (summary["total_dividends"], summary["dividend_tax_withheld"]) == (85.0, 15.0)


# ── editing holdings ─────────────────────────────────────────────────────────

def test_editing_a_holding_no_longer_freezes_its_quantity(db, pf):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    db.update_investment_holding(pf["holding"], {"quantity": 10, "purchase_price": 100.0, "notes": "x"})
    trade(db, pf, "sell", 5, 120.0, "2026-09-10")
    trade(db, pf, "buy", 20, 90.0, "2026-09-15")
    assert holding(db, pf)["quantity"] == 25


def test_a_holding_without_trades_keeps_what_is_stored(db, pf):
    db.update_investment_holding(pf["holding"], {"quantity": 7, "purchase_price": 50.0})
    h = holding(db, pf)
    assert (h["quantity"], h["average_cost"], h["transaction_count"]) == (7, 50.0, 0)


def test_moving_a_holding_re_values_the_account_it_left(db, pf):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    other = db.add_account({"name": "Broker 2", "owner_id": db.get_owners()[0]["id"], "balance": 0.0,
                            "currency": "EUR", "account_type": "investment"})
    db.update_investment_holding(pf["holding"], {"account_id": other})
    assert (balance(db, pf["broker"]), balance(db, other)) == (0.0, 1000.0)


def test_frozen_values_are_cleared_at_start(db, path, pf):
    """What editing a holding left behind before this release."""
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    trade(db, pf, "sell", 4, 120.0, "2026-09-10")
    untraded = db.add_investment_holding({
        "account_id": pf["broker"], "symbol": "OLD", "name": "Old fund", "investment_type": "etf",
        "currency": "EUR"})
    db.update_investment_holding(untraded, {"quantity": 3, "purchase_price": 40.0})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE investment_holdings SET quantity = 10, average_cost = 100 WHERE id = ?",
                     (pf["holding"],))

    restarted = FinanceDatabase(db_path=path)

    by_id = {h["id"]: h for h in restarted.get_investment_holdings()}
    assert by_id[pf["holding"]]["quantity"] == 6
    assert (by_id[untraded]["quantity"], by_id[untraded]["average_cost"]) == (3, 40)


# ── prices ───────────────────────────────────────────────────────────────────

@pytest.fixture
def api(db, monkeypatch):
    from api import investments
    investments.db = db
    return investments


def quote(api, monkeypatch, price, currency):
    monkeypatch.setattr(api, "_get_quote", lambda symbol: (price, currency))


def test_a_price_update_re_values_the_account(api, db, pf, monkeypatch):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    quote(api, monkeypatch, 120.0, "EUR")
    api.update_holding_price(pf["holding"], current_user=None)
    assert balance(db, pf["broker"]) == 1200.0


def test_a_quote_in_another_currency_is_converted(api, db, pf, monkeypatch):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    db.add_currency({"code": "USD", "name": "US Dollar", "symbol": "$", "exchange_rate_to_eur": 0.9})
    quote(api, monkeypatch, 150.0, "USD")
    result = api.update_holding_price(pf["holding"], current_user=None)
    assert result["current_price"] == pytest.approx(135.0)
    assert holding(db, pf)["current_price"] == pytest.approx(135.0)


def test_a_quote_without_a_rate_is_not_stored(api, db, pf, monkeypatch):
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    quote(api, monkeypatch, 150.0, "JPY")
    with pytest.raises(HTTPException) as err:
        api.update_holding_price(pf["holding"], current_user=None)
    assert err.value.status_code == 400 and "no exchange rate for JPY" in err.value.detail
    assert holding(db, pf)["current_price"] in (0, None)


def test_london_pence_are_turned_into_pounds(api):
    assert api._in_main_unit(1234.0, "GBp") == (12.34, "GBP")
    assert api._in_main_unit(10.0, "EUR") == (10.0, "EUR")


def test_holdings_are_shown_in_the_display_currency(api, db):
    pf = make_portfolio(db, currency="DKK")
    trade(db, pf, "buy", 10, 100.0, "2026-09-01")
    [h] = api.get_holdings(current_user=None)["holdings"]
    assert (h["currency"], h["current_value"]) == ("DKK", 1000.0)
    assert h["current_value_display"] == pytest.approx(1000 * 0.134)


def test_the_debug_and_repair_endpoints_are_gone(api):
    paths = {route.path for route in api.router.routes}
    assert not paths & {"/test-price/{symbol}", "/fix-dividend-totals",
                        "/holdings/{holding_id}/current-price"}
