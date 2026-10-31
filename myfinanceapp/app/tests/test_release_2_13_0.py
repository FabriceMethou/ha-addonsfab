"""
One way to do each thing: refunds, loan payoff, and what those replaced.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_13_0.py -v
"""
import os
import sys
from datetime import date

from dateutil.relativedelta import relativedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from database import FinanceDatabase
from tests.test_release_2_11_1 import add_account, add_debt, add_expense, pay, payment_rows


def debt_row(api, debt):
    return next(d for d in api.get("/api/debts/").json()["debts"] if d["id"] == debt)


# ── Refunds ──────────────────────────────────────────────────────────────────

def test_a_refund_has_one_endpoint(api):
    db = api.db
    account = add_account(db)
    expense = add_expense(db, account)
    row = db.get_transaction(expense)

    response = api.post("/api/transactions/", json={
        "account_id": account, "date": "2026-02-10", "amount": 10.0, "type_id": row["type_id"],
        "subtype_id": row["subtype_id"], "refund_of_id": expense})

    assert response.status_code == 400
    assert api.post(f"/api/transactions/{expense}/refunds", json={
        "account_id": account, "date": "2026-02-10", "amount": 10.0}).status_code == 200


def test_a_row_written_by_a_loan_payment_cannot_take_a_new_refund(api):
    db = api.db
    debt = add_debt(db, add_account(db), rate=12.0)
    assert pay(api, debt, 100.0).status_code == 200
    interest = payment_rows(db, debt)[0]["transaction_id"]

    response = api.post(f"/api/transactions/{interest}/refunds", json={
        "account_id": db.get_transaction(interest)["account_id"], "date": "2026-02-10", "amount": 1.0})

    assert response.status_code == 400
    assert "refund" in response.json()["detail"].lower()


def test_an_old_refund_on_such_a_row_can_still_be_edited(api):
    db = api.db
    account = add_account(db)
    debt = add_debt(db, account, rate=12.0)
    assert pay(api, debt, 100.0).status_code == 200
    interest = payment_rows(db, debt)[0]["transaction_id"]
    row = db.get_transaction(interest)
    with db.db_connection(commit=True) as conn:
        refund = conn.execute("""
            INSERT INTO transactions (account_id, transaction_date, amount, currency, destinataire,
                                      type_id, subtype_id, confirmed, refund_of_id)
            VALUES (?, '2026-02-10', 2, 'EUR', 'Bank', ?, ?, 1, ?)
        """, (account, row["type_id"], row["subtype_id"], interest)).lastrowid

    assert api.put(f"/api/transactions/{refund}", json={"amount": 3.0}).status_code == 200


# ── Payoff comes from the schedule ───────────────────────────────────────────

def test_the_debts_list_reads_its_payoff_from_the_schedule(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=12.0)

    payoff = debt_row(api, debt)["payoff"]
    schedule = api.get(f"/api/debts/{debt}/schedule").json()["schedule"]

    assert payoff["months"] == len(schedule)
    assert payoff["payoff_date"] == schedule[-1]["date"]
    assert payoff["total_interest"] == round(sum(row["interest"] for row in schedule), 2)
    assert schedule[-1]["balance"] == 0


def test_the_schedule_splits_like_a_real_payment(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=12.0)

    first = api.get(f"/api/debts/{debt}/schedule").json()["schedule"][0]
    assert pay(api, debt, 100.0, date=date.today().isoformat()).status_code == 200
    payment = payment_rows(db, debt)[0]

    assert first["interest"] == payment["interest_paid"]
    assert first["principal"] == payment["principal_paid"]


def test_the_schedule_starts_on_the_next_payment_day(api):
    db = api.db
    today = date.today()
    debt = add_debt(db, add_account(db), principal=1000.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET payment_day = 1, start_date = '2020-01-01' WHERE id = ?", (debt,))

    first = date.fromisoformat(api.get(f"/api/debts/{debt}/schedule").json()["schedule"][0]["date"])

    expected = today.replace(day=1) if today.day == 1 else today.replace(day=1) + relativedelta(months=1)
    assert first == expected


def test_a_loan_starting_later_begins_its_schedule_then(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0)
    start = date.today() + relativedelta(months=6)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debts SET payment_day = ?, start_date = ? WHERE id = ?",
                     (start.day, start.isoformat(), debt))

    first = api.get(f"/api/debts/{debt}/schedule").json()["schedule"][0]["date"]

    assert first == start.isoformat()


def test_a_payment_too_small_to_cover_the_interest_has_no_payoff(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=100000.0, rate=12.0)

    assert debt_row(api, debt)["payoff"] is None


def test_a_zero_percent_loan_has_a_payoff_with_no_interest(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0, rate=0.0)

    payoff = debt_row(api, debt)["payoff"]

    assert payoff["months"] == 10
    assert payoff["total_interest"] == 0


def test_the_second_payoff_calculation_is_gone(api):
    db = api.db
    debt = add_debt(db, add_account(db))

    assert api.get(f"/api/debts/{debt}/payoff").status_code in (404, 405)
    assert not hasattr(db, "calculate_debt_payoff")


# ── What the form no longer asks ─────────────────────────────────────────────

def test_a_loan_is_created_without_an_interest_type(api):
    account = add_account(api.db)

    response = api.post("/api/debts/", json={
        "creditor": "Plain loan", "original_amount": 500.0, "current_balance": 500.0,
        "interest_rate": 1.0, "minimum_payment": 50.0, "payment_day": 1,
        "due_date": "2026-01-01", "linked_account_id": account})

    assert response.status_code == 200, response.text


# ── What is gone ─────────────────────────────────────────────────────────────

def test_a_new_loan_adds_nothing_to_the_old_debt_category(api):
    db = api.db
    add_debt(db, add_account(db), name="New loan")

    assert "New loan" not in [s["name"] for s in db.get_subtypes()]


def test_a_new_setup_has_no_income_category_for_refunds(tmp_path):
    db = FinanceDatabase(db_path=str(tmp_path / "new.db"))
    names = {(t["name"], s["name"]) for t in db.get_types() for s in db.get_subtypes()
             if s["type_id"] == t["id"]}

    assert ("Other Income", "Refund") not in names
    assert ("Other Income", "Gift") in names


def test_a_transaction_no_longer_books_a_loan_payment_on_the_side(api):
    db = api.db
    account = add_account(db)
    debt = add_debt(db, account, principal=1000.0, rate=0.0)
    row = db.get_transaction(add_expense(db, account))

    response = api.post("/api/transactions/", json={
        "account_id": account, "date": "2026-02-10", "amount": 10.0, "type_id": row["type_id"],
        "subtype_id": row["subtype_id"], "destinataire": "Shop", "debt_id": debt})

    assert response.status_code == 200
    assert payment_rows(db, debt) == []


def test_unused_calculations_are_gone(api):
    assert not hasattr(api.db, "calculate_holding_summary")
    assert not hasattr(api.db, "get_portfolio_summary")
    assert not os.path.exists(os.path.join(ROOT, "reports.py"))
