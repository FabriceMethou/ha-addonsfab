"""
Refunds and reimbursements.

A refund was recorded as "Other Income › Refund": it showed as income, and the
expense it paid back kept counting in full. A refund is now a positive
transaction in the category of the expense it pays back, linked to it
(refund_of_id): it lowers that category's spending in the month it arrives,
on whichever account it arrives. Several partial refunds may cover one expense,
never more than its amount. A reimbursement (a third party paying back) is the
same thing with another recipient.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_refunds.py -v
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
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    database.set_preference("display_currency", "EUR")
    yield database
    os.unlink(f.name)


def ids_of(db, type_name):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.name = ? ORDER BY ts.id LIMIT 1", (type_name,)).fetchone())


@pytest.fixture
def setup(db):
    owner = db.get_owners()[0]["id"]
    card = db.add_account({"name": "Card", "owner_id": owner, "balance": 1000.0,
                           "currency": "EUR", "account_type": "checking"})
    joint = db.add_account({"name": "Joint", "owner_id": owner, "balance": 500.0,
                            "currency": "EUR", "account_type": "checking"})
    danish = db.add_account({"name": "Danske", "owner_id": owner, "balance": 5000.0,
                             "currency": "DKK", "account_type": "checking"})
    health = ids_of(db, "Health")
    expense = db.add_transaction({
        "account_id": card, "amount": -100.0, "transaction_date": "2026-09-03",
        "currency": "EUR", "type_id": health[0], "subtype_id": health[1],
        "description": "glasses", "destinataire": "Optiker"})
    return {"card": card, "joint": joint, "danish": danish, "health": health, "expense": expense}


def refund(db, setup, amount, account="card", date="2026-10-05", **extra):
    return db.add_refund(setup["expense"], {
        "account_id": setup[account], "transaction_date": date, "amount": amount, **extra})


def balance(db, account_id):
    return next(a["balance"] for a in db.get_accounts() if a["id"] == account_id)


def info(db, transaction_id):
    return db.get_refund_info([transaction_id]).get(transaction_id, {})


# ── recording ────────────────────────────────────────────────────────────────

def test_a_refund_is_positive_in_the_expense_category(db, setup):
    rid = refund(db, setup, 40.0)
    row = db.get_transaction(rid)
    assert (row["amount"], row["type_id"], row["subtype_id"], row["refund_of_id"]) == \
        (40.0, setup["health"][0], setup["health"][1], setup["expense"])
    assert row["destinataire"] == "Optiker"
    assert balance(db, setup["card"]) == 1000 - 100 + 40


def test_a_reimbursement_keeps_its_own_recipient_and_account(db, setup):
    rid = refund(db, setup, 70.0, account="joint", destinataire="Krankenkasse")
    row = db.get_transaction(rid)
    assert (row["destinataire"], row["account_id"]) == ("Krankenkasse", setup["joint"])
    assert balance(db, setup["joint"]) == 570.0


def test_partial_refunds_add_up_to_at_most_the_expense(db, setup):
    refund(db, setup, 40.0)
    refund(db, setup, 60.0)
    assert info(db, setup["expense"]) == {"refunded_amount": 100.0, "refund_count": 2}
    with pytest.raises(ValueError, match="Only 0.00 EUR"):
        refund(db, setup, 0.01)


def test_a_refund_larger_than_what_is_left_is_refused(db, setup):
    refund(db, setup, 80.0)
    with pytest.raises(ValueError, match="Only 20.00 EUR of this expense is left"):
        refund(db, setup, 30.0)


def test_a_refund_in_another_currency_is_compared_converted(db, setup):
    refund(db, setup, 700.0, account="danish")          # 93.80 EUR
    with pytest.raises(ValueError, match="Only 6.20 EUR"):
        refund(db, setup, 100.0, account="danish")       # 13.40 EUR > 6.20
    assert info(db, setup["expense"])["refunded_amount"] == pytest.approx(93.8)


def test_only_an_expense_can_be_refunded(db, setup):
    salary = ids_of(db, "Salary")
    income = db.add_transaction({
        "account_id": setup["card"], "amount": 2000.0, "transaction_date": "2026-09-01",
        "currency": "EUR", "type_id": salary[0], "subtype_id": salary[1],
        "description": "", "destinataire": "Employer"})
    with pytest.raises(ValueError, match="Only an expense"):
        db.add_refund(income, {"account_id": setup["card"], "transaction_date": "2026-10-01", "amount": 10})


def test_a_refund_cannot_be_refunded(db, setup):
    rid = refund(db, setup, 40.0)
    with pytest.raises(ValueError, match="cannot itself be refunded"):
        db.add_refund(rid, {"account_id": setup["card"], "transaction_date": "2026-10-09", "amount": 5})


def test_a_refund_needs_an_amount(db, setup):
    with pytest.raises(ValueError, match="positive"):
        refund(db, setup, 0)


# ── where it counts ──────────────────────────────────────────────────────────

@pytest.fixture
def api(db):
    from api import transactions as transactions_api
    transactions_api.db = db
    return transactions_api


def month_summary(api, month):
    return api.get_transaction_summary(start_date=f"2026-{month}-01", end_date=f"2026-{month}-31",
                                       current_user=None)


def test_a_refund_lowers_expenses_in_the_month_it_arrives(api, db, setup):
    refund(db, setup, 40.0, date="2026-10-05")
    september, october = month_summary(api, "09"), month_summary(api, "10")
    assert september["total_expense"] == 100.0
    assert (october["total_expense"], october["total_income"]) == (-40.0, 0.0)


def test_a_refund_lowers_the_budget_of_its_category(db, setup):
    db.add_budget({"type_id": setup["health"][0], "amount": 200, "currency": "EUR",
                   "period": "monthly", "start_date": "2026-01-01"})
    db.add_transaction({
        "account_id": setup["card"], "amount": -90.0, "transaction_date": "2026-10-02",
        "currency": "EUR", "type_id": setup["health"][0], "subtype_id": setup["health"][1],
        "description": "", "destinataire": "Apotheke"})
    refund(db, setup, 40.0, date="2026-10-05")
    [health] = db.get_budget_vs_actual(2026, 10)["categories"]
    assert health["actual"] == 50.0


# ── editing and deleting ─────────────────────────────────────────────────────

def test_an_expense_with_refunds_cannot_be_deleted(db, setup):
    rid = refund(db, setup, 40.0)
    with pytest.raises(ValueError, match="has 1 refund"):
        db.delete_transaction(setup["expense"])
    db.delete_transaction(rid)
    assert db.delete_transaction(setup["expense"]) is True


def test_an_edited_refund_stays_within_the_expense(db, setup):
    rid = refund(db, setup, 40.0)
    with pytest.raises(ValueError, match="Only 100.00 EUR"):
        db.update_transaction(rid, {"amount": 120.0})
    db.update_transaction(rid, {"amount": 90.0})
    assert db.get_transaction(rid)["amount"] == 90.0


def test_a_refund_keeps_the_expense_category(db, setup):
    rid = refund(db, setup, 40.0)
    food = ids_of(db, "Food")
    db.update_transaction(rid, {"type_id": food[0], "subtype_id": food[1]})
    assert db.get_transaction(rid)["type_id"] == setup["health"][0]


def test_an_expense_cannot_shrink_below_its_refunds(db, setup):
    refund(db, setup, 60.0)
    with pytest.raises(ValueError, match="cannot become smaller"):
        db.update_transaction(setup["expense"], {"amount": -50.0})


def test_refunds_follow_their_expense_to_a_new_category(db, setup):
    rid = refund(db, setup, 40.0)
    food = ids_of(db, "Food")
    db.update_transaction(setup["expense"], {"type_id": food[0], "subtype_id": food[1]})
    assert db.get_transaction(rid)["type_id"] == food[0]


def test_an_expense_with_refunds_stays_an_expense(db, setup):
    refund(db, setup, 40.0)
    salary = ids_of(db, "Salary")
    with pytest.raises(ValueError, match="has to stay an expense"):
        db.update_transaction(setup["expense"], {"type_id": salary[0], "subtype_id": salary[1]})


# ── the API ──────────────────────────────────────────────────────────────────

def test_the_add_form_records_a_refund_from_the_expense(api, db, setup):
    """Whatever category the form sends, a refund takes the expense's, positive."""
    food = ids_of(db, "Food")
    created = api.create_transaction(api.TransactionCreate(
        account_id=setup["joint"], date="2026-10-07", amount=-25.0, type_id=food[0], subtype_id=food[1],
        description="", destinataire="Optiker", refund_of_id=setup["expense"]), current_user=None)
    row = db.get_transaction(created["transaction_id"])
    assert (row["amount"], row["type_id"], row["refund_of_id"]) == (25.0, setup["health"][0], setup["expense"])


def test_editing_a_refund_through_the_api_keeps_it_positive(api, db, setup):
    rid = refund(db, setup, 40.0)
    api.update_transaction(rid, api.TransactionUpdate(amount=30.0), current_user=None)
    assert db.get_transaction(rid)["amount"] == 30.0


def test_the_api_answers_the_rules_with_400(api, db, setup):
    refund(db, setup, 40.0)
    with pytest.raises(HTTPException) as err:
        api.delete_transaction(setup["expense"], current_user=None)
    assert err.value.status_code == 400
    with pytest.raises(HTTPException) as err:
        api.create_refund(setup["expense"], api.RefundCreate(
            account_id=setup["card"], date="2026-10-08", amount=500.0), current_user=None)
    assert err.value.status_code == 400 and "left to refund" in err.value.detail


def test_the_list_shows_both_sides_of_the_link(api, db, setup):
    rid = refund(db, setup, 40.0)
    rows = {t["id"]: t for t in api.get_transactions(limit=100, offset=0, current_user=None)["transactions"]}
    assert rows[setup["expense"]]["refunded_amount"] == 40.0
    assert rows[rid]["refund_of"]["destinataire"] == "Optiker"


def test_refundable_expenses_are_searchable_and_exclude_fully_refunded(api, db, setup, monkeypatch):
    found = api.list_refundable_expenses(q="optik", limit=20, current_user=None)["expenses"]
    assert [(e["id"], e["remaining"]) for e in found] == [(setup["expense"], 100.0)]
    refund(db, setup, 100.0)
    assert api.list_refundable_expenses(q="optik", limit=20, current_user=None)["expenses"] == []


# ── a bug found on the way ───────────────────────────────────────────────────

def test_editing_a_transaction_keeps_its_recipient(api, db, setup):
    """Every edit carrying a description replaced the recipient with it."""
    api.update_transaction(setup["expense"], api.TransactionUpdate(
        amount=100.0, description="new frames", destinataire="Optiker"), current_user=None)
    assert db.get_transaction(setup["expense"])["destinataire"] == "Optiker"
