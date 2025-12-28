#!/usr/bin/env python3
"""
Recalculate all account balances from confirmed transactions.
This script fixes balance mismatches by recalculating from the transaction ledger.
"""
import sqlite3
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def recalculate_all_balances(db_path: str, dry_run: bool = False):
    """
    Recalculate all account balances from confirmed transactions.

    Args:
        db_path: Path to the database file
        dry_run: If True, only show what would be changed without updating
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print('Account Balance Recalculation')
    print('=' * 100)

    # Get all accounts
    cursor.execute('SELECT id, name, balance, currency FROM accounts ORDER BY id')
    accounts = cursor.fetchall()

    updates = []

    for account in accounts:
        account_id = account['id']
        stored_balance = account['balance']

        # Calculate balance from all confirmed transactions
        cursor.execute('''
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE account_id = ? AND confirmed = 1
        ''', (account_id,))

        calculated_balance = cursor.fetchone()['total']
        diff = calculated_balance - stored_balance

        status = '✓ OK' if abs(diff) < 0.01 else '✗ NEEDS UPDATE'

        print(f"{status:15} | {account['name']:25} ({account['currency']}) | "
              f"Stored: {stored_balance:12.2f} | Calculated: {calculated_balance:12.2f} | "
              f"Diff: {diff:12.2f}")

        if abs(diff) >= 0.01:
            updates.append({
                'id': account_id,
                'name': account['name'],
                'old_balance': stored_balance,
                'new_balance': calculated_balance,
                'diff': diff
            })

    print('=' * 100)

    if updates:
        print(f"\nFound {len(updates)} accounts with balance mismatches.")

        if dry_run:
            print("\n[DRY RUN] No changes will be made. Run without --dry-run to apply fixes.")
        else:
            print("\nApplying balance corrections...")
            for update in updates:
                cursor.execute(
                    'UPDATE accounts SET balance = ? WHERE id = ?',
                    (update['new_balance'], update['id'])
                )
                print(f"  ✓ Updated {update['name']}: {update['old_balance']:.2f} → {update['new_balance']:.2f}")

            conn.commit()
            print(f"\n✓ Successfully updated {len(updates)} account balances!")
    else:
        print("\n✓ All account balances are correct!")

    conn.close()

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Recalculate account balances from transactions')
    parser.add_argument('--db-path',
                       default=os.getenv('DATABASE_PATH', '/app/data/finance.db'),
                       help='Path to database file')
    parser.add_argument('--dry-run',
                       action='store_true',
                       help='Show what would be changed without updating')

    args = parser.parse_args()

    recalculate_all_balances(args.db_path, args.dry_run)
