#!/usr/bin/env python3
"""
Re-book past debt payments as interest + principal.

A payment used to be written as a single expense for the whole amount, so a 200
instalment counted as 200 of spending even though only the interest — often a
few euros — was actually a cost. The rest reduced the debt, which raises net
worth rather than lowering it.

Nothing is invented: interest_paid and principal_paid have been stored on every
payment all along. This only re-files what was already recorded.

    python3 scripts/split_debt_payments.py              # report only
    python3 scripts/split_debt_payments.py --apply      # rewrite
    python3 scripts/split_debt_payments.py --db /path.db

Take a backup first — past monthly expense figures will drop by the capital
repaid. Net worth does not move: it was already correct.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paths
from database import FinanceDatabase
from integrity import find_old_loan_payments, old_payment_split, rebook_old_loan_payment


def split(db, payment, apply_changes):
    """Re-file one payment. Returns (interest, principal) as re-booked."""
    if apply_changes:
        rebook_old_loan_payment(db, payment)
    return old_payment_split(payment)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=str(paths.DB_PATH))
    parser.add_argument("--apply", action="store_true",
                        help="rewrite the payments instead of only reporting")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        return 2

    db = FinanceDatabase(db_path=args.db)
    payments = find_old_loan_payments(db)

    print(f"Database: {args.db}\n")
    if not payments:
        print("No payments left to re-book.")
        return 0

    print(f"{len(payments)} payment(s) still booked as a single expense:\n")
    total_interest = total_principal = 0.0
    for payment in payments:
        interest, principal = split(db, payment, args.apply)
        total_interest += interest
        total_principal += principal
        print(f"  {payment['payment_date']}  {payment['debt_name']:<24}"
              f"  {abs(payment['row_amount']):>9,.2f}"
              f"  ->  interest {interest:>8,.2f} + principal {principal:>9,.2f}")

    print(f"\n  {'':<36}{'':>9}      {total_interest:>17,.2f}   {total_principal:>9,.2f}")

    if not args.apply:
        print("\nReport only — nothing was changed.")
        print("Re-run with --apply to rewrite them (take a backup first).")
        return 1

    print(f"\nRe-booked {len(payments)} payment(s).")
    print(f"Past expense figures drop by {total_principal:,.2f} in total; net worth is unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
