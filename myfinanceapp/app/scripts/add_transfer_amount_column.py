#!/usr/bin/env python3
"""
Migration script to add transfer_amount column to transactions table.
This column stores the amount received in the destination account for cross-currency transfers.
"""

import sqlite3
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def migrate():
    db_path = os.getenv("DATABASE_PATH", "/home/fab/Documents/Development/myfinanceapp/data/finance.db")

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(transactions)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'transfer_amount' in columns:
            print("Column 'transfer_amount' already exists. No migration needed.")
            return

        # Add the transfer_amount column
        print("Adding transfer_amount column to transactions table...")
        cursor.execute("ALTER TABLE transactions ADD COLUMN transfer_amount REAL")

        conn.commit()
        print("Migration completed successfully!")
        print("The transfer_amount column has been added to the transactions table.")

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
