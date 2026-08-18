"""
Payee names, tidied and findable.

`SELECT DISTINCT destinataire` is case-sensitive and the filter matched exactly,
so "Carrefour", "CARREFOUR" and "carrefour" were three separate payees in the
autocomplete and typing "carref" found none of them.

Storage only capitalises the first letter — Title Case would turn SNCF into Sncf
and IKEA into Ikea, and bank exports are full of acronyms. Searching is
case-insensitive and partial instead, so the variants are found together.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_recipient_normalisation.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase
from utils import normalise_recipient


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


def spend(db, account_id, payee, amount=-10.0, date="2026-01-10"):
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = 'expense' LIMIT 1").fetchone()
    return db.add_transaction({
        "account_id": account_id, "amount": amount, "transaction_date": date,
        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
        "description": "test", "destinataire": payee})


# ── the rule ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, stored", [
    ("carrefour market", "Carrefour market"),
    ("  spaced   out  ", "Spaced out"),
    ("already Fine", "Already Fine"),
    ("", ""),
])
def test_the_first_letter_is_capitalised(raw, stored):
    assert normalise_recipient(raw) == stored


@pytest.mark.parametrize("acronym", ["SNCF", "EDF", "IKEA", "H&M"])
def test_acronyms_survive_untouched(acronym):
    """Title Case would ruin these, which is why the rule stops at letter one."""
    assert normalise_recipient(acronym) == acronym


def test_a_missing_value_becomes_empty(db):
    assert normalise_recipient(None) == ""


# ── it is applied on write ───────────────────────────────────────────────────

def test_a_new_transaction_stores_the_tidied_name(db, account):
    spend(db, account, "  carrefour   market ")
    assert db.get_transactions()[0]["destinataire"] == "Carrefour market"


def test_editing_a_payee_tidies_it_too(db, account):
    txn = spend(db, account, "Somewhere")
    db.update_transaction(txn, {"destinataire": "  new   payee "})
    assert db.get_transactions()[0]["destinataire"] == "New payee"


def test_a_transfer_mirror_is_tidied(db, account):
    other = db.add_account({"name": "savings pot", "owner_id": db.get_owners()[0]["id"],
                            "balance": 0.0, "currency": "EUR", "account_type": "savings"})
    with db.db_connection(commit=False) as conn:
        type_id, subtype_id = conn.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = 'transfer' LIMIT 1").fetchone()
    db.add_transaction({
        "account_id": account, "amount": -100.0, "transaction_date": "2026-01-10",
        "currency": "EUR", "type_id": type_id, "subtype_id": subtype_id,
        "description": "move", "destinataire": "savings pot",
        "is_transfer": True, "transfer_account_id": other})

    mirror = [t for t in db.get_transactions() if t["account_id"] == other][0]
    assert mirror["destinataire"] == "Cash"


# ── searching finds the variants together ────────────────────────────────────

def test_a_partial_name_finds_the_payee(db, account):
    spend(db, account, "Carrefour market")
    found = db.get_transactions({"destinataire": "carref"})
    assert len(found) == 1


def test_case_does_not_matter_when_searching(db, account):
    spend(db, account, "Carrefour market")
    assert len(db.get_transactions({"destinataire": "CARREFOUR"})) == 1


def test_variants_stored_differently_are_found_together(db, account):
    """The real complaint: shouty bank exports beside hand-typed entries."""
    spend(db, account, "CARREFOUR MARKET", date="2026-01-10")
    spend(db, account, "carrefour market", date="2026-01-11")

    assert len(db.get_transactions({"destinataire": "carrefour"})) == 2


def test_an_unrelated_payee_is_not_matched(db, account):
    spend(db, account, "Carrefour market")
    assert db.get_transactions({"destinataire": "lidl"}) == []
