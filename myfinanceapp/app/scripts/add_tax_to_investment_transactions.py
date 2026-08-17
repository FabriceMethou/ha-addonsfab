"""
Migration script to add tax column to investment_transactions table
"""
import sqlite3
import os
import sys

# Get database path from environment or use default
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import paths

DB_PATH = str(paths.DB_PATH)

def add_tax_column():
    """Add tax column to investment_transactions table if it doesn't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if tax column already exists
    cursor.execute("PRAGMA table_info(investment_transactions)")
    columns = [col[1] for col in cursor.fetchall()]

    if 'tax' in columns:
        print("Tax column already exists in investment_transactions table")
        conn.close()
        return

    # Add tax column
    print("Adding tax column to investment_transactions table...")
    cursor.execute("""
        ALTER TABLE investment_transactions
        ADD COLUMN tax REAL DEFAULT 0
    """)

    conn.commit()
    conn.close()
    print("Successfully added tax column to investment_transactions table")

if __name__ == "__main__":
    try:
        add_tax_column()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
