"""
Loan payments and trades as one unit, and repairs you can run from the app.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_release_2_12_0.py -v
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))
from tests.test_release_2_11_1 import (add_account, add_broker, add_debt, add_expense,
                                       add_security, pay, payment_rows)


def debt_balance(db, debt):
    return db.get_debt(debt)["current_balance"]


def cash(db, account):
    return round(db.get_account(account)["balance"], 2)


@pytest.fixture
def loan(api):
    account = add_account(api.db, balance=5000.0)
    debt = add_debt(api.db, account, principal=1000.0, rate=12.0)
    assert pay(api, debt, 100.0, date="2026-02-01").status_code == 200
    return {"account": account, "debt": debt, "payment": payment_rows(api.db, debt)[0]}


# ── Recording in one transaction ─────────────────────────────────────────────

def test_a_failed_payment_writes_nothing(api, monkeypatch):
    db = api.db
    account = add_account(db, balance=5000.0)
    debt = add_debt(db, account, principal=1000.0, rate=12.0)
    rows_before = len(db.get_transactions())

    def boom(*_args, **_kwargs):
        raise RuntimeError("disk full")
    monkeypatch.setattr(db, "_insert_debt_payment", boom)

    assert pay(api, debt, 100.0).status_code == 500
    assert len(db.get_transactions()) == rows_before
    assert cash(db, account) == 5000.0
    assert debt_balance(db, debt) == 1000.0


def test_backdated_payment_takes_interest_on_the_balance_of_that_date(api):
    db = api.db
    account = add_account(db)
    debt = add_debt(db, account, principal=1000.0, rate=12.0)
    assert pay(api, debt, 500.0, kind="extra", date="2026-03-01").status_code == 200

    assert pay(api, debt, 100.0, date="2026-02-01").status_code == 200

    february = next(p for p in payment_rows(db, debt) if p["payment_date"] == "2026-02-01")
    assert february["interest_paid"] == 10.0


def test_payment_from_another_currency_is_refused(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=1000.0)
    other = db.add_account({"name": "SEK", "owner_id": db.get_owners()[0]["id"], "balance": 0.0,
                            "opening_balance": 0.0, "currency": "SEK", "account_type": "checking",
                            "create_initial_validation": False})

    response = api.post("/api/debts/payments", json={
        "debt_id": debt, "amount": 10, "payment_date": "2026-02-01",
        "payment_type": "regular", "account_id": other})

    assert response.status_code == 400
    assert "EUR" in response.json()["detail"]


# ── Correcting a payment ─────────────────────────────────────────────────────

def test_correcting_a_payment_moves_the_cash_and_the_loan_together(api, loan):
    db = api.db

    response = api.put(f"/api/debts/payments/{loan['payment']['id']}", json={
        "amount": 200.0, "payment_date": "2026-02-05"})

    assert response.status_code == 200
    assert debt_balance(db, loan["debt"]) == 810.0  # 1000 less 200, of which 10 is interest
    assert cash(db, loan["account"]) == 4800.0
    assert db.verify_balances() == []
    payment = payment_rows(db, loan["debt"])[0]
    assert (payment["amount"], payment["payment_date"]) == (200.0, "2026-02-05")
    rows = [db.get_transaction(payment[k]) for k in ("transaction_id", "principal_transaction_id")]
    assert sorted(r["amount"] for r in rows) == [-190.0, -10.0]
    assert {r["transaction_date"] for r in rows} == {"2026-02-05"}


def test_correcting_one_payment_leaves_the_others_split_alone(api, loan):
    db = api.db
    assert pay(api, loan["debt"], 100.0, date="2026-03-01").status_code == 200
    march = next(p for p in payment_rows(db, loan["debt"]) if p["payment_date"] == "2026-03-01")

    assert api.put(f"/api/debts/payments/{loan['payment']['id']}",
                   json={"amount": 150.0}).status_code == 200

    assert next(p for p in payment_rows(db, loan["debt"]) if p["id"] == march["id"]) == march
    assert db.verify_balances() == []


def test_correcting_can_move_a_payment_to_another_account(api, loan):
    db = api.db
    other = add_account(db, "Other", balance=300.0)

    assert api.put(f"/api/debts/payments/{loan['payment']['id']}",
                   json={"account_id": other}).status_code == 200

    assert cash(db, loan["account"]) == 5000.0
    assert cash(db, other) == 200.0
    assert api.get(f"/api/debts/{loan['debt']}/payments").json()["payments"][0]["account_id"] == other


def test_correcting_above_the_balance_is_refused_and_changes_nothing(api, loan):
    db = api.db

    response = api.put(f"/api/debts/payments/{loan['payment']['id']}", json={"amount": 5000.0})

    assert response.status_code == 400
    assert "left to repay" in response.json()["detail"]
    assert debt_balance(db, loan["debt"]) == 910.0
    assert cash(db, loan["account"]) == 4900.0


def test_correcting_an_unknown_payment_is_a_404(api):
    assert api.put("/api/debts/payments/999", json={"amount": 1.0}).status_code == 404


def test_history_says_what_a_correction_needs(api, loan):
    payment = api.get(f"/api/debts/{loan['debt']}/payments").json()["payments"][0]

    assert payment["payment_type"] == "regular"
    assert payment["account_id"] == loan["account"]
    assert payment["account_name"] == "Cash"


# ── Undoing a payment ────────────────────────────────────────────────────────

def test_undo_of_a_payment_before_the_account_opened_moves_no_cash(api):
    db = api.db
    account = add_account(db, balance=5000.0, opening_date="2026-03-01")
    debt = add_debt(db, account, principal=1000.0, rate=0.0)
    assert pay(api, debt, 100.0, date="2026-02-01").status_code == 200
    assert cash(db, account) == 5000.0

    assert api.delete(f"/api/debts/payments/{payment_rows(db, debt)[0]['id']}").status_code == 200

    assert cash(db, account) == 5000.0
    assert db.verify_balances() == []


def test_undo_reopens_a_paid_off_loan(api):
    db = api.db
    debt = add_debt(db, add_account(db), principal=100.0, rate=0.0)
    assert pay(api, debt, 100.0).status_code == 200
    assert db.get_debt(debt)["is_active"] == 0

    assert api.delete(f"/api/debts/payments/{payment_rows(db, debt)[0]['id']}").status_code == 200

    assert db.get_debt(debt)["is_active"] == 1


def test_undo_does_not_bring_back_a_deleted_loan(api, loan):
    db = api.db
    assert api.delete(f"/api/debts/{loan['debt']}").status_code == 200

    assert api.delete(f"/api/debts/payments/{loan['payment']['id']}").status_code == 200

    assert db.get_debt(loan["debt"])["is_active"] == 0


# ── Where a row came from ────────────────────────────────────────────────────

def test_transaction_list_says_where_each_row_came_from(api, loan):
    db = api.db
    broker = add_broker(db, loan["account"])
    security = add_security(api)
    assert api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 1,
        "purchase_price": 10, "purchase_date": "2026-02-01"}).status_code == 200
    expense = add_expense(db, loan["account"])
    refund = api.post(f"/api/transactions/{expense}/refunds", json={
        "account_id": loan["account"], "date": "2026-02-10",
        "amount": 5.0}).json()["transaction_id"]

    rows = {r["id"]: r for r in api.get("/api/transactions/?limit=50").json()["transactions"]}

    assert rows[loan["payment"]["transaction_id"]]["origin"] == "loan_payment"
    assert rows[loan["payment"]["principal_transaction_id"]]["origin"] == "loan_payment"
    assert sum(r["origin"] == "trade" for r in rows.values()) == 1
    assert rows[refund]["origin"] == "refund"
    assert rows[expense]["origin"] is None


# ── Category picker and Auto-Categorize ──────────────────────────────────────

def owned_names(api):
    categories = api.get("/api/categories/hierarchy").json()["categories"]
    return {(c["name"], s["name"]) for c in categories for s in c["subtypes"] if s["app_owned"]}


def test_categories_the_app_writes_are_marked(api, loan):
    api.db.ensure_investment_types_exist()
    owned = owned_names(api)

    assert ("Debt Interest", "Car loan") in owned
    assert ("Debt Principal", "Car loan") in owned
    assert ("Investments", "Securities Purchase") in owned
    assert ("Investments", "Securities Sale") in owned
    assert ("Investment Income", "Dividends") in owned
    assert ("Investment Income", "Realised Gain") in owned


def test_a_loan_filed_under_the_old_category_is_marked_but_bank_fees_are_not(api):
    """Real data keeps bank fees and credit cards under Debt, next to the loans."""
    db = api.db
    add_debt(db, add_account(db), name="Car loan")
    with db.db_connection(commit=True) as conn:
        conn.execute("""
            INSERT INTO transaction_subtypes (type_id, name)
            SELECT id, 'Car loan' FROM transaction_types WHERE name = 'Debt'
        """)
        conn.execute("""
            INSERT INTO transaction_subtypes (type_id, name)
            SELECT id, 'Bank Fee' FROM transaction_types WHERE name = 'Debt'
        """)
    owned = owned_names(api)

    assert ("Debt", "Car loan") in owned
    assert not [name for name in owned if name[0] == "Debt" and name[1] != "Car loan"]


def test_auto_categorize_ignores_rows_the_app_wrote(api, loan):
    response = api.post("/api/transactions/auto-categorize", json={"recipient": "Car loan"})

    assert response.status_code == 404


def test_auto_categorize_still_learns_from_typed_rows(api):
    db = api.db
    add_expense(db, add_account(db))

    response = api.post("/api/transactions/auto-categorize", json={"recipient": "Shop"})

    assert response.status_code == 200


# ── Reconciling against a bank line ──────────────────────────────────────────

def match(csv, system):
    from api.reconciliation import match_transactions

    return match_transactions(csv, system)


def line(amount, date="2026-02-01"):
    return {"date": date, "amount": amount, "description": "x"}


def row(row_id, amount, date="2026-02-01", group=None):
    return {"id": row_id, "transaction_date": date, "amount": amount, "group_key": group}


def test_one_bank_line_matches_both_rows_of_a_loan_payment():
    result = match([line(-100.0)], [row(1, -10.0, group="loan:1"), row(2, -90.0, group="loan:1")])

    assert {m["system_id"] for m in result["matched"]} == {1, 2}
    assert result["missing_from_system"] == []
    assert result["not_in_csv"] == []


def test_a_group_match_tolerates_the_same_two_days_as_a_single_row():
    result = match([line(150.0, "2026-02-03")],
                   [row(1, 100.0, group="trade:1"), row(2, 50.0, group="trade:1")])

    assert all(m["date_mismatch"] and m["days_difference"] == 2 for m in result["matched"])
    assert len(result["matched"]) == 2


def test_a_group_is_not_matched_when_the_total_differs():
    result = match([line(-100.0)], [row(1, -10.0, group="loan:1"), row(2, -80.0, group="loan:1")])

    assert result["matched"] == []
    assert result["missing_from_system"] == [0]


def test_a_single_row_is_preferred_over_a_group():
    result = match([line(-100.0)], [row(1, -10.0, group="loan:1"), row(2, -90.0, group="loan:1"),
                                    row(3, -100.0)])

    assert [m["system_id"] for m in result["matched"]] == [3]


def test_rows_are_not_grouped_across_payments():
    result = match([line(-100.0)], [row(1, -10.0, group="loan:1"), row(2, -90.0, group="loan:2")])

    assert result["matched"] == []


def test_group_keys_come_from_the_links(api, loan):
    payment = loan["payment"]

    groups = api.db.get_linked_row_groups()

    assert groups[payment["transaction_id"]] == groups[payment["principal_transaction_id"]]


# ── Data check ───────────────────────────────────────────────────────────────

def check(api):
    return api.get("/api/settings/data-check").json()


def old_payment(db, account, debt, amount=300.0, date="2026-03-01"):
    """A payment as old versions booked it: one expense for the whole amount."""
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.name = 'Debt' LIMIT 1
        """).fetchone()
    row = db.add_transaction({
        "account_id": account, "amount": -amount, "transaction_date": date, "currency": "EUR",
        "type_id": type_id, "subtype_id": subtype_id, "description": "old",
        "destinataire": "Car loan", "confirmed": True})
    with db.db_connection(commit=True) as conn:
        conn.execute("""
            INSERT INTO debt_payments (debt_id, transaction_id, payment_date, amount,
                                       principal_paid, interest_paid, extra_payment)
            VALUES (?, ?, ?, ?, ?, 0, 0)
        """, (debt, row, date, amount, amount))
    return row


def old_sale(db, api, account):
    """A sale as old versions booked it: one income row for the whole amount."""
    broker = add_broker(db, account)
    security = add_security(api)
    holding = api.post("/api/investments/holdings", json={
        "security_id": security, "account_id": broker, "quantity": 10, "purchase_price": 10,
        "purchase_date": "2026-02-01"}).json()["holding_id"]
    assert api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": "sell", "quantity": 10, "price": 15,
        "transaction_date": "2026-03-01", "fees": 0, "tax": 0}).status_code == 200
    with db.db_connection(commit=True) as conn:
        income = conn.execute("""
            SELECT tt.id, ts.id FROM transaction_types tt
              JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.name = 'Investment Income' AND ts.name = 'Sale Proceeds'
        """).fetchone()
        sale = conn.execute("SELECT * FROM investment_transactions WHERE transaction_type = 'sell'").fetchone()
        conn.execute("UPDATE investment_transactions SET gain_transaction_id = NULL WHERE id = ?", (sale["id"],))
        conn.execute("DELETE FROM transactions WHERE id = ?", (sale["gain_transaction_id"],))
        conn.execute("UPDATE transactions SET amount = 150, type_id = ?, subtype_id = ? WHERE id = ?",
                     (income[0], income[1], sale["linked_transaction_id"]))
    return sale["linked_transaction_id"]


def test_a_clean_database_has_nothing_to_repair(api, loan):
    report = check(api)

    assert report["problems"] == []
    assert report["balances"] == []
    assert [r for r in report["repairs"] if r["count"]] == []


def test_old_loan_payments_are_repaired_to_capital(api, monkeypatch):
    db = api.db
    account = add_account(db, balance=1000.0)
    debt = add_debt(db, account, principal=1000.0, rate=0.0)
    row = old_payment(db, account, debt)
    assert next(r for r in check(api)["repairs"] if r["id"] == "old_loan_payments")["count"] == 1
    before = api.get("/api/reports/net-worth").json()["total_assets"]

    response = api.post("/api/settings/data-check/repair", json={"repair": "old_loan_payments"})

    assert response.status_code == 200
    assert response.json()["repaired"] == 1
    assert db.get_transaction(row) is None
    payment = payment_rows(db, debt)[0]
    new_row = db.get_transaction(payment["principal_transaction_id"])
    assert new_row["amount"] == -300.0
    assert new_row["category"] == "transfer"
    assert api.get("/api/reports/net-worth").json()["total_assets"] == before
    assert db.verify_balances() == []


def test_old_payment_smaller_than_its_interest_keeps_its_cash(api):
    db = api.db
    account = add_account(db, balance=1000.0)
    debt = add_debt(db, account, principal=1000.0, rate=12.0)
    old_payment(db, account, debt, amount=4.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE debt_payments SET principal_paid = 0, interest_paid = 10")

    api.post("/api/settings/data-check/repair", json={"repair": "old_loan_payments"})

    assert round(db.get_account(account)["balance"], 2) == 996.0


def test_old_sales_are_repaired_to_capital_and_gain(api):
    db = api.db
    account = add_account(db, balance=1000.0)
    old_sale(db, api, account)
    assert next(r for r in check(api)["repairs"] if r["id"] == "old_sales")["count"] == 1
    balance = db.get_account(account)["balance"]

    assert api.post("/api/settings/data-check/repair",
                    json={"repair": "old_sales"}).status_code == 200

    with db.db_connection(commit=False) as conn:
        sale = conn.execute("SELECT * FROM investment_transactions WHERE transaction_type = 'sell'").fetchone()
    capital, gain = db.get_transaction(sale["linked_transaction_id"]), db.get_transaction(sale["gain_transaction_id"])
    assert (capital["amount"], capital["category"]) == (100.0, "transfer")
    assert (gain["amount"], gain["category"]) == (50.0, "income")
    assert db.get_account(account)["balance"] == balance
    assert check(api)["problems"] == []


def test_stale_flags_repair_rebuilds_the_balance(api):
    db = api.db
    account = add_account(db, balance=1000.0, opening_date="2026-01-01")
    expense = add_expense(db, account, amount=-100.0)
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE transactions SET is_historical = 1 WHERE id = ?", (expense,))
        conn.execute("UPDATE accounts SET balance = 1000 WHERE id = ?", (account,))
    report = check(api)
    assert report["balances"][0]["difference"] == 100.0
    assert next(r for r in report["repairs"] if r["id"] == "balances")["count"] == 1

    assert api.post("/api/settings/data-check/repair",
                    json={"repair": "balances"}).status_code == 200

    assert round(db.get_account(account)["balance"], 2) == 900.0
    assert db.get_transaction(expense)["is_historical"] == 0
    assert db.verify_balances() == []


def test_dead_rows_are_listed_and_repaired(api):
    db = api.db
    with db.db_connection(commit=True) as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("INSERT INTO balance_validations (account_id, validation_date, system_balance, "
                     "actual_balance, difference, is_match) VALUES (999, '2026-01-01', 1, 1, 0, 1)")
    assert next(r for r in check(api)["repairs"] if r["id"] == "dead_rows")["count"] == 1

    assert api.post("/api/settings/data-check/repair",
                    json={"repair": "dead_rows"}).status_code == 200

    assert next(r for r in check(api)["repairs"] if r["id"] == "dead_rows")["count"] == 0


def test_refund_owner_repair_runs_from_the_app(api):
    db = api.db
    other = db.add_owner("Other")
    account = add_account(db)
    expense = add_expense(db, account, owner_id=other)
    with db.db_connection(commit=True) as conn:
        info = conn.execute("SELECT type_id, subtype_id FROM transactions WHERE id = ?", (expense,)).fetchone()
        conn.execute("""
            INSERT INTO transactions (account_id, transaction_date, amount, currency, destinataire,
                                      type_id, subtype_id, confirmed, refund_of_id)
            VALUES (?, '2026-03-02', 10, 'EUR', 'Shop', ?, ?, 1, ?)
        """, (account, info[0], info[1], expense))

    response = api.post("/api/settings/data-check/repair", json={"repair": "refund_owners"})

    assert response.json()["repaired"] == 1


def test_a_repair_takes_a_backup_first(api, monkeypatch):
    from api import settings

    taken = []
    monkeypatch.setattr(settings, "backup_before_repair", lambda repair: taken.append(repair))

    assert api.post("/api/settings/data-check/repair",
                    json={"repair": "dead_rows"}).status_code == 200
    assert taken == ["dead_rows"]


def test_a_failed_backup_stops_the_repair(api, monkeypatch):
    from api import settings

    def fail(_repair):
        raise RuntimeError("disk full")
    monkeypatch.setattr(settings, "backup_before_repair", fail)

    response = api.post("/api/settings/data-check/repair", json={"repair": "dead_rows"})

    assert response.status_code == 500
    assert "backup" in response.json()["detail"].lower()


def test_an_unknown_repair_is_refused(api):
    assert api.post("/api/settings/data-check/repair",
                    json={"repair": "drop_everything"}).status_code == 400


# ── Cents ────────────────────────────────────────────────────────────────────

def test_a_rebuild_agrees_with_rows_holding_fractions_of_a_cent(api):
    """99 old trade rows on a real account left it 3 cents from its own ledger."""
    db = api.db
    account = add_account(db, balance=100.0)
    for _ in range(9):
        add_expense(db, account, amount=-1.004)

    db.recalculate_all_balances()

    assert db.verify_balances() == []


def test_trades_write_whole_cents(api):
    db = api.db
    account = add_account(db, balance=1000.0)
    broker = add_broker(db, account)
    holding = api.post("/api/investments/holdings", json={
        "security_id": add_security(api), "account_id": broker, "quantity": 1.2345,
        "purchase_price": 33.3333, "purchase_date": "2026-02-01"}).json()["holding_id"]
    assert api.post("/api/investments/transactions", json={
        "holding_id": holding, "transaction_type": "sell", "quantity": 0.7777, "price": 41.111,
        "transaction_date": "2026-03-01", "fees": 0, "tax": 0}).status_code == 200

    amounts = [t["amount"] for t in db.get_transactions() if t["account_id"] == account]

    assert len(amounts) == 3
    assert all(a == round(a, 2) for a in amounts)
    assert db.verify_balances() == []

    assert api.delete(f"/api/investments/holdings/{holding}").status_code == 200
    assert round(db.get_account(account)["balance"], 2) == 1000.0
    assert db.verify_balances() == []
