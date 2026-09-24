"""
Managing recipients: add, rename, merge, delete, unify.

A recipient used to exist only as text on its transactions, so it could not be
added ahead of time, and deleting one was meaningless: every name in the list
was in use by definition. The `recipients` table is a catalogue on top of that
text, unique whatever the case, so "Lidl" and "LIDL" are one recipient.

Transfers, investment trades and debt payments carry an account, holding or
creditor name as their payee. None of this may list, rename or rewrite them.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_recipient_management.py -v
"""
import os
import sys
import tempfile

import pytest
from fastapi import HTTPException

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))
from database import FinanceDatabase, DatabaseIntegrityError, RecordInUseError


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    database.set_preference("display_currency", "EUR")
    yield database
    os.unlink(f.name)


@pytest.fixture
def account(db):
    return db.add_account({"name": "Cash", "owner_id": db.get_owners()[0]["id"],
                           "balance": 5000.0, "currency": "EUR",
                           "account_type": "checking"})


def type_ids(db, category):
    with db.db_connection(commit=False) as conn:
        return tuple(conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1", (category,)).fetchone())


def plant(db, account_id, payee, date="2026-01-10"):
    """A transaction stored with exactly this spelling, as older data may be.

    Raw SQL on purpose: the normal path now files a known name under its
    catalogue spelling, which is what makes planting variants impossible.
    """
    type_id, subtype_id = type_ids(db, "expense")
    with db.db_connection(commit=True) as conn:
        conn.execute(
            "INSERT INTO transactions (account_id, transaction_date, amount, currency,"
            " description, destinataire, type_id, subtype_id, confirmed)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (account_id, date, -10.0, "EUR", "x", payee, type_id, subtype_id))


def spend(db, account_id, payee, date="2026-01-10"):
    """A transaction entered the normal way."""
    type_id, subtype_id = type_ids(db, "expense")
    return db.add_transaction({
        "account_id": account_id, "amount": -10.0, "transaction_date": date,
        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
        "description": "x", "destinataire": payee})


def recipients(db):
    return {r["name"]: r["transaction_count"] for r in db.get_recipients()}


def recipient_id(db, name):
    return next(r["id"] for r in db.get_recipients() if r["name"] == name)


def stored(db):
    """Every payee as stored on transactions, with its count."""
    with db.db_connection(commit=False) as conn:
        rows = conn.execute("SELECT destinataire, COUNT(*) FROM transactions "
                            "GROUP BY destinataire").fetchall()
    return {row[0]: row[1] for row in rows}


def transfer(db, source, destination):
    type_id, subtype_id = type_ids(db, "transfer")
    db.add_transaction({
        "account_id": source, "amount": -100.0, "transaction_date": "2026-01-10",
        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
        "description": "move", "destinataire": "Savings",
        "is_transfer": True, "transfer_account_id": destination})


# ── one recipient whatever the case ──────────────────────────────────────────

def test_existing_payees_fill_the_catalogue(db, account):
    plant(db, account, "Rewe")
    plant(db, account, "Rewe")
    plant(db, account, "Lidl")

    assert recipients(db) == {"Rewe": 2, "Lidl": 1}


def test_case_variants_are_one_recipient(db, account):
    plant(db, account, "Lidl", "2026-01-10")
    plant(db, account, "Lidl", "2026-01-11")
    plant(db, account, "LIDL", "2026-01-12")

    assert recipients(db) == {"Lidl": 3}, "the most used spelling names it"


def test_variants_are_counted_for_unifying(db, account):
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")
    plant(db, account, "LIDL")

    only = db.get_recipients()[0]
    assert only["name"] == "LIDL"
    assert only["variant_count"] == 1


def test_a_new_transaction_takes_the_known_spelling(db, account):
    spend(db, account, "Lidl")
    spend(db, account, "LIDL")
    spend(db, account, "  lidl ")

    assert stored(db) == {"Lidl": 3}


def test_editing_a_payee_takes_the_known_spelling(db, account):
    spend(db, account, "Lidl")
    txn = spend(db, account, "Rewe")

    db.update_transaction(txn, {"destinataire": "LIDL"})

    assert stored(db) == {"Lidl": 2}


def test_reading_does_not_write(db, account):
    """The list and the form's field sync the catalogue on every read."""
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")
    db.get_recipients()
    with db.db_connection(commit=False) as conn:
        changes_before = conn.execute("SELECT seq FROM sqlite_sequence "
                                      "WHERE name = 'recipients'").fetchone()[0]

    for _ in range(3):
        db.get_recipients()
        db.get_recipient_names()

    with db.db_connection(commit=False) as conn:
        assert conn.execute("SELECT seq FROM sqlite_sequence "
                            "WHERE name = 'recipients'").fetchone()[0] == changes_before


def test_a_new_name_joins_the_catalogue_at_once(db, account):
    spend(db, account, "Rewe")
    assert "Rewe" in db.get_recipient_names()


# ── adding ───────────────────────────────────────────────────────────────────

def test_a_recipient_can_exist_before_any_transaction(db):
    db.add_recipient("  new   shop ")
    assert recipients(db) == {"New shop": 0}


def test_an_added_recipient_is_offered_by_the_form(db):
    db.add_recipient("Bakery")
    assert "Bakery" in db.get_recipient_names()


def test_adding_an_existing_name_in_another_case_is_refused(db, account):
    plant(db, account, "Lidl")
    with pytest.raises(DatabaseIntegrityError):
        db.add_recipient("LIDL")


def test_adding_an_empty_name_is_refused(db):
    with pytest.raises(ValueError):
        db.add_recipient("   ")


# ── renaming and merging ─────────────────────────────────────────────────────

def test_a_preview_changes_nothing(db, account):
    plant(db, account, "ReWe")

    preview = db.rename_recipient(recipient_id(db, "ReWe"), "Rewe Markt")

    assert preview["affected"] == 1
    assert preview["applied"] is False
    assert stored(db) == {"ReWe": 1}, "a preview must not touch the data"


def test_applying_renames_every_transaction(db, account):
    plant(db, account, "ReWe")
    plant(db, account, "ReWe")

    result = db.rename_recipient(recipient_id(db, "ReWe"), "Rewe Markt", apply_changes=True)

    assert result["affected"] == 2
    assert stored(db) == {"Rewe Markt": 2}
    assert recipients(db) == {"Rewe Markt": 2}


def test_changing_only_the_case_is_a_rename(db, account):
    plant(db, account, "LIDL")
    plant(db, account, "Lidl")

    db.rename_recipient(recipient_id(db, "LIDL"), "Lidl", apply_changes=True)

    assert stored(db) == {"Lidl": 2}


def test_a_preview_says_when_it_would_merge(db, account):
    plant(db, account, "Rewe", "2026-01-10")
    plant(db, account, "Rewe Markt", "2026-01-11")

    preview = db.rename_recipient(recipient_id(db, "Rewe Markt"), "REWE")

    assert preview["merges_into_existing"] is True
    assert preview["existing_count"] == 1


def test_merging_leaves_one_recipient(db, account):
    plant(db, account, "Rewe", "2026-01-10")
    plant(db, account, "Rewe Markt", "2026-01-11")
    plant(db, account, "Rewe Markt", "2026-01-12")

    db.rename_recipient(recipient_id(db, "Rewe Markt"), "Rewe", apply_changes=True)

    assert recipients(db) == {"Rewe": 3}
    assert stored(db) == {"Rewe": 3}


def test_an_unused_recipient_can_be_renamed(db):
    db.add_recipient("Bakry")
    db.rename_recipient(recipient_id(db, "Bakry"), "Bakery", apply_changes=True)
    assert recipients(db) == {"Bakery": 0}


def test_renaming_to_the_same_name_is_refused(db, account):
    plant(db, account, "Rewe")
    with pytest.raises(ValueError):
        db.rename_recipient(recipient_id(db, "Rewe"), "Rewe", apply_changes=True)


def test_an_empty_new_name_is_refused(db, account):
    plant(db, account, "Rewe")
    with pytest.raises(ValueError):
        db.rename_recipient(recipient_id(db, "Rewe"), "   ", apply_changes=True)


def test_renaming_an_unknown_recipient_finds_nothing(db):
    assert db.rename_recipient(9999, "Anything") is None


def test_renaming_does_not_touch_any_balance(db, account):
    """It is a relabelling; no money moves.

    plant() writes rows in raw SQL, so the stored balance is already out of step
    with the ledger here. What matters is that renaming leaves that gap as it was.
    """
    plant(db, account, "ReWe")
    balance_before = db.get_accounts()[0]["balance"]
    drift_before = db.verify_balances()

    db.rename_recipient(recipient_id(db, "ReWe"), "Rewe", apply_changes=True)

    assert db.get_accounts()[0]["balance"] == balance_before
    assert db.verify_balances() == drift_before


# ── deleting ─────────────────────────────────────────────────────────────────

def test_an_unused_recipient_can_be_deleted(db):
    db.add_recipient("Bakery")
    assert db.delete_recipient(recipient_id(db, "Bakery")) is True
    assert recipients(db) == {}


def test_a_recipient_in_use_cannot_be_deleted(db, account):
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")

    with pytest.raises(RecordInUseError, match="used by 2 transactions"):
        db.delete_recipient(recipient_id(db, "Lidl"))
    assert recipients(db) == {"Lidl": 2}


def test_a_merged_away_recipient_is_gone(db, account):
    """Merging is how a recipient in use stops being one."""
    plant(db, account, "Rewe")
    plant(db, account, "Rewe Markt")

    db.rename_recipient(recipient_id(db, "Rewe Markt"), "Rewe", apply_changes=True)

    assert "Rewe Markt" not in recipients(db)


def test_deleting_an_unknown_recipient_finds_nothing(db):
    assert db.delete_recipient(9999) is False


# ── unifying duplicates ──────────────────────────────────────────────────────

def test_the_duplicates_preview_keeps_the_most_used_spelling(db, account):
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")
    plant(db, account, "LIDL")
    plant(db, account, "Rewe")

    [group] = db.get_recipient_duplicates()

    assert group["keep"] == "LIDL"
    assert group["affected"] == 1
    assert {s["name"]: s["transaction_count"] for s in group["spellings"]} == {"LIDL": 2, "Lidl": 1}
    assert stored(db) == {"Lidl": 1, "LIDL": 2, "Rewe": 1}, "a preview must not touch the data"


def test_unifying_rewrites_every_variant(db, account):
    plant(db, account, "Lidl")
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")
    plant(db, account, "Rewe ")
    plant(db, account, "Rewe")

    result = db.unify_recipient_duplicates()

    assert result == {"recipients": 2, "transactions": 2}
    assert stored(db) == {"Lidl": 3, "Rewe": 2}
    assert db.get_recipient_duplicates() == []


def test_nothing_to_unify_changes_nothing(db, account):
    plant(db, account, "Lidl")
    assert db.unify_recipient_duplicates() == {"recipients": 0, "transactions": 0}


# ── transfers, investments and debts stay untouched ──────────────────────────

def test_transfers_are_not_recipients(db, account):
    savings = db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                              "balance": 0.0, "currency": "EUR", "account_type": "savings"})
    transfer(db, account, savings)

    assert recipients(db) == {}


def test_renaming_leaves_a_transfer_with_the_same_name_alone(db, account):
    savings = db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                              "balance": 0.0, "currency": "EUR", "account_type": "savings"})
    transfer(db, account, savings)
    plant(db, account, "Savings")

    db.rename_recipient(recipient_id(db, "Savings"), "Savings bank", apply_changes=True)

    assert stored(db) == {"Savings": 1, "Cash": 1, "Savings bank": 1}


def test_a_transfer_keeps_its_own_spelling(db, account):
    savings = db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                              "balance": 0.0, "currency": "EUR", "account_type": "savings"})
    db.add_recipient("SAVINGS")
    transfer(db, account, savings)

    assert stored(db)["Savings"] == 1


def test_investment_trades_are_not_recipients(db):
    owner = db.get_owners()[0]["id"]
    cash = db.add_account({"name": "Cash", "owner_id": owner, "balance": 10000.0,
                           "currency": "EUR", "account_type": "checking"})
    broker = db.add_account({"name": "Broker", "owner_id": owner, "balance": 0.0,
                             "currency": "EUR", "account_type": "investment"})
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET linked_account_id = ? WHERE id = ?", (cash, broker))
    holding = db.add_investment_holding({
        "account_id": broker, "symbol": "ACME", "name": "Acme Corp",
        "investment_type": "stock", "currency": "EUR", "quantity": 0, "average_cost": 0})
    for kind, date in (("buy", "2026-01-05"), ("sell", "2026-02-05")):
        db.add_investment_transaction({
            "holding_id": holding, "transaction_type": kind, "transaction_date": date,
            "shares": 10, "price_per_share": 10.0 if kind == "buy" else 13.0,
            "total_amount": 100.0 if kind == "buy" else 130.0,
            "fees": 0.0, "tax": 0.0, "currency": "EUR"})
    trade_rows = stored(db)["Acme Corp"]
    assert trade_rows == 3, "buy, sale capital, sale gain"
    plant(db, cash, "ACME CORP")   # a shop that happens to share the name

    assert recipients(db) == {"ACME CORP": 1}
    db.rename_recipient(recipient_id(db, "ACME CORP"), "Acme shop", apply_changes=True)
    assert stored(db) == {"Acme Corp": trade_rows, "Acme shop": 1}


def test_debt_payments_are_not_recipients(db, account):
    from api import debts as debts_api
    debts_api.db = db
    debt = db.add_debt({
        "name": "Car loan", "principal_amount": 5000.0, "current_balance": 5000.0,
        "interest_rate": 3.0, "interest_type": "simple", "monthly_payment": 200.0,
        "payment_day": 1, "currency": "EUR", "linked_account_id": account,
        "start_date": "2026-01-01"})
    db.add_recipient("CAR LOAN")

    class Payment:
        debt_id = debt
        amount = 200.0
        payment_date = "2026-02-01"
        payment_type = "regular"
        notes = None
    debts_api.add_debt_payment(Payment(), current_user=None)

    assert stored(db)["Car loan"] == 2, "interest and principal keep the debt's spelling"
    assert recipients(db) == {"CAR LOAN": 0}
    assert db.delete_recipient(recipient_id(db, "CAR LOAN")) is True
    assert stored(db)["Car loan"] == 2


def test_the_form_still_offers_account_names(db, account):
    savings = db.add_account({"name": "Savings", "owner_id": db.get_owners()[0]["id"],
                              "balance": 0.0, "currency": "EUR", "account_type": "savings"})
    transfer(db, account, savings)
    plant(db, account, "Lidl")
    plant(db, account, "LIDL")

    assert db.get_recipient_names() == ["Cash", "Lidl", "Savings"]


# ── after a backup restore ───────────────────────────────────────────────────

def test_a_database_without_the_catalogue_heals_on_read(db, account):
    """Restoring an older backup swaps the file without running migrations."""
    plant(db, account, "Lidl")
    with db.db_connection(commit=True) as conn:
        conn.execute("DROP TABLE recipients")

    assert recipients(db) == {"Lidl": 1}


def test_a_new_transaction_works_without_the_catalogue(db, account):
    with db.db_connection(commit=True) as conn:
        conn.execute("DROP TABLE recipients")

    spend(db, account, "Lidl")

    assert stored(db) == {"Lidl": 1}


# ── the API answers ──────────────────────────────────────────────────────────

@pytest.fixture
def api(db):
    from api import recipients as recipients_api
    recipients_api.db = db
    return recipients_api


def test_the_api_refuses_to_delete_a_recipient_in_use(api, db, account):
    plant(db, account, "Lidl")
    with pytest.raises(HTTPException) as err:
        api.delete_recipient(recipient_id(db, "Lidl"), current_user=None)
    assert err.value.status_code == 409
    assert "used by 1 transaction." in err.value.detail


def test_the_api_reports_a_duplicate_add_as_a_conflict(api, db, account):
    plant(db, account, "Lidl")
    with pytest.raises(HTTPException) as err:
        api.create_recipient(api.RecipientCreate(name="lidl"), current_user=None)
    assert err.value.status_code == 409


def test_the_api_answers_404_for_an_unknown_recipient(api):
    with pytest.raises(HTTPException) as err:
        api.rename_recipient(9999, api.RecipientRename(new_name="x"), current_user=None)
    assert err.value.status_code == 404
