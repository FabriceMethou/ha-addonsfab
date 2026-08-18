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


def find_unsplit_payments(db):
    """Payments still carrying a single row for the whole instalment."""
    with db.db_connection(commit=False) as conn:
        return [dict(row) for row in conn.execute("""
            SELECT p.id, p.debt_id, p.transaction_id, p.payment_date,
                   p.amount, p.principal_paid, p.interest_paid, p.extra_payment,
                   d.name AS debt_name, d.currency,
                   t.account_id, t.amount AS row_amount, t.tags
              FROM debt_payments p
              JOIN debts d ON d.id = p.debt_id
              JOIN transactions t ON t.id = p.transaction_id
             WHERE p.principal_transaction_id IS NULL
               AND p.transaction_id IS NOT NULL
             ORDER BY p.payment_date
        """).fetchall()]


def split(db, payment, apply_changes):
    """Re-file one payment. Returns (interest, principal) as re-booked."""
    interest = round(payment['interest_paid'] or 0, 2)
    principal = round((payment['principal_paid'] or 0) + (payment['extra_payment'] or 0), 2)
    is_extra = bool(payment['extra_payment'])
    payment_type = 'extra' if is_extra else 'regular'

    if not apply_changes:
        return interest, principal

    label = "Extra payment" if is_extra else "Monthly payment"
    tags = payment['tags'] or ("Extra Debt Payment" if is_extra else "Debt Payment")
    written = {}

    for part, amount in (('interest', interest), ('principal', principal)):
        if not amount:
            continue
        type_id, subtype_id = db.get_or_create_debt_category(
            payment['debt_name'], payment_type, part)
        written[part] = db.add_transaction({
            'account_id': payment['account_id'],
            'transaction_date': payment['payment_date'],
            'amount': -abs(amount),
            'type_id': type_id,
            'subtype_id': subtype_id,
            'description': f"{label} ({part}): {payment['debt_name']}",
            'destinataire': payment['debt_name'],
            'currency': payment['currency'] or 'EUR',
            'confirmed': True,
            'tags': tags,
        })

    with db.db_connection(commit=True) as conn:
        # Point the payment at its new rows before removing the old one, so the
        # foreign key never dangles.
        conn.execute(
            "UPDATE debt_payments SET transaction_id = ?, principal_transaction_id = ? "
            "WHERE id = ?",
            (written.get('interest'), written.get('principal'), payment['id']))

    # delete_transaction, not a raw DELETE: the old row still counts against the
    # account balance, and dropping it in SQL would leave the payment debited
    # twice — once by the row just written, once by the one silently removed.
    db.delete_transaction(payment['transaction_id'])

    return interest, principal


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
    payments = find_unsplit_payments(db)

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
