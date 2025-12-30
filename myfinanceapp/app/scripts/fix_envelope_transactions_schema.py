#!/usr/bin/env python3
"""
Migration script to make account_id optional in envelope_transactions table.
Envelope transactions are virtual allocations, not linked to actual account transactions.
"""

import sqlite3
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.getenv('DATABASE_PATH', 'data/finance.db')

def migrate():
    """Make account_id optional in envelope_transactions"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        print("Starting migration: Making account_id optional in envelope_transactions...")

        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='envelope_transactions'")
        if not cursor.fetchone():
            print("Table envelope_transactions does not exist. Nothing to migrate.")
            return

        # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        print("1. Creating backup of envelope_transactions...")
        cursor.execute("""
            CREATE TABLE envelope_transactions_backup AS
            SELECT * FROM envelope_transactions
        """)

        print("2. Dropping old envelope_transactions table...")
        cursor.execute("DROP TABLE envelope_transactions")

        print("3. Creating new envelope_transactions table with optional account_id...")
        cursor.execute("""
            CREATE TABLE envelope_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                envelope_id INTEGER NOT NULL,
                transaction_date DATE NOT NULL,
                amount REAL NOT NULL,
                account_id INTEGER,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )
        """)

        print("4. Restoring data from backup...")
        cursor.execute("""
            INSERT INTO envelope_transactions
            SELECT * FROM envelope_transactions_backup
        """)

        print("5. Dropping backup table...")
        cursor.execute("DROP TABLE envelope_transactions_backup")

        conn.commit()
        print("✅ Migration completed successfully!")
        print("   - account_id is now optional in envelope_transactions")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
