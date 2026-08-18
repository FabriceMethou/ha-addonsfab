"""
Renaming a payee across the ledger.

A typo — "ReWe" for "Rewe" — used to be permanent: the only fix was editing
every transaction by hand. Normalisation on write only covers the first letter,
so anything mistyped further along stays mistyped.

Renaming can also merge: if the target already exists, the two collapse into
one. That is usually what you want and always worth being told about first,
which is why every rename can be previewed before it is applied.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_recipient_management.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


@pytest.fixture
def account(db):
    return db.add_account({"name": "Cash", "owner_id": db.get_owners()[0]["id"],
                           "balance": 5000.0, "currency": "EUR",
                           "account_type": "checking"})


def spend(db, account_id, payee, date="2026-01-10"):
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = 'expense' LIMIT 1").fetchone()
    # Written directly so the test can plant a payee exactly as stored,
    # bypassing the normalisation that happens on the normal path.
    with db.db_connection(commit=True) as conn:
        conn.execute(
            "INSERT INTO transactions (account_id, transaction_date, amount, currency,"
            " description, destinataire, type_id, subtype_id, confirmed)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (account_id, date, -10.0, "EUR", "x", payee, type_id, subtype_id))


def payees(db):
    return {r["recipient"]: r["transaction_count"]
            for r in db.get_recipients_with_counts()}


# ── listing ──────────────────────────────────────────────────────────────────

def test_each_payee_is_listed_with_its_count(db, account):
    spend(db, account, "Rewe", "2026-01-10")
    spend(db, account, "Rewe", "2026-01-11")
    spend(db, account, "Lidl", "2026-01-12")

    assert payees(db) == {"Rewe": 2, "Lidl": 1}


def test_case_variants_are_listed_separately(db, account):
    """They are separate values on disk — the list has to show that, or the
    user cannot see what needs fixing."""
    spend(db, account, "Rewe", "2026-01-10")
    spend(db, account, "ReWe", "2026-01-11")

    assert set(payees(db)) == {"Rewe", "ReWe"}


# ── previewing ───────────────────────────────────────────────────────────────

def test_a_preview_changes_nothing(db, account):
    spend(db, account, "ReWe")

    preview = db.rename_recipient("ReWe", "Rewe", apply_changes=False)

    assert preview["affected"] == 1
    assert payees(db) == {"ReWe": 1}, "a preview must not touch the data"


def test_a_preview_says_when_it_would_merge(db, account):
    spend(db, account, "Rewe", "2026-01-10")
    spend(db, account, "ReWe", "2026-01-11")

    preview = db.rename_recipient("ReWe", "Rewe", apply_changes=False)

    assert preview["merges_into_existing"] is True
    assert preview["existing_count"] == 1, "how many are already under the new name"


def test_a_plain_rename_is_not_a_merge(db, account):
    spend(db, account, "ReWe")
    preview = db.rename_recipient("ReWe", "Rewe", apply_changes=False)
    assert preview["merges_into_existing"] is False


def test_an_unknown_payee_affects_nothing(db, account):
    spend(db, account, "Rewe")
    assert db.rename_recipient("Nowhere", "Somewhere", apply_changes=False)["affected"] == 0


# ── applying ─────────────────────────────────────────────────────────────────

def test_applying_renames_every_transaction(db, account):
    spend(db, account, "ReWe", "2026-01-10")
    spend(db, account, "ReWe", "2026-01-11")

    result = db.rename_recipient("ReWe", "Rewe", apply_changes=True)

    assert result["affected"] == 2
    assert payees(db) == {"Rewe": 2}


def test_applying_merges_when_the_target_exists(db, account):
    spend(db, account, "Rewe", "2026-01-10")
    spend(db, account, "ReWe", "2026-01-11")
    spend(db, account, "REWE", "2026-01-12")

    db.rename_recipient("ReWe", "Rewe", apply_changes=True)
    db.rename_recipient("REWE", "Rewe", apply_changes=True)

    assert payees(db) == {"Rewe": 3}


def test_other_payees_are_untouched(db, account):
    spend(db, account, "ReWe", "2026-01-10")
    spend(db, account, "Lidl", "2026-01-11")

    db.rename_recipient("ReWe", "Rewe", apply_changes=True)

    assert payees(db) == {"Rewe": 1, "Lidl": 1}


def test_the_new_name_is_tidied_like_any_other(db, account):
    spend(db, account, "ReWe")
    db.rename_recipient("ReWe", "  rewe  ", apply_changes=True)
    assert payees(db) == {"Rewe": 1}


def test_renaming_to_the_same_name_is_refused(db, account):
    spend(db, account, "Rewe")
    with pytest.raises(ValueError):
        db.rename_recipient("Rewe", "Rewe", apply_changes=True)


def test_an_empty_new_name_is_refused(db, account):
    spend(db, account, "Rewe")
    with pytest.raises(ValueError):
        db.rename_recipient("Rewe", "   ", apply_changes=True)


def test_renaming_does_not_touch_any_balance(db, account):
    """It is a relabelling; no money moves.

    The helper inserts rows in raw SQL to plant an exact spelling, so the
    counter is already out of step with the ledger here. What matters is that
    renaming leaves that gap exactly as it found it.
    """
    spend(db, account, "ReWe")
    balance_before = db.get_accounts()[0]["balance"]
    drift_before = db.verify_balances()

    db.rename_recipient("ReWe", "Rewe", apply_changes=True)

    assert db.get_accounts()[0]["balance"] == balance_before
    assert db.verify_balances() == drift_before
