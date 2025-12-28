#!/usr/bin/env python3
"""
Fix investment-linked transactions that were created with incorrect signs.

This script fixes a bug where investment purchase transactions were stored with
positive amounts instead of negative amounts, causing balance calculation errors
when deleting transactions.
"""

import sqlite3
import os

DB_PATH = os.getenv("DATABASE_PATH", "/home/fab/Documents/Development/myfinanceapp/data/finance.db")

def fix_investment_transaction_signs():
    """
    Fix the sign of transactions linked to investment purchases.

    Investment purchases should have negative amounts (money leaving account),
    but were incorrectly stored as positive due to using abs(cash_impact).
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("=== Fixing Investment Transaction Signs ===\n")

    # Find all transactions that are linked to investment transactions
    # and are for 'Investments' - 'Securities Purchase' (buy transactions)
    cursor.execute("""
        SELECT t.id, t.amount, t.description, t.transaction_date, a.name as account_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN transaction_types tt ON t.type_id = tt.id
        JOIN transaction_subtypes ts ON t.subtype_id = ts.id
        WHERE tt.name = 'Investments'
        AND ts.name = 'Securities Purchase'
        AND t.amount > 0
        AND EXISTS (
            SELECT 1 FROM investment_transactions it
            WHERE it.linked_transaction_id = t.id
        )
    """)

    buy_transactions = cursor.fetchall()

    print(f"Found {len(buy_transactions)} purchase transactions with incorrect positive amounts:\n")

    for txn in buy_transactions:
        print(f"  ID: {txn['id']}")
        print(f"  Account: {txn['account_name']}")
        print(f"  Date: {txn['transaction_date']}")
        print(f"  Description: {txn['description']}")
        print(f"  Current amount: {txn['amount']} (WRONG - should be negative)")
        print(f"  Will change to: {-txn['amount']}\n")

    if buy_transactions:
        response = input(f"Fix {len(buy_transactions)} transactions? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted. No changes made.")
            conn.close()
            return

        # Fix the signs
        for txn in buy_transactions:
            new_amount = -txn['amount']
            cursor.execute("""
                UPDATE transactions
                SET amount = ?
                WHERE id = ?
            """, (new_amount, txn['id']))

        conn.commit()
        print(f"\n✓ Fixed {len(buy_transactions)} transactions!")
    else:
        print("No transactions to fix. All investment purchases already have correct negative amounts.")

    # Also check for sell/dividend transactions that might be negative (should be positive)
    cursor.execute("""
        SELECT t.id, t.amount, t.description, t.transaction_date, a.name as account_name, ts.name as subtype
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN transaction_types tt ON t.type_id = tt.id
        JOIN transaction_subtypes ts ON t.subtype_id = ts.id
        WHERE tt.name = 'Investment Income'
        AND (ts.name = 'Sale Proceeds' OR ts.name = 'Dividends')
        AND t.amount < 0
        AND EXISTS (
            SELECT 1 FROM investment_transactions it
            WHERE it.linked_transaction_id = t.id
        )
    """)

    income_transactions = cursor.fetchall()

    if income_transactions:
        print(f"\nFound {len(income_transactions)} sell/dividend transactions with incorrect negative amounts:\n")

        for txn in income_transactions:
            print(f"  ID: {txn['id']}")
            print(f"  Account: {txn['account_name']}")
            print(f"  Type: {txn['subtype']}")
            print(f"  Date: {txn['transaction_date']}")
            print(f"  Description: {txn['description']}")
            print(f"  Current amount: {txn['amount']} (WRONG - should be positive)")
            print(f"  Will change to: {-txn['amount']}\n")

        response = input(f"Fix {len(income_transactions)} transactions? (yes/no): ")
        if response.lower() == 'yes':
            for txn in income_transactions:
                new_amount = -txn['amount']
                cursor.execute("""
                    UPDATE transactions
                    SET amount = ?
                    WHERE id = ?
                """, (new_amount, txn['id']))

            conn.commit()
            print(f"\n✓ Fixed {len(income_transactions)} transactions!")
        else:
            print("Skipped fixing sell/dividend transactions.")

    conn.close()
    print("\n=== Done ===")

if __name__ == "__main__":
    fix_investment_transaction_signs()
