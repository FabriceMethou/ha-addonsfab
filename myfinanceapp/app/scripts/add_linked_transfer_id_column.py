#!/usr/bin/env python3
"""
Migration script to add linked_transfer_id column to transactions table.
This column links the two sides of a double-entry transfer (source and destination).
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def migrate():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_db_path = os.path.join(project_root, "data", "finance.db")
    db_path = os.getenv("DATABASE_PATH", default_db_path)

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(transactions)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'linked_transfer_id' in columns:
            print("Column 'linked_transfer_id' already exists. No migration needed.")
            return

        print("Adding linked_transfer_id column to transactions table...")
        cursor.execute("ALTER TABLE transactions ADD COLUMN linked_transfer_id INTEGER REFERENCES transactions(id)")

        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
