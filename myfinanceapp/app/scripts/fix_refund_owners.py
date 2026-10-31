#!/usr/bin/env python3
"""
Give old refunds the owner of the expense they pay back.

Refunds used not to inherit that owner, so a refund landing on another owner's
account lowered that person's spending instead. Only refunds with no owner of
their own are touched. Take a backup before using --apply.

    python3 scripts/fix_refund_owners.py            # report only
    python3 scripts/fix_refund_owners.py --apply
    python3 scripts/fix_refund_owners.py --db /path.db
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paths
from database import REFUNDS_MISSING_OWNER, FinanceDatabase


def find_refunds_to_repair(db):
    with db.db_connection(commit=False) as conn:
        return [dict(row) for row in conn.execute(REFUNDS_MISSING_OWNER).fetchall()]


def repair(db, refunds):
    with db.db_connection(commit=True) as conn:
        for refund in refunds:
            conn.execute("UPDATE transactions SET owner_id = ? WHERE id = ?",
                         (refund['expense_owner_id'], refund['id']))
    return len(refunds)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=str(paths.DB_PATH))
    parser.add_argument("--apply", action="store_true",
                        help="repair the refunds instead of only reporting")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        return 2

    db = FinanceDatabase(db_path=args.db)
    print(f"Database: {args.db}\n")

    refunds = find_refunds_to_repair(db)
    if not refunds:
        print("No refund needs a new owner.")
        return 0

    print(f"{len(refunds)} refund(s) count for the wrong owner:\n")
    for refund in refunds:
        print(f"  #{refund['id']}  {refund['transaction_date']}  {refund['amount']:>10,.2f}  "
              f"{(refund['destinataire'] or '')[:24]:<24}  -> {refund['expense_owner']}")

    if not args.apply:
        print("\nReport only. Re-run with --apply to repair them.")
        return 0

    print(f"\nRepaired {repair(db, refunds)} refund(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
