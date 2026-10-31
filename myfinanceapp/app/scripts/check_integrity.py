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
from integrity import delete_orphans, linked_row_problems, upgrade_notes, violations


def describe(conn, rows):
    counts = Counter((r[0], r[2]) for r in rows)
    width = max((len(t) for t, _ in counts), default=10)
    return "\n".join(
        f"  {table:<{width}}  {count:>5} row(s) referencing a missing {parent}"
        for (table, parent), count in sorted(counts.items(), key=lambda kv: -kv[1])
    )


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
