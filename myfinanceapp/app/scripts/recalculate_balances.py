#!/usr/bin/env python3
"""
Recalculate all account balances from confirmed transactions.
This script fixes balance mismatches by recalculating from the transaction ledger.

Usage:
    # From project root, with backend virtual environment activated:
    cd backend
    source venv/bin/activate
    cd ..

    # Dry run (show what would change):
    python3 scripts/recalculate_balances.py --dry-run

    # Actually recalculate:
    python3 scripts/recalculate_balances.py

The script uses the database method `recalculate_all_balances()` which:
- Resets all accounts to their opening_balance
- Processes all confirmed transactions in chronological order
- Skips historical transactions (is_historical=1)
- Skips transactions before account opening dates
- Handles transfer destination accounts correctly
"""
import os
import sys
import argparse

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import FinanceDatabase


def simulate_recalculation(db: FinanceDatabase):
    """
    Simulate what recalculation would do without making changes.
    Returns list of accounts with differences.
    """
    import sqlite3

    conn = db._get_connection()
    cursor = conn.cursor()

    # Get all accounts with current balance and opening balance
    cursor.execute('SELECT id, name, balance, opening_balance, opening_date, currency FROM accounts ORDER BY id')
    accounts = cursor.fetchall()
    account_opening_dates = {acc['id']: acc['opening_date'] for acc in accounts}

    differences = []

    for account in accounts:
        account_id = account['id']
        current_balance = account['balance']
        opening_balance = account['opening_balance'] if account['opening_balance'] is not None else 0
        opening_date = account['opening_date']

        # Simulate: start with opening balance
        calculated_balance = opening_balance

        # Get all confirmed transactions for this account
        cursor.execute("""
            SELECT t.id, t.account_id, t.amount, t.is_transfer, t.transfer_account_id,
                   t.is_historical, t.transaction_date, tt.category
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.account_id = ? AND t.confirmed = 1
            ORDER BY t.transaction_date ASC, t.created_at ASC
        """, (account_id,))
        transactions = cursor.fetchall()

        processed_count = 0
        skipped_count = 0

        for trans in transactions:
            # Skip historical transactions
            if trans['is_historical']:
                skipped_count += 1
                continue

            # Skip transactions before opening date
            if opening_date and trans['transaction_date'] < opening_date:
                skipped_count += 1
                continue

            # Apply transaction amount (already correctly signed)
            calculated_balance += trans['amount']
            processed_count += 1

        # Check for transfers TO this account (destination side)
        cursor.execute("""
            SELECT t.id, t.amount, t.transaction_date, t.is_historical
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.transfer_account_id = ?
              AND t.confirmed = 1
              AND t.is_transfer = 1
              AND tt.category = 'transfer'
            ORDER BY t.transaction_date ASC, t.created_at ASC
        """, (account_id,))
        incoming_transfers = cursor.fetchall()

        for trans in incoming_transfers:
            # Skip historical transactions
            if trans['is_historical']:
                continue

            # Skip transactions before opening date
            if opening_date and trans['transaction_date'] < opening_date:
                continue

            # Add the transfer amount (use absolute value since it's coming in)
            amount = abs(trans['amount'])
            if amount > 0:
                calculated_balance += amount
                processed_count += 1

        diff = calculated_balance - current_balance

        if abs(diff) >= 0.01:
            differences.append({
                'id': account_id,
                'name': account['name'],
                'currency': account['currency'],
                'current_balance': current_balance,
                'calculated_balance': calculated_balance,
                'diff': diff,
                'opening_balance': opening_balance,
                'transactions_processed': processed_count,
                'transactions_skipped': skipped_count
            })

    conn.close()
    return differences


def main():
    parser = argparse.ArgumentParser(
        description='Recalculate account balances from transactions',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Show what would be changed without making changes
  python3 scripts/recalculate_balances.py --dry-run

  # Actually recalculate and update balances
  python3 scripts/recalculate_balances.py

  # Use custom database path
  python3 scripts/recalculate_balances.py --db-path /custom/path/finance.db
        """
    )
    parser.add_argument(
        '--db-path',
        default=os.getenv('DATABASE_PATH', '/home/fab/Documents/Development/myfinanceapp/data/finance.db'),
        help='Path to database file (default: from DATABASE_PATH env var)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be changed without updating'
    )

    args = parser.parse_args()

    # Initialize database
    db = FinanceDatabase(db_path=args.db_path)

    print('Account Balance Recalculation')
    print('=' * 120)

    if args.dry_run:
        print('[DRY RUN MODE] Simulating recalculation without making changes...\n')

        differences = simulate_recalculation(db)

        if differences:
            # Print header
            print(f"{'Status':<15} | {'Account Name':<30} {'Curr':<5} | {'Current':<12} {'Calculated':<12} {'Difference':<12} | {'Opening':<12}")
            print('-' * 120)

            for diff in differences:
                status = '✗ NEEDS UPDATE'
                print(
                    f"{status:<15} | {diff['name']:<30} {diff['currency']:<5} | "
                    f"{diff['current_balance']:>12.2f} {diff['calculated_balance']:>12.2f} {diff['diff']:>12.2f} | "
                    f"{diff['opening_balance']:>12.2f}"
                )

            print('=' * 120)
            print(f"\nFound {len(differences)} accounts with balance mismatches.")
            print("\nRun without --dry-run to apply these changes.")
        else:
            print('✓ All account balances are correct!')
    else:
        print('Recalculating all account balances...\n')

        try:
            result = db.recalculate_all_balances()

            print('=' * 120)
            print('\n✓ Balance recalculation completed successfully!')
            print(f"  - Accounts updated: {result['accounts_updated']}")
            print(f"  - Transactions processed: {result['transactions_processed']}")
            print(f"  - Historical/pre-opening transactions skipped: {result['historical_skipped']}")
            print("\nAll account balances have been recalculated from scratch.")
        except Exception as e:
            print(f'\n✗ Error during recalculation: {str(e)}')
            sys.exit(1)


if __name__ == '__main__':
    main()
