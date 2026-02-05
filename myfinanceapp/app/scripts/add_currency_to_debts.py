#!/usr/bin/env python3
"""
Migration script to add currency column to debts table.
Existing debts default to EUR.
"""
import sqlite3
import os
import sys

# Get database path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)


def migrate():
    """Add currency column to debts table if it doesn't exist."""
    print(f"Connecting to database: {DB_PATH}")

    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("PRAGMA table_info(debts)")
    columns = [col[1] for col in cursor.fetchall()]

    if 'currency' in columns:
        print("Column 'currency' already exists in debts table. Nothing to do.")
        conn.close()
        return

    print("Adding 'currency' column to debts table...")

    try:
        # Add the currency column with default EUR
        cursor.execute("""
            ALTER TABLE debts
            ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'
        """)

        # Count updated rows
        cursor.execute("SELECT COUNT(*) FROM debts")
        debt_count = cursor.fetchone()[0]

        conn.commit()
        print(f"Successfully added 'currency' column. {debt_count} existing debts set to EUR.")

        # Also update recurring templates linked to debts to use EUR if not set
        cursor.execute("""
            UPDATE recurring_templates
            SET currency = 'EUR'
            WHERE linked_debt_id IS NOT NULL AND (currency IS NULL OR currency = '')
        """)
        updated_templates = cursor.rowcount
        conn.commit()

        if updated_templates > 0:
            print(f"Updated {updated_templates} recurring templates with EUR currency.")

    except sqlite3.Error as e:
        print(f"Error during migration: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

    print("Migration completed successfully!")


if __name__ == "__main__":
    migrate()
