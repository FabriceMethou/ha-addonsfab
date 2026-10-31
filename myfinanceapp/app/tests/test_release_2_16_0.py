"""
The Investments page's figures: total return and net invested, filterable.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_16_0.py -v
"""
import os
import sqlite3
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


# ── Found in review ──────────────────────────────────────────────────────────

def flagged_expense(db, account):
    from tests.test_release_2_11_1 import add_expense

    expense = add_expense(db, account, amount=-100.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE transactions SET is_historical = 1 WHERE id = ?", (expense,))
        conn.execute("UPDATE accounts SET balance = 1000 WHERE id = ?", (account,))
    return expense


def test_the_recalculate_button_does_not_recount_flagged_rows(api):
    """It moved a real account by 1,353 on a click meant to be routine."""
    db = api.db
    account = add_account(db, balance=1000.0, opening_date="2026-01-01")
    expense = flagged_expense(db, account)

    db.recalculate_all_balances()

    assert db.get_account(account)["balance"] == 1000.0
    assert db.get_transaction(expense)["is_historical"] == 1


def test_only_the_data_check_repair_recounts_them_and_it_says_so(api):
    db = api.db
    account = add_account(db, balance=1000.0, opening_date="2026-01-01")
    flagged_expense(db, account)

    repair = next(r for r in api.get("/api/settings/data-check").json()["repairs"]
                  if r["id"] == "balances")
    assert "before the account opened" in repair["detail"]

    assert api.post("/api/settings/data-check/repair", json={"repair": "balances"}).status_code == 200
    assert db.get_account(account)["balance"] == 900.0


def loan_paid_from(db, loan_currency="DKK"):
    from tests.test_release_2_11_1 import add_debt

    account = add_account(db, balance=1000.0)
    debt = add_debt(db, account, principal=500.0, rate=0.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET currency = ? WHERE id = ?", (loan_currency, debt))
    return account, debt


def test_a_payment_can_be_corrected_when_its_account_is_in_another_currency(api):
    from tests.test_release_2_11_1 import pay, payment_rows

    db = api.db
    _, debt = loan_paid_from(db)
    assert pay(api, debt, 50.0).status_code == 200

    response = api.put(f"/api/debts/payments/{payment_rows(db, debt)[0]['id']}", json={"notes": "typo"})

    assert response.status_code == 200, response.text


def test_moving_a_payment_to_another_currency_is_still_refused(api):
    from tests.test_release_2_11_1 import add_debt, pay, payment_rows

    db = api.db
    debt = add_debt(db, add_account(db), principal=500.0, rate=0.0)
    assert pay(api, debt, 50.0).status_code == 200
    other = db.add_account({"name": "SEK", "owner_id": db.get_owners()[0]["id"], "balance": 0.0,
                            "opening_balance": 0.0, "currency": "SEK", "account_type": "checking",
                            "create_initial_validation": False})

    response = api.put(f"/api/debts/payments/{payment_rows(db, debt)[0]['id']}", json={"account_id": other})

    assert response.status_code == 400


def test_correcting_a_payment_with_no_ledger_rows_creates_no_cash(api):
    from tests.test_release_2_11_1 import add_debt, payment_rows

    db = api.db
    account = add_account(db, balance=1000.0)
    debt = add_debt(db, account, principal=500.0, rate=0.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("""
            INSERT INTO debt_payments (debt_id, payment_date, amount, principal_paid, interest_paid, extra_payment)
            VALUES (?, '2026-02-01', 50, 50, 0, 0)
        """, (debt,))

    response = api.put(f"/api/debts/payments/{payment_rows(db, debt)[0]['id']}", json={"notes": "x"})

    assert response.status_code == 400
    assert "no ledger" in response.json()["detail"]
    assert db.get_account(account)["balance"] == 1000.0


def orphan_a_transaction(db, account):
    """A real money row whose subcategory is gone: not something to delete."""
    from tests.test_release_2_11_1 import add_expense

    expense = add_expense(db, account, amount=-40.0)
    conn = sqlite3.connect(db.db_path)
    conn.execute("UPDATE transactions SET subtype_id = 99999 WHERE id = ?", (expense,))
    conn.commit()
    conn.close()
    return expense


def test_the_dead_rows_repair_never_deletes_a_money_row(api):
    db = api.db
    account = add_account(db, balance=1000.0)
    expense = orphan_a_transaction(db, account)
    conn = sqlite3.connect(db.db_path)
    conn.execute("INSERT INTO balance_validations (account_id, validation_date, system_balance, "
                 "actual_balance, difference, is_match) VALUES (999, '2026-01-01', 1, 1, 0, 1)")
    conn.commit()
    conn.close()

    report = api.get("/api/settings/data-check").json()
    assert next(r for r in report["repairs"] if r["id"] == "dead_rows")["count"] == 1
    assert any(p["kind"] == "missing link" for p in report["problems"])

    assert api.post("/api/settings/data-check/repair", json={"repair": "dead_rows"}).status_code == 200

    conn = sqlite3.connect(db.db_path)
    assert conn.execute("SELECT COUNT(*) FROM transactions WHERE id = ?", (expense,)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM balance_validations").fetchone()[0] == 0
    conn.close()


def test_a_trade_keeping_its_holding_is_not_a_dead_row(api):
    """Its cash row is gone, but deleting it would change the position."""
    db = api.db
    broker = add_broker(db, add_account(db, balance=1000.0))
    holding = buy_shares(api, broker, quantity=2, price=10, date_="2026-02-01")
    conn = sqlite3.connect(db.db_path)
    conn.execute("UPDATE investment_transactions SET linked_transaction_id = 99999 WHERE holding_id = ?", (holding,))
    conn.commit()
    conn.close()

    report = api.get("/api/settings/data-check").json()

    assert next(r for r in report["repairs"] if r["id"] == "dead_rows")["count"] == 0
    assert any(p["kind"] == "missing link" for p in report["problems"])


def test_an_aborted_price_refresh_is_not_counted_as_done(api, monkeypatch):
    from api import investments as investments_api

    db = api.db
    broker = add_broker(db, add_account(db, balance=1000.0))
    buy_shares(api, broker, quantity=1, price=10, date_="2026-02-01")

    def aborted(_holdings, _delay):
        investments_api._price_update_state.update({"running": False, "error": "lost the network"})
    monkeypatch.setattr(investments_api, "_run_price_update", aborted)

    with pytest.raises(RuntimeError):
        investments_api.refresh_all_prices_now()


def test_a_refresh_already_running_is_not_counted_as_done(api, monkeypatch):
    from api import investments as investments_api

    db = api.db
    broker = add_broker(db, add_account(db, balance=1000.0))
    buy_shares(api, broker, quantity=1, price=10, date_="2026-02-01")
    monkeypatch.setitem(investments_api._price_update_state, "running", True)

    with pytest.raises(RuntimeError):
        investments_api.refresh_all_prices_now()
