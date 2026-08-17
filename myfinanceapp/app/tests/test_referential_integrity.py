"""
Referential integrity.

The schema declares ~30 foreign keys and several ON DELETE CASCADE clauses, but
SQLite ignores all of them unless `PRAGMA foreign_keys = ON` is set on the
connection. These tests pin the constraints as actually enforced, so a future
connection helper that forgets the pragma fails loudly here rather than silently
letting orphans accumulate.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_referential_integrity.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase, DatabaseIntegrityError


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


def account(db, name="Checking"):
    return db.add_account({
        "name": name,
        "owner_id": db.get_owners()[0]["id"],
        "balance": 0.0,
        "currency": "EUR",
        "account_type": "checking",
    })


def category(db, kind="expense"):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1",
            (kind,),
        )
        return cur.fetchone()


# ── the pragma itself ────────────────────────────────────────────────────────

def test_foreign_key_enforcement_is_on(db):
    """Every connection the database layer hands out must enforce foreign keys."""
    with db.db_connection(commit=False) as conn:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_a_fresh_database_has_no_violations(db):
    account(db, "Checking")
    with db.db_connection(commit=False) as conn:
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []


# ── constraints are refused ──────────────────────────────────────────────────

def test_a_transaction_cannot_reference_a_missing_account(db):
    type_id, subtype_id = category(db)
    with pytest.raises(DatabaseIntegrityError):
        with db.db_connection(commit=True) as conn:
            conn.execute(
                "INSERT INTO transactions "
                "(account_id, transaction_date, amount, currency, destinataire, "
                " type_id, subtype_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (99999, "2026-01-15", -10.0, "EUR", "x", type_id, subtype_id),
            )


def test_an_account_cannot_reference_a_missing_owner(db):
    with pytest.raises(DatabaseIntegrityError):
        with db.db_connection(commit=True) as conn:
            conn.execute(
                "INSERT INTO accounts (name, account_type, currency, owner_id, balance) "
                "VALUES (?, ?, ?, ?, ?)",
                ("Orphan", "checking", "EUR", 99999, 0.0),
            )


def test_deleting_an_account_with_transactions_is_refused(db):
    """The account row must not vanish from under its transactions."""
    acc = account(db, "Checking")
    type_id, subtype_id = category(db)
    db.add_transaction({
        "account_id": acc,
        "amount": -25.0,
        "transaction_date": "2026-01-15",
        "currency": "EUR",
        "type_id": type_id,
        "subtype_id": subtype_id,
        "description": "test",
        "destinataire": "test",
    })

    with pytest.raises(DatabaseIntegrityError):
        with db.db_connection(commit=True) as conn:
            conn.execute("DELETE FROM accounts WHERE id = ?", (acc,))


# ── cascades actually cascade ────────────────────────────────────────────────

def test_deleting_an_envelope_cascades_to_its_allocations(db):
    envelope_id = db.add_envelope({
        "name": "Holiday",
        "target_amount": 1000.0,
        "current_amount": 0.0,
    })
    acc = account(db, "Savings")
    db.add_envelope_transaction({
        "envelope_id": envelope_id,
        "amount": 100.0,
        "transaction_date": "2026-01-15",
        "account_id": acc,
        "description": "allocation",
    })

    with db.db_connection(commit=True) as conn:
        conn.execute("DELETE FROM envelopes WHERE id = ?", (envelope_id,))

    with db.db_connection(commit=False) as conn:
        remaining = conn.execute(
            "SELECT COUNT(*) FROM envelope_transactions WHERE envelope_id = ?",
            (envelope_id,),
        ).fetchone()[0]
    assert remaining == 0, "ON DELETE CASCADE should have removed the allocations"


def test_deleting_a_transaction_type_cascades_to_its_subtypes(db):
    with db.db_connection(commit=True) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO transaction_types (name, category) VALUES (?, ?)",
            ("Throwaway", "expense"),
        )
        type_id = cur.lastrowid
        cur.execute(
            "INSERT INTO transaction_subtypes (type_id, name) VALUES (?, ?)",
            (type_id, "Sub"),
        )

    with db.db_connection(commit=True) as conn:
        conn.execute("DELETE FROM transaction_types WHERE id = ?", (type_id,))

    with db.db_connection(commit=False) as conn:
        remaining = conn.execute(
            "SELECT COUNT(*) FROM transaction_subtypes WHERE type_id = ?",
            (type_id,),
        ).fetchone()[0]
    assert remaining == 0
