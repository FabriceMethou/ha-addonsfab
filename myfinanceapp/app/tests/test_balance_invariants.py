"""
Balance invariants.

The stored `accounts.balance` is a running counter mutated on every write. These
tests pin the one property that must always hold:

    accounts.balance  ==  SUM(amount) over confirmed, non-historical transactions

Every operation that touches money is checked against it. When the counter and
the ledger disagree, the ledger is right — `recalculate_all_balances()` exists
precisely because the counter drifts.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_balance_invariants.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase


# ── helpers ──────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


def account(db, name, balance=0.0):
    return db.add_account({
        "name": name,
        "owner_id": db.get_owners()[0]["id"],
        "balance": balance,
        "currency": "EUR",
        "account_type": "checking",
    })


def category(db, kind):
    """First (type_id, subtype_id) pair for an income/expense/transfer category."""
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1",
            (kind,),
        )
        return cur.fetchone()


def transaction(db, account_id, amount, kind="expense", **extra):
    type_id, subtype_id = category(db, kind)
    payload = {
        "account_id": account_id,
        "amount": amount,
        "transaction_date": "2026-01-15",
        "currency": "EUR",
        "type_id": type_id,
        "subtype_id": subtype_id,
        "description": "test",
        "destinataire": "test",
    }
    payload.update(extra)
    return db.add_transaction(payload)


def stored_balance(db, account_id):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT balance FROM accounts WHERE id = ?", (account_id,))
        return round(cur.fetchone()[0], 2)


def ledger_balance(db, account_id):
    """What the balance should be, derived from the account's own history.

    add_account() seeds both `balance` and `opening_balance` with the starting
    amount, so the invariant is opening balance plus the ledger — not the ledger
    alone.
    """
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT COALESCE(opening_balance, 0) FROM accounts WHERE id = ?",
            (account_id,),
        )
        opening = cur.fetchone()[0]
        cur.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions "
            "WHERE account_id = ? AND confirmed = 1 "
            "AND COALESCE(is_historical, 0) = 0",
            (account_id,),
        )
        return round(opening + cur.fetchone()[0], 2)


def assert_consistent(db, *account_ids):
    """The counter must agree with the ledger for every account given."""
    for account_id in account_ids:
        assert stored_balance(db, account_id) == ledger_balance(db, account_id), (
            f"account {account_id}: stored balance {stored_balance(db, account_id)} "
            f"!= ledger sum {ledger_balance(db, account_id)}"
        )


def account_of(db, transaction_id):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT account_id FROM transactions WHERE id = ?", (transaction_id,))
        row = cur.fetchone()
        return row[0] if row else None


def mirror_of(db, transaction_id):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute("SELECT linked_transfer_id FROM transactions WHERE id = ?", (transaction_id,))
        row = cur.fetchone()
        return row[0] if row else None


# ── single-account operations ────────────────────────────────────────────────

def test_expense_decreases_balance(db):
    acc = account(db, "Checking", balance=1000.0)
    transaction(db, acc, -250.0, "expense")
    assert stored_balance(db, acc) == 750.0


def test_income_increases_balance(db):
    acc = account(db, "Checking", balance=1000.0)
    transaction(db, acc, 500.0, "income")
    assert stored_balance(db, acc) == 1500.0


def test_delete_reverses_the_balance_change(db):
    acc = account(db, "Checking", balance=0.0)
    txn = transaction(db, acc, -80.0, "expense")
    db.delete_transaction(txn)
    assert stored_balance(db, acc) == 0.0
    assert_consistent(db, acc)


def test_updating_the_amount_adjusts_the_balance(db):
    acc = account(db, "Checking", balance=0.0)
    txn = transaction(db, acc, -100.0, "expense")
    db.update_transaction(txn, {"amount": -30.0})
    assert stored_balance(db, acc) == -30.0
    assert_consistent(db, acc)


def test_moving_a_transaction_between_accounts_moves_the_money(db):
    source = account(db, "Source", balance=0.0)
    target = account(db, "Target", balance=0.0)
    txn = transaction(db, source, -100.0, "expense")

    db.update_transaction(txn, {"account_id": target})

    assert stored_balance(db, source) == 0.0
    assert stored_balance(db, target) == -100.0
    assert_consistent(db, source, target)


def test_repeated_edits_do_not_accumulate_drift(db):
    acc = account(db, "Checking", balance=0.0)
    txn = transaction(db, acc, -10.0, "expense")
    for amount in (-20.0, -0.1, -33.33, -7.77, -100.0):
        db.update_transaction(txn, {"amount": amount})
    assert_consistent(db, acc)
    assert stored_balance(db, acc) == -100.0


# ── transfers (double entry) ─────────────────────────────────────────────────

def test_transfer_moves_money_and_conserves_the_total(db):
    source = account(db, "Source", balance=1000.0)
    target = account(db, "Target", balance=0.0)

    transaction(db, source, -200.0, "transfer",
                is_transfer=True, transfer_account_id=target)

    assert stored_balance(db, source) == 800.0
    assert stored_balance(db, target) == 200.0
    assert stored_balance(db, source) + stored_balance(db, target) == 1000.0
    assert_consistent(db, source, target)


def test_transfer_creates_a_linked_mirror(db):
    source = account(db, "Source", balance=500.0)
    target = account(db, "Target", balance=0.0)

    txn = transaction(db, source, -100.0, "transfer",
                      is_transfer=True, transfer_account_id=target)

    mirror = mirror_of(db, txn)
    assert mirror is not None, "transfer should create a mirror transaction"
    assert account_of(db, mirror) == target


def test_deleting_a_transfer_removes_both_sides(db):
    source = account(db, "Source", balance=1000.0)
    target = account(db, "Target", balance=0.0)

    txn = transaction(db, source, -200.0, "transfer",
                      is_transfer=True, transfer_account_id=target)
    db.delete_transaction(txn)

    assert stored_balance(db, source) == 1000.0
    assert stored_balance(db, target) == 0.0
    assert_consistent(db, source, target)


def test_changing_a_transfer_amount_updates_both_sides(db):
    source = account(db, "Source", balance=1000.0)
    target = account(db, "Target", balance=0.0)

    txn = transaction(db, source, -200.0, "transfer",
                      is_transfer=True, transfer_account_id=target)
    db.update_transaction(txn, {"amount": -50.0})

    assert stored_balance(db, source) == 950.0
    assert stored_balance(db, target) == 50.0
    assert_consistent(db, source, target)


def test_retargeting_a_transfer_moves_the_mirror(db):
    """F-04: changing transfer_account_id must move the mirror with the money.

    The mirror row keeps its original account_id while the balance is applied to
    the new target, so the old account is debited, the new one credited, and the
    mirror is left behind in the wrong account.
    """
    source = account(db, "Source", balance=1000.0)
    first = account(db, "First target", balance=0.0)
    second = account(db, "Second target", balance=0.0)

    txn = transaction(db, source, -200.0, "transfer",
                      is_transfer=True, transfer_account_id=first)
    assert stored_balance(db, first) == 200.0

    db.update_transaction(txn, {"transfer_account_id": second})

    assert stored_balance(db, first) == 0.0, "money must leave the original target"
    assert stored_balance(db, second) == 200.0, "money must arrive in the new target"
    assert account_of(db, mirror_of(db, txn)) == second, "mirror must follow the money"
    assert_consistent(db, source, first, second)


def test_transfer_total_is_conserved_after_retargeting(db):
    """Whatever happens to the sides, no money may be created or destroyed."""
    source = account(db, "Source", balance=1000.0)
    first = account(db, "First target", balance=0.0)
    second = account(db, "Second target", balance=0.0)

    txn = transaction(db, source, -200.0, "transfer",
                      is_transfer=True, transfer_account_id=first)
    db.update_transaction(txn, {"transfer_account_id": second})

    total = (stored_balance(db, source)
             + stored_balance(db, first)
             + stored_balance(db, second))
    assert total == 1000.0


# ── unconfirmed and historical transactions ──────────────────────────────────

# ── drift detection ──────────────────────────────────────────────────────────

def test_verify_balances_is_quiet_when_everything_agrees(db):
    acc = account(db, "Checking", balance=500.0)
    transaction(db, acc, -120.0, "expense")
    transaction(db, acc, 40.0, "income")
    assert db.verify_balances() == []


def test_verify_balances_reports_a_corrupted_counter(db):
    """A counter nudged behind the ledger's back must be caught."""
    acc = account(db, "Checking", balance=500.0)
    transaction(db, acc, -100.0, "expense")

    # Simulate what a buggy write path leaves behind.
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET balance = balance + 25 WHERE id = ?", (acc,))

    drift = db.verify_balances()
    assert len(drift) == 1
    assert drift[0]['account_id'] == acc
    assert drift[0]['difference'] == 25.0
    assert drift[0]['ledger_balance'] == 400.0


def test_recalculating_clears_the_drift(db):
    acc = account(db, "Checking", balance=500.0)
    transaction(db, acc, -100.0, "expense")
    with db.db_connection(commit=True) as conn:
        conn.execute("UPDATE accounts SET balance = balance + 25 WHERE id = ?", (acc,))
    assert db.verify_balances() != []

    db.recalculate_all_balances()

    assert db.verify_balances() == [], "recalculation must restore agreement"


def test_the_counter_stays_on_exact_cents(db):
    """Rounding each write keeps the counter comparable to the ledger.

    Without it, thousands of writes leave a sub-cent residue that makes any
    exact drift check noisy and therefore useless.
    """
    acc = account(db, "Checking", balance=0.0)
    for _ in range(200):
        transaction(db, acc, -0.07, "expense")
    assert stored_balance(db, acc) == -14.0
    assert db.verify_balances() == []


# ── atomicity ────────────────────────────────────────────────────────────────

def test_a_failed_update_leaves_the_balance_untouched(db):
    """F-09: reversal and re-application must commit together, or not at all.

    update_transaction reverses the old balance before writing the new row. If
    the write then fails, committing anyway would persist the reversal — money
    would simply disappear from the account.
    """
    acc = account(db, "Checking", balance=1000.0)
    txn = transaction(db, acc, -100.0, "expense")
    assert stored_balance(db, acc) == 900.0

    # Retarget the transaction at an account that does not exist. The balance
    # reversal happens first, then the UPDATE trips the foreign key.
    with pytest.raises(Exception):
        db.update_transaction(txn, {"account_id": 99999})

    assert stored_balance(db, acc) == 900.0, "the reversal must have been rolled back"
    assert_consistent(db, acc)


def test_a_failed_insert_leaves_no_partial_transfer(db):
    """A transfer writes two rows and two balances; a failure must undo all of it."""
    source = account(db, "Source", balance=1000.0)
    type_id, subtype_id = category(db, "transfer")

    with pytest.raises(Exception):
        db.add_transaction({
            "account_id": source,
            "amount": -200.0,
            "transaction_date": "2026-01-15",
            "currency": "EUR",
            "type_id": type_id,
            "subtype_id": subtype_id,
            "description": "test",
            "destinataire": "test",
            "is_transfer": True,
            "transfer_account_id": 99999,   # no such account
        })

    assert stored_balance(db, source) == 1000.0
    assert_consistent(db, source)


def test_the_database_stays_writable_after_a_failed_write(db):
    """The failing call must release its connection, not sit on the write lock.

    Without a context manager the connection stayed alive inside the exception's
    traceback frame, holding its lock until the garbage collector got to it.
    """
    acc = account(db, "Checking", balance=100.0)

    with pytest.raises(Exception):
        db.update_transaction(
            transaction(db, acc, -10.0, "expense"), {"account_id": 99999}
        )

    # Would block for busy_timeout (30s) and then fail if the lock were still held.
    follow_up = transaction(db, acc, -5.0, "expense")
    assert follow_up is not None
    assert_consistent(db, acc)


def test_unconfirmed_transactions_do_not_move_the_balance(db):
    acc = account(db, "Checking", balance=100.0)
    transaction(db, acc, -50.0, "expense", confirmed=False)
    assert stored_balance(db, acc) == 100.0


def test_confirming_applies_the_amount_once(db):
    acc = account(db, "Checking", balance=100.0)
    txn = transaction(db, acc, -50.0, "expense", confirmed=False)
    db.update_transaction(txn, {"confirmed": True})
    assert stored_balance(db, acc) == 50.0
    assert_consistent(db, acc)
