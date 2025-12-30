#!/usr/bin/env python3
import sqlite3
import sys

DB_PATH = "/home/fab/Documents/Development/myfinanceapp/data/finance.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find Trade Republic bank
cursor.execute("SELECT id, name FROM banks WHERE name LIKE '%trade%' OR name LIKE '%Trade%' OR name LIKE '%republic%' OR name LIKE '%Republic%'")
banks = cursor.fetchall()

if not banks:
    print("No Trade Republic bank found")
    # List all banks
    cursor.execute("SELECT id, name FROM banks")
    all_banks = cursor.fetchall()
    print("\nAll banks:")
    for bank in all_banks:
        print(f"  ID: {bank['id']}, Name: {bank['name']}")
else:
    for bank in banks:
        print(f"Bank ID: {bank['id']}, Name: {bank['name']}")

        # Find checking account for this bank
        cursor.execute("SELECT id, name, balance, currency FROM accounts WHERE bank_id = ?", (bank['id'],))
        accounts = cursor.fetchall()
        print(f"\nAccounts for {bank['name']}:")
        for acc in accounts:
            print(f"  Account ID: {acc['id']}, Name: {acc['name']}, Balance: {acc['balance']}, Currency: {acc['currency']}")

            # Get last 5 transactions for this account
            cursor.execute("""
                SELECT t.id, t.transaction_date, t.amount, t.description, tt.category, tt.name as type_name
                FROM transactions t
                JOIN transaction_types tt ON t.type_id = tt.id
                WHERE t.account_id = ?
                ORDER BY t.transaction_date DESC, t.id DESC
                LIMIT 5
            """, (acc['id'],))
            transactions = cursor.fetchall()
            print(f"\n  Last 5 transactions:")
            for txn in transactions:
                print(f"    ID: {txn['id']}, Date: {txn['transaction_date']}, Amount: {txn['amount']}, Type: {txn['type_name']}/{txn['category']}, Description: {txn['description']}")

conn.close()
