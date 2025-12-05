#!/usr/bin/env python3
"""
Script to add missing investment transaction types to the database.
Run this script when the Streamlit app is NOT running.
"""

import sqlite3
import sys

def add_investment_types():
    try:
        conn = sqlite3.connect('data/finance.db')
        cursor = conn.cursor()

        print("Adding missing investment transaction types...")
        print("=" * 80)

        # First, check if 'Investments' type exists
        cursor.execute('SELECT id FROM transaction_types WHERE name = ?', ('Investments',))
        result = cursor.fetchone()

        if result:
            investments_type_id = result[0]
            print(f'✓ Investments type already exists (ID: {investments_type_id})')
        else:
            # Add 'Investments' type
            cursor.execute('INSERT INTO transaction_types (name, category) VALUES (?, ?)',
                         ('Investments', 'expense'))
            investments_type_id = cursor.lastrowid
            print(f'✓ Added Investments type (ID: {investments_type_id})')

        # Add 'Securities Purchase' subtype
        cursor.execute('SELECT id FROM transaction_subtypes WHERE type_id = ? AND name = ?',
                      (investments_type_id, 'Securities Purchase'))
        result = cursor.fetchone()

        if result:
            print(f'✓ Securities Purchase subtype already exists (ID: {result[0]})')
        else:
            cursor.execute('INSERT INTO transaction_subtypes (type_id, name) VALUES (?, ?)',
                         (investments_type_id, 'Securities Purchase'))
            print(f'✓ Added Securities Purchase subtype (ID: {cursor.lastrowid})')

        # Get Investment Income type ID
        cursor.execute('SELECT id FROM transaction_types WHERE name = ?', ('Investment Income',))
        result = cursor.fetchone()

        if result:
            investment_income_type_id = result[0]
            print(f'✓ Investment Income type found (ID: {investment_income_type_id})')

            # Add 'Sale Proceeds' subtype
            cursor.execute('SELECT id FROM transaction_subtypes WHERE type_id = ? AND name = ?',
                          (investment_income_type_id, 'Sale Proceeds'))
            result = cursor.fetchone()

            if result:
                print(f'✓ Sale Proceeds subtype already exists (ID: {result[0]})')
            else:
                cursor.execute('INSERT INTO transaction_subtypes (type_id, name) VALUES (?, ?)',
                             (investment_income_type_id, 'Sale Proceeds'))
                print(f'✓ Added Sale Proceeds subtype (ID: {cursor.lastrowid})')
        else:
            print("⚠️  Warning: Investment Income type not found. Creating it...")
            cursor.execute('INSERT INTO transaction_types (name, category) VALUES (?, ?)',
                         ('Investment Income', 'income'))
            investment_income_type_id = cursor.lastrowid

            # Add all investment income subtypes
            for subtype in ['Dividends', 'Sale Proceeds', 'Capital Gains', 'Interest']:
                cursor.execute('INSERT INTO transaction_subtypes (type_id, name) VALUES (?, ?)',
                             (investment_income_type_id, subtype))
                print(f'✓ Added {subtype} subtype')

        conn.commit()
        conn.close()

        print("\n" + "=" * 80)
        print("✅ SUCCESS! All required investment transaction types are now available!")
        print("\nYou can now use the investment transaction features:")
        print("  • Buy shares -> Uses 'Investments - Securities Purchase'")
        print("  • Sell shares -> Uses 'Investment Income - Sale Proceeds'")
        print("  • Dividends -> Uses 'Investment Income - Dividends'")
        print("\n💡 Restart the Streamlit app if it's running.")

        return 0

    except sqlite3.OperationalError as e:
        print(f"\n❌ ERROR: {e}")
        print("\n💡 Make sure the Streamlit app is NOT running.")
        print("   Stop it with Ctrl+C or 'docker-compose down'")
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(add_investment_types())
