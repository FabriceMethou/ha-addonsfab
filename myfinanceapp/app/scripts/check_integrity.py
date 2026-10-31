#!/usr/bin/env python3
"""
Report — and optionally repair — referential integrity violations.

Foreign keys were declared in the schema from the start but never enforced,
because `PRAGMA foreign_keys = ON` was missing from the connection helpers.
Any database that ran under the old code may therefore hold rows pointing at
parents that no longer exist. Enforcement is now on, so those rows will make
future writes fail.

Run this against a live database before deploying the change:

    python3 scripts/check_integrity.py                 # report only
    python3 scripts/check_integrity.py --fix           # delete orphaned rows
    python3 scripts/check_integrity.py --db /path.db   # explicit database

--fix deletes orphans; take a backup first. The Backups page or
scripts/auto_backup.py both produce one.

It also reports loan payments and trades whose ledger rows no longer match them,
and what the next upgrade changes in the data. Point --db at a copy of a backup
to check before upgrading: opening a database with this version of the code
applies its migrations, even in a report. The linked rows are read before that.
"""
import argparse
import os
import sqlite3
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import paths
from database import REFUNDS_MISSING_OWNER

#: A cent of rounding per row is not drift.
TOLERANCE = 0.015


def violations(conn):
    """Rows whose foreign key points at a missing parent.

    PRAGMA foreign_key_check reports (table, rowid, parent_table, fk_index)
    and runs regardless of whether enforcement is enabled.
    """
    return conn.execute("PRAGMA foreign_key_check").fetchall()


def describe(conn, rows):
    counts = Counter((r[0], r[2]) for r in rows)
    width = max((len(t) for t, _ in counts), default=10)
    return "\n".join(
        f"  {table:<{width}}  {count:>5} row(s) referencing a missing {parent}"
        for (table, parent), count in sorted(counts.items(), key=lambda kv: -kv[1])
    )


def delete_orphans(conn, rows):
    """Delete each offending row by its rowid, grouped per table."""
    by_table = {}
    for table, rowid, _parent, _fk in rows:
        # A row can violate several constraints at once; rowid dedupes it.
        by_table.setdefault(table, set()).add(rowid)

    deleted = Counter()
    for table, rowids in by_table.items():
        for rowid in rowids:
            conn.execute(f'DELETE FROM "{table}" WHERE rowid = ?', (rowid,))
            deleted[table] += 1
    return deleted


def _rows(conn, query, params=()):
    return [dict(row) for row in conn.execute(query, params).fetchall()]


def _ledger_rows(conn, ids):
    """The ledger rows behind a payment or trade, and how many are missing."""
    wanted = [row_id for row_id in ids if row_id]
    found = _rows(conn, f"""
        SELECT t.*, tt.category FROM transactions t
          JOIN transaction_types tt ON tt.id = t.type_id
         WHERE t.id IN ({','.join('?' * len(wanted))})
    """, wanted) if wanted else []
    return found, len(wanted) - len(found)


def _row_problems(rows, expected, date, what):
    """Whether rows still show the cash and date of what they belong to."""
    problems = []
    cash = sum(row['amount'] for row in rows)
    if abs(cash - expected) > TOLERANCE:
        problems.append(f"the ledger shows {abs(cash):.2f}, the {what} says {abs(expected):.2f}")
    for row in rows:
        if str(row['transaction_date'])[:10] != str(date)[:10]:
            problems.append(f"a ledger row is dated {row['transaction_date']}, the {what} {date}")
        if not row['confirmed']:
            problems.append("a ledger row is marked pending")
    return problems


def _loan_payment_problems(conn):
    problems = []
    for payment in _rows(conn, """
        SELECT dp.*, d.name AS debt_name FROM debt_payments dp
          JOIN debts d ON d.id = dp.debt_id ORDER BY dp.payment_date, dp.id
    """):
        subject = f"{payment['debt_name']}, payment of {payment['payment_date']}"
        total = payment['amount'] or payment['extra_payment'] or 0
        rows, missing = _ledger_rows(
            conn, (payment['transaction_id'], payment['principal_transaction_id']))
        found = _row_problems(rows, -total, payment['payment_date'], "payment")
        if missing or (not rows and total):
            found = ["its ledger rows are missing"]
        if len({row['account_id'] for row in rows}) > 1:
            found.append("its two ledger rows are on different accounts")
        if payment['principal_transaction_id'] and any(
                row['id'] == payment['principal_transaction_id'] and row['category'] != 'transfer'
                for row in rows):
            found.append("its capital row is no longer in a transfer category")
        problems += [{'kind': 'loan payment', 'subject': subject, 'problem': p} for p in found]
    return problems


def _trade_problems(conn):
    problems = []
    for trade in _rows(conn, """
        SELECT it.*, s.symbol, a.linked_account_id
          FROM investment_transactions it
          JOIN investment_holdings h ON h.id = it.holding_id
          JOIN securities s ON s.id = h.security_id
          JOIN accounts a ON a.id = h.account_id
         ORDER BY it.transaction_date, it.id
    """):
        subject = f"{trade['symbol']}, {trade['transaction_type']} of {trade['transaction_date']}"
        total, costs = trade['total_amount'] or 0, (trade['fees'] or 0) + (trade['tax'] or 0)
        expected = {'buy': -(total + costs), 'sell': total - costs}.get(trade['transaction_type'], total)
        rows, missing = _ledger_rows(
            conn, (trade['linked_transaction_id'], trade['gain_transaction_id']))
        found = _row_problems(rows, expected, trade['transaction_date'], "trade")
        if missing or (not rows and abs(expected) > TOLERANCE):
            found = ["its cash row is missing"]
        if any(row['account_id'] != trade['linked_account_id'] for row in rows):
            found.append("its cash row is not on the broker's linked account")
        problems += [{'kind': 'trade', 'subject': subject, 'problem': p} for p in found]
    return problems


def linked_row_problems(conn):
    """Loan payments, trades and loans whose rows no longer agree with each other.

    Expects sqlite3.Row rows. Only reads: which side is right is for the owner of
    the data to say.
    """
    problems = _loan_payment_problems(conn) + _trade_problems(conn)
    problems += [{'kind': 'loan', 'subject': debt['name'],
                  'problem': f"its balance is {debt['current_balance']:.2f}, below zero"}
                 for debt in _rows(conn, "SELECT * FROM debts WHERE current_balance < -0.005")]
    # Deleting a holding used to leave these behind, after reversing their cash.
    problems += [{'kind': 'left-over gain', 'subject': f"{row['transaction_date']} {row['destinataire']}",
                  'problem': f"a realised gain of {row['amount']:.2f} belongs to no trade"}
                 for row in _rows(conn, """
        SELECT t.transaction_date, t.destinataire, t.amount FROM transactions t
          JOIN transaction_types tt ON tt.id = t.type_id
          JOIN transaction_subtypes ts ON ts.id = t.subtype_id
         WHERE tt.name = 'Investment Income' AND ts.name = 'Realised Gain'
           AND t.id NOT IN (SELECT gain_transaction_id FROM investment_transactions
                             WHERE gain_transaction_id IS NOT NULL)
    """)]
    return problems


def upgrade_notes(conn):
    """What the upgrade changes in the numbers, as opposed to what is broken."""
    notes = []
    false_interest = _rows(conn, """
        SELECT COUNT(*) AS payments, COALESCE(SUM(interest_paid), 0) AS interest
          FROM debt_payments WHERE amount = 0 AND extra_payment > 0
    """)[0]
    if false_interest['payments']:
        notes.append(f"{false_interest['payments']} extra loan payment(s) carry false interest of "
                     f"{false_interest['interest']:.2f}: the upgrade clears it.")
    for debt in _rows(conn, """
        SELECT name, current_balance, currency FROM debts
         WHERE is_active = 0 AND current_balance > 0.005 ORDER BY name
    """):
        notes.append(f"Deleted loan \"{debt['name']}\" still shows {debt['current_balance']:.2f} "
                     f"{debt['currency']}: the upgrade removes it from net worth history.")
    refunds = len(conn.execute(REFUNDS_MISSING_OWNER).fetchall())
    if refunds:
        notes.append(f"{refunds} refund(s) count for the wrong owner: "
                     f"scripts/fix_refund_owners.py repairs them.")
    return notes


def report_linked_rows(db_path):
    """Print what linked_row_problems and upgrade_notes find."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        problems = linked_row_problems(conn)
        notes = upgrade_notes(conn)
    except sqlite3.OperationalError as e:
        # A database older than the columns read here. The checks after this one
        # still have to run: they are the reason to open an old database at all.
        print(f"Linked rows could not be checked, the database is too old: {e}")
        return 1
    finally:
        conn.close()

    if problems:
        print(f"Linked rows: {len(problems)} problem(s). Nothing was changed:\n")
        for found in problems:
            print(f"  {found['kind']:<14}  {found['subject']}: {found['problem']}")
        if any(found['kind'] == 'left-over gain' for found in problems):
            print("\n  Unless you entered a left-over gain by hand, delete it on the Transactions\n"
                  "  page before recalculating balances. A recalculation counts it, which would\n"
                  "  make the extra cash stick.")
    else:
        print("Linked rows: every loan payment and trade matches its ledger rows.")
    if notes:
        print("\nThe upgrade will change:")
        for note in notes:
            print(f"  {note}")
    return 1 if problems else 0


def report_stale_historical_flags(db_path, fix):
    """Transactions wrongly marked as predating their account."""
    from database import FinanceDatabase

    db = FinanceDatabase(db_path=db_path)
    stale = db.find_stale_historical_flags()
    if not stale:
        print("Historical flags: none are stale.")
        return 0

    print(f"Historical flags: {len(stale)} transaction(s) marked historical but dated "
          f"after their account opened:\n")
    width = max(len(s['account_name']) for s in stale)
    for row in stale:
        print(f"  {row['account_name']:<{width}}  {row['transaction_date']}  "
              f"{row['amount']:>10,.2f}  {(row['destinataire'] or '')[:24]}")
    print("\n  These are skipped when the balance is updated but counted when it is\n"
          "  rebuilt, which shows up as drift nothing explains.")

    if not fix:
        print("  Re-run with --fix to clear them, then recalculate the balances.")
        return 1

    cleared = db.clear_stale_historical_flags()
    print(f"\n  Cleared {cleared} flag(s). Run scripts/recalculate_balances.py next.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=str(paths.DB_PATH),
                        help="database file (default: the resolved DATABASE_PATH)")
    parser.add_argument("--fix", action="store_true",
                        help="delete orphaned rows instead of only reporting them")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        return 2

    print(f"Database: {args.db}\n")

    # First: the reports below open the database with the current code, which
    # applies its migrations.
    linked_status = report_linked_rows(args.db)
    print()

    # Balance drift is reported alongside referential integrity: both are ways
    # the data can be internally inconsistent, and both matter before a deploy.
    drift_status = report_balance_drift(args.db)
    print()
    flag_status = report_stale_historical_flags(args.db, args.fix)
    print()

    conn = sqlite3.connect(args.db)
    try:
        # Deliberately left OFF: the check itself must inspect the data as it
        # stands, and enabling enforcement here would block the repair writes.
        rows = violations(conn)

        if not rows:
            print("No referential integrity violations. Safe to enforce foreign keys.")
            return linked_status or drift_status or flag_status

        print(f"Found {len(rows)} violation(s):\n")
        print(describe(conn, rows))

        if not args.fix:
            print("\nReport only — nothing was changed.")
            print("Re-run with --fix to delete these rows (take a backup first).")
            return 1

        deleted = delete_orphans(conn, rows)
        conn.commit()

        print("\nDeleted:")
        for table, count in sorted(deleted.items()):
            print(f"  {table}: {count} row(s)")

        remaining = violations(conn)
        if remaining:
            print(f"\n{len(remaining)} violation(s) remain — cascading parents may "
                  f"need a second pass. Re-run the script.")
            return 1

        print("\nAll violations resolved.")
        return 0
    finally:
        conn.close()


def report_balance_drift(db_path):
    """Compare every account's stored balance against its own ledger."""
    from database import FinanceDatabase

    drift = FinanceDatabase(db_path=db_path).verify_balances()
    if not drift:
        print("Balances: every account agrees with its ledger.")
        return 0

    print(f"Balances: {len(drift)} account(s) disagree with their ledger:\n")
    width = max(len(d['name']) for d in drift)
    for d in drift:
        print(f"  {d['name']:<{width}}  stored {d['stored_balance']:>12,.2f} "
              f"vs ledger {d['ledger_balance']:>12,.2f} "
              f"{d['currency']}  (off by {d['difference']:+,.2f})")
    print("\nRun scripts/recalculate_balances.py to rebuild them from the ledger.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
