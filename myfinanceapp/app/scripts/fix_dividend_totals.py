#!/usr/bin/env python3
"""
Repair dividends recorded with a total of 0.

An early version stored a dividend's amount in price_per_share and left
total_amount at 0. This copies the amount across. It used to be an API endpoint
anyone logged in could call; a one-off repair belongs here instead.

    python3 scripts/fix_dividend_totals.py            # report only
    python3 scripts/fix_dividend_totals.py --apply
    python3 scripts/fix_dividend_totals.py --db /path.db
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paths
from database import FinanceDatabase


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=str(paths.DB_PATH))
    parser.add_argument("--apply", action="store_true",
                        help="repair the dividends instead of only reporting")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        return 2

    db = FinanceDatabase(db_path=args.db)
    print(f"Database: {args.db}\n")

    with db.db_connection(commit=False) as conn:
        rows = conn.execute(
            "SELECT id, transaction_date, price_per_share FROM investment_transactions "
            "WHERE transaction_type = 'dividend' AND total_amount = 0").fetchall()

    if not rows:
        print("No dividend has a total of 0.")
        return 0

    print(f"{len(rows)} dividend(s) with a total of 0:\n")
    for row in rows:
        print(f"  #{row['id']}  {row['transaction_date']}  -> {row['price_per_share']}")

    if not args.apply:
        print("\nReport only — nothing was changed.")
        print("Re-run with --apply to repair them.")
        return 1

    with db.db_connection(commit=True) as conn:
        conn.execute(
            "UPDATE investment_transactions SET total_amount = price_per_share "
            "WHERE transaction_type = 'dividend' AND total_amount = 0")

    print(f"\nRepaired {len(rows)} dividend(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
