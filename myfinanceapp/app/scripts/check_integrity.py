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
"""
import argparse
import os
import sqlite3
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import paths


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
    conn = sqlite3.connect(args.db)
    try:
        # Deliberately left OFF: the check itself must inspect the data as it
        # stands, and enabling enforcement here would block the repair writes.
        rows = violations(conn)

        if not rows:
            print("No referential integrity violations. Safe to enforce foreign keys.")
            return 0

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


if __name__ == "__main__":
    sys.exit(main())
