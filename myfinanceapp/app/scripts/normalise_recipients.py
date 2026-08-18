#!/usr/bin/env python3
"""
Tidy payee names already in the ledger.

New and edited transactions are normalised on the way in; this brings the
existing ones into line. Only leading/trailing and repeated whitespace is
collapsed and the first letter capitalised — acronyms and shouty bank exports
are left as they are, because Title Case would turn SNCF into Sncf.

    python3 scripts/normalise_recipients.py            # report only
    python3 scripts/normalise_recipients.py --apply
    python3 scripts/normalise_recipients.py --db /path.db
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paths
from database import FinanceDatabase
from utils import normalise_recipient


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", default=str(paths.DB_PATH))
    parser.add_argument("--apply", action="store_true",
                        help="rewrite the names instead of only reporting")
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        return 2

    db = FinanceDatabase(db_path=args.db)
    print(f"Database: {args.db}\n")

    with db.db_connection(commit=False) as conn:
        rows = conn.execute(
            "SELECT DISTINCT destinataire FROM transactions "
            "WHERE destinataire IS NOT NULL AND TRIM(destinataire) != ''"
        ).fetchall()

    changes = [(row['destinataire'], normalise_recipient(row['destinataire']))
               for row in rows]
    changes = [(before, after) for before, after in changes if before != after]

    if not changes:
        print("Every payee name is already tidy.")
        return 0

    print(f"{len(changes)} name(s) would change:\n")
    width = max(len(before) for before, _ in changes)
    for before, after in sorted(changes):
        print(f"  {before:<{width}}  ->  {after}")

    if not args.apply:
        print("\nReport only — nothing was changed.")
        print("Re-run with --apply to rewrite them.")
        return 1

    with db.db_connection(commit=True) as conn:
        for before, after in changes:
            conn.execute(
                "UPDATE transactions SET destinataire = ? WHERE destinataire = ?",
                (after, before))

    print(f"\nRenamed {len(changes)} payee(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
