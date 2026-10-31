"""
The wrong numbers found in the 2.11 review, each pinned through the real API.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_11_1.py -v
"""
import os
import sqlite3
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from database import FinanceDatabase


def add_account(db, name="Cash", owner=None, balance=50000.0, **extra):
    return db.add_account({
        "name": name, "owner_id": owner or db.get_owners()[0]["id"], "balance": balance,
        "opening_balance": balance, "currency": "EUR", "account_type": "checking",
        "create_initial_validation": False, **extra})


def add_debt(db, account, principal=1000.0, balance=None, rate=12.0, name="Car loan"):
    return db.add_debt({
        "name": name, "principal_amount": principal,
        "current_balance": principal if balance is None else balance,
        "interest_rate": rate, "interest_type": "simple", "monthly_payment": 100.0,
        "payment_day": 1, "currency": "EUR", "linked_account_id": account,
        "start_date": "2026-01-01"})


def pay(api, debt, amount, kind="regular", date="2026-02-01"):
    return api.post("/api/debts/payments", json={
        "debt_id": debt, "amount": amount, "payment_date": date, "payment_type": kind})


def payment_rows(db, debt):
    with db.db_connection(commit=False) as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM debt_payments WHERE debt_id = ?", (debt,)).fetchall()]


def backdate_debt(db, debt, created_at="2026-01-01 00:00:00"):
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET created_at = ? WHERE id = ?", (created_at, debt))


def add_broker(db, cash=None):
    return db.add_account({
        "name": "Broker", "owner_id": db.get_owners()[0]["id"], "balance": 0.0,
        "opening_balance": 0.0, "currency": "EUR", "account_type": "investment",
        "linked_account_id": cash, "opening_date": "2026-01-01"})


def add_security(api, symbol="ACME"):
    return api.post("/api/investments/securities", json={
        "symbol": symbol, "name": f"{symbol} Inc", "investment_type": "stock",
        "currency": "EUR"}).json()["security_id"]


def expense_type(db):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.category = 'expense' AND tt.name NOT LIKE 'Debt%' LIMIT 1
        """).fetchone())


def add_expense(db, account, amount=-100.0, date="2026-02-01", **extra):
    type_id, subtype_id = expense_type(db)
    return db.add_transaction({
        "account_id": account, "amount": amount, "transaction_date": date, "currency": "EUR",
        "type_id": type_id, "subtype_id": subtype_id, "description": "shop",
        "destinataire": "Shop", "confirmed": True, **extra})


# ── Account creation ─────────────────────────────────────────────────────────

def test_account_with_an_opening_date_saves_its_checkpoint(api):
    owner = api.db.get_owners()[0]["id"]
    account_id = api.db.add_account({
        "name": "Daily", "owner_id": owner, "balance": 250.0, "opening_balance": 250.0,
        "currency": "EUR", "account_type": "checking", "opening_date": "2026-01-01"})

    with api.db.db_connection(commit=False) as conn:
        checkpoint = conn.execute(
            "SELECT * FROM balance_validations WHERE account_id = ?", (account_id,)).fetchone()
    assert checkpoint["actual_balance"] == 250.0
    assert checkpoint["validation_date"] == "2026-01-01"


# ── Owner filter ─────────────────────────────────────────────────────────────

def test_owner_filter_keeps_the_debts_of_that_owner(api):
    db = api.db
    mine = db.get_owners()[0]["id"]
    other = db.add_owner("Other")
    add_debt(db, add_account(db, owner=mine), principal=1000.0)
    add_debt(db, add_account(db, "Theirs", owner=other), principal=300.0, name="Their loan")

    assert api.get("/api/reports/net-worth").json()["total_debts"] == 1300.0
    assert api.get(f"/api/reports/net-worth?owner_id={mine}").json()["total_debts"] == 1000.0
    assert api.get(f"/api/reports/net-worth?owner_id={other}").json()["total_debts"] == 300.0


def test_owner_filter_applies_to_past_net_worth_too(api):
    db = api.db
    mine = db.get_owners()[0]["id"]
    other = db.add_owner("Other")
    debt = add_debt(db, add_account(db, owner=mine), principal=1000.0)
    backdate_debt(db, debt)

    assert db.get_net_worth_at("2026-06-30", owner_id=mine)["debts"] == 1000.0
    assert db.get_net_worth_at("2026-06-30", owner_id=other)["debts"] == 0


# ── Loan history ─────────────────────────────────────────────────────────────

def test_history_of_a_loan_entered_mid_life_uses_what_is_owed(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=100000.0, balance=60000.0)
    backdate_debt(db, debt)

    assert db.get_net_worth_at("2026-01-15")["debts"] == 60000.0


def test_history_adds_back_payments_made_after_that_date(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=0.0)
    backdate_debt(db, debt)
    assert pay(api, debt, 100.0, date="2026-03-01").status_code == 200

    assert db.get_net_worth_at("2026-02-15")["debts"] == 1000.0
    assert db.get_net_worth_at("2026-03-15")["debts"] == 900.0


def test_deleted_loan_with_a_balance_leaves_history(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0)
    backdate_debt(db, debt)
    assert api.delete(f"/api/debts/{debt}").status_code == 200

    assert db.get_net_worth_at("2026-02-15")["debts"] == 0


def test_paid_off_loan_stays_in_history(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=100.0, rate=0.0)
    backdate_debt(db, debt)
    assert pay(api, debt, 100.0, date="2026-03-01").status_code == 200
    assert db.get_debt(debt)["is_active"] == 0

    assert db.get_net_worth_at("2026-02-15")["debts"] == 100.0
    assert db.get_net_worth_at("2026-03-15")["debts"] == 0


# ── Payment history ──────────────────────────────────────────────────────────

def test_extra_payment_stores_no_interest_and_its_real_amount(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=12.0)
    assert pay(api, debt, 200.0, kind="extra").status_code == 200

    row = payment_rows(db, debt)[0]
    assert row["interest_paid"] == 0
    assert row["amount"] == 200.0
    assert row["extra_payment"] == 200.0
    assert db.get_debt(debt)["current_balance"] == 800.0


@pytest.mark.parametrize("rate,kind", [(12.0, "extra"), (0.0, "regular")])
def test_payments_without_interest_appear_in_history(api, rate, kind):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=rate)
    assert pay(api, debt, 200.0, kind=kind).status_code == 200

    payments = api.get(f"/api/debts/{debt}/payments").json()["payments"]
    assert len(payments) == 1
    assert payments[0]["total_paid"] == 200.0
    assert payments[0]["description"]


def test_regular_payment_total_is_interest_plus_capital(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=12.0)
    assert pay(api, debt, 100.0).status_code == 200

    payment = api.get(f"/api/debts/{debt}/payments").json()["payments"][0]
    assert payment["interest_paid"] == 10.0
    assert payment["principal_paid"] == 90.0
    assert payment["total_paid"] == 100.0


def test_payment_smaller_than_the_interest_stores_only_what_was_paid(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=12.0)
    assert pay(api, debt, 4.0).status_code == 200

    row = payment_rows(db, debt)[0]
    assert row["interest_paid"] == 4.0
    assert row["principal_paid"] == 0


def test_migration_clears_false_interest_on_old_extra_payments(tmp_path):
    path = str(tmp_path / "old.db")
    db = FinanceDatabase(db_path=path)
    debt = add_debt(db, add_account(db), principal=1000.0)
    regular = db.add_debt_payment({"debt_id": debt, "amount": 100.0,
                                   "payment_date": "2026-02-01", "payment_type": "regular"})
    with db.db_connection(commit=True) as conn:
        # What 2.11.0 stored for an extra payment of 200.
        conn.execute("""
            INSERT INTO debt_payments (debt_id, payment_date, amount, principal_paid,
                                       interest_paid, extra_payment)
            VALUES (?, '2026-03-01', 0, 0, 24.12, 200)
        """, (debt,))
    regular_before = payment_rows(db, debt)[0]

    reopened = FinanceDatabase(db_path=path)

    rows = {r["id"]: r for r in payment_rows(reopened, debt)}
    extra = next(r for r in rows.values() if r["id"] != regular)
    assert extra["interest_paid"] == 0
    assert extra["amount"] == 200.0
    assert rows[regular] == regular_before


# ── Overpaying a loan ────────────────────────────────────────────────────────

def test_extra_payment_cannot_take_a_loan_below_zero(api):
    db = api.db
    cash = add_account(db)
    debt = add_debt(db, cash, principal=100.0)

    response = pay(api, debt, 600.0, kind="extra")

    assert response.status_code == 400
    assert "Only 100.00 EUR left to repay" in response.json()["detail"]
    assert db.get_debt(debt)["current_balance"] == 100.0
    assert payment_rows(db, debt) == []
    assert round(db.get_account(cash)["balance"], 2) == 50000.0


def test_regular_payment_may_cover_the_balance_and_its_interest(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=100.0, rate=12.0)

    too_much = pay(api, debt, 101.5)
    assert too_much.status_code == 400
    assert "Only 101.00 EUR left to repay" in too_much.json()["detail"]

    assert pay(api, debt, 101.0).status_code == 200
    assert db.get_debt(debt)["current_balance"] == 0
    assert db.get_debt(debt)["is_active"] == 0


# ── Add Holding ──────────────────────────────────────────────────────────────

def test_add_holding_refuses_a_broker_with_no_linked_account(api):
    db = api.db
    broker = add_broker(db)
    security = add_security(api)

    response = api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 5,
        "purchase_price": 100, "purchase_date": "2026-02-01"})

    assert response.status_code == 400
    assert "linked" in response.json()["detail"]
    assert db.get_investment_holdings() == []


def test_add_holding_without_a_purchase_needs_no_linked_account(api):
    broker = add_broker(api.db)
    security = add_security(api)

    response = api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 0,
        "purchase_price": 0, "purchase_date": "2026-02-01"})

    assert response.status_code == 200


# ── Deleting a holding ───────────────────────────────────────────────────────

def test_deleting_a_holding_also_removes_the_gain_of_its_sales(api):
    db = api.db
    cash = add_account(db, balance=1000.0)
    broker = add_broker(db, cash)
    security = add_security(api)
    holding = api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 10,
        "purchase_price": 10, "purchase_date": "2026-02-01"}).json()["holding_id"]
    assert api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": "sell", "quantity": 10, "price": 15,
        "transaction_date": "2026-03-01", "fees": 0, "tax": 0}).status_code == 200

    assert api.delete(f"/api/investments/holdings/{holding}").status_code == 200

    assert round(db.get_account(cash)["balance"], 2) == 1000.0
    assert [t for t in db.get_transactions() if t["account_id"] == cash] == []
    assert db.verify_balances() == []


# ── Refund owner ─────────────────────────────────────────────────────────────

def refund_owner(db, refund_id):
    with db.db_connection(commit=False) as conn:
        return conn.execute("""
            SELECT COALESCE(t.owner_id, a.owner_id) FROM transactions t
              JOIN accounts a ON a.id = t.account_id WHERE t.id = ?
        """, (refund_id,)).fetchone()[0]


def test_refund_takes_the_owner_set_on_the_expense(api):
    db = api.db
    other = db.add_owner("Other")
    cash = add_account(db)
    expense = add_expense(db, cash, owner_id=other)

    refund = api.post(f"/api/transactions/{expense}/refunds", json={
        "account_id": cash, "date": "2026-02-10", "amount": 40.0}).json()["transaction_id"]

    assert refund_owner(db, refund) == other


def test_refund_on_another_owners_account_stays_with_the_expense_owner(api):
    db = api.db
    mine = db.get_owners()[0]["id"]
    other = db.add_owner("Other")
    expense = add_expense(db, add_account(db, "Theirs", owner=other))

    refund = api.post(f"/api/transactions/{expense}/refunds", json={
        "account_id": add_account(db, owner=mine), "date": "2026-02-10",
        "amount": 40.0}).json()["transaction_id"]

    assert refund_owner(db, refund) == other


def test_refund_keeps_an_owner_chosen_for_it(api):
    db = api.db
    other = db.add_owner("Other")
    third = db.add_owner("Third")
    cash = add_account(db)
    expense = add_expense(db, cash, owner_id=other)

    refund = api.post(f"/api/transactions/{expense}/refunds", json={
        "account_id": cash, "date": "2026-02-10", "amount": 40.0,
        "owner_id": third}).json()["transaction_id"]

    assert refund_owner(db, refund) == third


# ── Linked rows are locked ───────────────────────────────────────────────────

@pytest.fixture
def loan_rows(api):
    db = api.db
    cash = add_account(db)
    debt = add_debt(db, cash, principal=1000.0, rate=12.0)
    assert pay(api, debt, 100.0).status_code == 200
    payment = payment_rows(db, debt)[0]
    return {"cash": cash, "debt": debt, "interest": payment["transaction_id"],
            "principal": payment["principal_transaction_id"]}


@pytest.fixture
def trade_rows(api):
    db = api.db
    cash = add_account(db)
    broker = add_broker(db, cash)
    security = add_security(api)
    holding = api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 10,
        "purchase_price": 10, "purchase_date": "2026-02-01"}).json()["holding_id"]
    assert api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": "sell", "quantity": 10, "price": 15,
        "transaction_date": "2026-03-01", "fees": 0, "tax": 0}).status_code == 200
    with db.db_connection(commit=False) as conn:
        sale = conn.execute("""
            SELECT linked_transaction_id, gain_transaction_id FROM investment_transactions
             WHERE holding_id = ? AND transaction_type = 'sell'
        """, (holding,)).fetchone()
    return {"cash": cash, "capital": sale["linked_transaction_id"],
            "gain": sale["gain_transaction_id"]}


@pytest.mark.parametrize("row", ["interest", "principal"])
def test_loan_rows_cannot_be_deleted(api, loan_rows, row):
    before = api.db.get_account(loan_rows["cash"])["balance"]

    response = api.delete(f"/api/transactions/{loan_rows[row]}")

    assert response.status_code == 400
    assert "loan" in response.json()["detail"].lower()
    assert "Car loan" in response.json()["detail"]
    assert api.db.get_account(loan_rows["cash"])["balance"] == before


@pytest.mark.parametrize("row", ["capital", "gain"])
def test_trade_rows_cannot_be_deleted(api, trade_rows, row):
    response = api.delete(f"/api/transactions/{trade_rows[row]}")

    assert response.status_code == 400
    assert "Investments page" in response.json()["detail"]


@pytest.mark.parametrize("change", [
    {"amount": 55.0}, {"date": "2026-02-02"}, {"is_pending": True}])
def test_loan_row_money_fields_are_locked(api, loan_rows, change):
    before = api.db.get_transaction(loan_rows["interest"])

    response = api.put(f"/api/transactions/{loan_rows['interest']}", json=change)

    assert response.status_code == 400
    after = api.db.get_transaction(loan_rows["interest"])
    assert after["amount"] == before["amount"]
    assert after["transaction_date"] == before["transaction_date"]


def test_loan_row_cannot_move_account(api, loan_rows):
    other = add_account(api.db, "Other account")

    response = api.put(f"/api/transactions/{loan_rows['interest']}", json={"account_id": other})

    assert response.status_code == 400
    assert api.db.get_transaction(loan_rows["interest"])["account_id"] == loan_rows["cash"]


def test_loan_row_cannot_change_category(api, loan_rows):
    type_id, subtype_id = expense_type(api.db)

    response = api.put(f"/api/transactions/{loan_rows['interest']}", json={
        "type_id": type_id, "subtype_id": subtype_id})

    assert response.status_code == 400


def test_description_and_tags_of_a_linked_row_stay_editable(api, loan_rows):
    response = api.put(f"/api/transactions/{loan_rows['interest']}", json={
        "description": "January instalment", "tags": "car"})

    assert response.status_code == 200
    row = api.db.get_transaction(loan_rows["interest"])
    assert row["description"] == "January instalment"
    assert row["tags"] == "car"


def test_edit_form_resending_unchanged_values_is_accepted(api, loan_rows):
    """The form sends every field back, so only a real change counts."""
    row = api.db.get_transaction(loan_rows["principal"])

    response = api.put(f"/api/transactions/{loan_rows['principal']}", json={
        "account_id": row["account_id"], "amount": abs(row["amount"]),
        "date": row["transaction_date"], "type_id": row["type_id"],
        "subtype_id": row["subtype_id"], "description": "Renamed"})

    assert response.status_code == 200
    after = api.db.get_transaction(loan_rows["principal"])
    assert after["description"] == "Renamed"
    assert after["amount"] == row["amount"]
    assert round(api.db.get_account(loan_rows["cash"])["balance"], 2) == 49900.0


def test_the_edit_form_payload_on_a_linked_row_is_accepted(api, loan_rows):
    """Exactly what TransactionDialog sends when only the description changed."""
    row = api.db.get_transaction(loan_rows["principal"])

    response = api.put(f"/api/transactions/{loan_rows['principal']}", json={
        "account_id": row["account_id"], "date": row["transaction_date"], "due_date": None,
        "amount": abs(row["amount"]), "type_id": row["type_id"], "subtype_id": row["subtype_id"],
        "description": "Renamed", "destinataire": row["destinataire"],
        "transfer_account_id": None, "transfer_amount": None, "is_pending": False,
        "tags": None, "owner_id": None})

    assert response.status_code == 200
    assert api.db.get_transaction(loan_rows["principal"])["description"] == "Renamed"


def test_sale_row_keeps_its_positive_sign_when_edited(api, trade_rows):
    """The API makes every transfer negative; a sale's capital row is money in."""
    row = api.db.get_transaction(trade_rows["capital"])
    assert row["amount"] > 0

    response = api.put(f"/api/transactions/{trade_rows['capital']}", json={
        "amount": row["amount"], "type_id": row["type_id"], "description": "Renamed"})

    assert response.status_code == 200
    assert api.db.get_transaction(trade_rows["capital"])["amount"] == row["amount"]
    assert api.db.verify_balances() == []


def test_loan_payment_undo_still_works(api, loan_rows):
    payment = payment_rows(api.db, loan_rows["debt"])[0]

    assert api.delete(f"/api/debts/payments/{payment['id']}").status_code == 200

    assert api.db.get_debt(loan_rows["debt"])["current_balance"] == 1000.0
    assert api.db.verify_balances() == []


def test_ordinary_rows_are_not_locked(api):
    expense = add_expense(api.db, add_account(api.db))

    assert api.put(f"/api/transactions/{expense}", json={"amount": 60.0}).status_code == 200
    assert api.delete(f"/api/transactions/{expense}").status_code == 200


# ── Integrity report ─────────────────────────────────────────────────────────

def integrity(db):
    from scripts.check_integrity import linked_row_problems

    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        return linked_row_problems(conn)
    finally:
        conn.close()


def test_integrity_finds_nothing_on_clean_rows(api, loan_rows, trade_rows):
    assert integrity(api.db) == []


def test_integrity_reports_a_loan_row_edited_behind_the_loan(api, loan_rows):
    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE transactions SET amount = -55 WHERE id = ?", (loan_rows["interest"],))

    problems = integrity(api.db)

    assert len(problems) == 1
    assert problems[0]["kind"] == "loan payment"
    assert "Car loan" in problems[0]["subject"]
    assert "145.00" in problems[0]["problem"] and "100.00" in problems[0]["problem"]


def test_integrity_reports_a_loan_row_moved_in_time(api, loan_rows):
    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE transactions SET transaction_date = '2026-05-05' WHERE id = ?",
                     (loan_rows["interest"],))

    assert "2026-05-05" in integrity(api.db)[0]["problem"]


def test_integrity_reports_a_trade_row_edited_behind_the_trade(api, trade_rows):
    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE transactions SET amount = 10 WHERE id = ?", (trade_rows["gain"],))

    problems = integrity(api.db)

    assert len(problems) == 1
    assert problems[0]["kind"] == "trade"
    assert "150.00" in problems[0]["problem"]


def test_integrity_reports_a_loan_below_zero(api):
    debt = add_debt(api.db, add_account(api.db))
    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET current_balance = -500 WHERE id = ?", (debt,))

    assert "-500.00" in integrity(api.db)[0]["problem"]


def test_integrity_reports_a_gain_row_left_behind_by_a_deleted_holding(api, trade_rows):
    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE investment_transactions SET gain_transaction_id = NULL")

    kinds = [p["kind"] for p in integrity(api.db)]

    assert "left-over gain" in kinds


def test_integrity_notes_what_the_upgrade_will_change(api):
    from scripts.check_integrity import upgrade_notes

    db = api.db
    other = db.add_owner("Other")
    cash = add_account(db)
    deleted = add_debt(db, cash, name="Written off")
    db.delete_debt(deleted)
    expense = add_expense(db, cash, owner_id=other)
    live = add_debt(db, cash, name="Live loan")
    type_id, subtype_id = expense_type(db)
    with db.db_connection(commit=True) as conn:
        conn.execute("""
            INSERT INTO debt_payments (debt_id, payment_date, amount, principal_paid,
                                       interest_paid, extra_payment)
            VALUES (?, '2026-03-01', 0, 0, 24.12, 200)
        """, (live,))
        conn.execute("""
            INSERT INTO transactions (account_id, transaction_date, amount, currency, destinataire,
                                      type_id, subtype_id, confirmed, refund_of_id)
            VALUES (?, '2026-03-02', 40, 'EUR', 'Shop', ?, ?, 1, ?)
        """, (cash, type_id, subtype_id, expense))

    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    notes = "\n".join(upgrade_notes(conn))
    conn.close()

    assert "Written off" in notes
    assert "24.12" in notes
    assert "1 refund" in notes


def test_refund_owner_repair_only_touches_refunds_without_an_owner(api):
    from integrity import find_refunds_to_repair, repair_refund_owners

    db = api.db
    other = db.add_owner("Other")
    third = db.add_owner("Third")
    cash = add_account(db)
    expense = add_expense(db, cash, owner_id=other)
    type_id, subtype_id = expense_type(db)

    def old_refund(owner):
        with db.db_connection(commit=True) as conn:
            return conn.execute("""
                INSERT INTO transactions (account_id, transaction_date, amount, currency,
                                          destinataire, type_id, subtype_id, confirmed,
                                          refund_of_id, owner_id)
                VALUES (?, '2026-03-02', 10, 'EUR', 'Shop', ?, ?, 1, ?, ?)
            """, (cash, type_id, subtype_id, expense, owner)).lastrowid

    blank = old_refund(None)
    chosen = old_refund(third)

    found = find_refunds_to_repair(db)
    assert [r["id"] for r in found] == [blank]

    assert repair_refund_owners(db) == 1
    assert refund_owner(db, blank) == other
    assert refund_owner(db, chosen) == third
    assert find_refunds_to_repair(db) == []


# ── The commands themselves ──────────────────────────────────────────────────

def run_script(monkeypatch, capsys, module, *args):
    monkeypatch.setattr(sys, "argv", [module.__name__, *args])
    status = module.main()
    return status, capsys.readouterr().out


def test_integrity_command_passes_a_clean_database(api, loan_rows, monkeypatch, capsys):
    from scripts import check_integrity

    status, out = run_script(monkeypatch, capsys, check_integrity, "--db", api.db.db_path)

    assert status == 0
    assert "every loan payment and trade matches" in out


def test_integrity_command_fails_and_reads_before_migrating(tmp_path, monkeypatch, capsys):
    """A report on a 2.11.0 copy has to show what the migration is about to clear."""
    from scripts import check_integrity

    path = str(tmp_path / "old.db")
    db = FinanceDatabase(db_path=path)
    debt = add_debt(db, add_account(db))
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET current_balance = -500 WHERE id = ?", (debt,))
        conn.execute("""
            INSERT INTO debt_payments (debt_id, payment_date, amount, principal_paid,
                                       interest_paid, extra_payment)
            VALUES (?, '2026-03-01', 0, 0, 24.12, 200)
        """, (debt,))

    status, out = run_script(monkeypatch, capsys, check_integrity, "--db", path)

    assert status == 1
    assert "below zero" in out
    assert "24.12" in out


def test_integrity_command_warns_to_delete_left_over_gains_first(
        api, trade_rows, monkeypatch, capsys):
    from scripts import check_integrity

    with api.db.db_connection(commit=True) as conn:
        conn.execute("UPDATE investment_transactions SET gain_transaction_id = NULL")

    _, out = run_script(monkeypatch, capsys, check_integrity, "--db", api.db.db_path)

    assert "before recalculating" in out


def test_refund_repair_command_reports_until_told_to_apply(api, monkeypatch, capsys):
    from scripts import fix_refund_owners

    db = api.db
    other = db.add_owner("Other")
    cash = add_account(db)
    expense = add_expense(db, cash, owner_id=other)
    type_id, subtype_id = expense_type(db)
    with db.db_connection(commit=True) as conn:
        refund = conn.execute("""
            INSERT INTO transactions (account_id, transaction_date, amount, currency, destinataire,
                                      type_id, subtype_id, confirmed, refund_of_id)
            VALUES (?, '2026-03-02', 10, 'EUR', 'Shop', ?, ?, 1, ?)
        """, (cash, type_id, subtype_id, expense)).lastrowid

    _, out = run_script(monkeypatch, capsys, fix_refund_owners, "--db", db.db_path)
    assert "Report only" in out
    assert "#" in out

    _, out = run_script(monkeypatch, capsys, fix_refund_owners, "--db", db.db_path, "--apply")
    assert "Repaired 1" in out
    assert refund_owner(db, refund) == other


# ── Found in review ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("balance,rate,amount", [(204.0, 3.5, 204.60), (108.0, 1.5, 108.13)])
def test_compound_payoff_at_a_rounding_edge_clears_the_loan_and_matches_the_cash(
        api, balance, rate, amount):
    """Interest is worked out once: two formulas differed by a cent at half-cent
    balances, which refused a payment after its cash had been debited."""
    db = api.db
    cash = add_account(db, balance=5000.0)
    debt = db.add_debt({
        "name": "Compound loan", "principal_amount": balance, "current_balance": balance,
        "interest_rate": rate, "interest_type": "compound", "monthly_payment": 100.0,
        "payment_day": 1, "currency": "EUR", "linked_account_id": cash,
        "start_date": "2026-01-01"})

    assert pay(api, debt, amount).status_code == 200

    assert db.get_debt(debt)["current_balance"] == 0
    assert db.get_debt(debt)["is_active"] == 0
    assert round(db.get_account(cash)["balance"], 2) == round(5000.0 - amount, 2)
    assert integrity(db) == []


def test_integrity_command_still_runs_its_other_checks_on_an_older_database(
        tmp_path, monkeypatch, capsys):
    from scripts import check_integrity

    path = str(tmp_path / "old.db")
    FinanceDatabase(db_path=path)
    conn = sqlite3.connect(path)
    conn.execute("DROP TABLE debt_payments")
    conn.commit()
    conn.close()

    status, out = run_script(monkeypatch, capsys, check_integrity, "--db", path)

    assert status == 1
    assert "could not be checked" in out
    assert "No referential integrity violations" in out


def test_type_holding_locked_rows_cannot_change_category(api, loan_rows):
    db = api.db
    row = db.get_transaction(loan_rows["principal"])

    with pytest.raises(ValueError, match="loan payments or trades"):
        db.update_type(row["type_id"], {"category": "expense"})

    response = api.put(f"/api/categories/types/{row['type_id']}", json={"category": "expense"})
    assert response.status_code == 400
    assert "loan payments or trades" in response.json()["detail"]

    db.update_type(row["type_id"], {"category": "transfer"})


def test_type_without_locked_rows_can_still_change_category(api):
    db = api.db
    add_expense(db, add_account(db))
    type_id, _ = expense_type(db)

    assert db.update_type(type_id, {"category": "income"}) is True
