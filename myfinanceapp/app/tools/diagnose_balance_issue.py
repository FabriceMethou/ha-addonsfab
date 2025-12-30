#!/usr/bin/env python3
"""
Diagnostic script to help identify balance calculation issues.
Run this inside your Docker container.
"""

import os
import sys
from datetime import datetime

# Add the project root to Python path
sys.path.append('/app')

from database import FinanceDatabase

def diagnose_balance_issue():
    """Diagnose balance calculation issues."""
    
    print("=== Balance Calculation Diagnostic ===")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Database path: {os.getenv('DATABASE_PATH', 'Not set')}")
    
    try:
        # Initialize database
        db = FinanceDatabase()
        print("✅ Database connection successful")
        
        # Get all accounts
        accounts = db.get_accounts()
        print(f"\nFound {len(accounts)} accounts")
        
        # Find Trade Republic account (or show all accounts if not found)
        trade_republic_accounts = []
        for account in accounts:
            if 'trade republic' in account.get('name', '').lower():
                trade_republic_accounts.append(account)
        
        if not trade_republic_accounts:
            print("❌ No Trade Republic account found by name")
            print("\nAll accounts in the system:")
            for i, account in enumerate(accounts):
                print(f"{i+1}. {account['name']} (ID: {account['id']}, Balance: {account['balance']}, Opening Date: {account.get('opening_date')})")
            
            # Let user select an account to diagnose
            account_id_input = input("\nEnter the ID of the account you want to diagnose: ")
            try:
                account_id = int(account_id_input)
                selected_account = next((a for a in accounts if a['id'] == account_id), None)
                if selected_account:
                    trade_republic_accounts.append(selected_account)
                else:
                    print("❌ Account not found")
                    return
            except ValueError:
                print("❌ Invalid account ID")
                return
        
        print(f"\nFound {len(trade_republic_accounts)} Trade Republic account(s):")
        
        for account in trade_republic_accounts:
            print(f"\n--- Account: {account['name']} (ID: {account['id']}) ---")
            print(f"Opening Date: {account.get('opening_date')}")
            print(f"Opening Balance: {account.get('opening_balance')}")
            print(f"Current Balance: {account['balance']}")
            print(f"Currency: {account.get('currency')}")
            
            # Get transactions for this account
            transactions = db.get_transactions({'account_id': account['id']})
            print(f"Total Transactions: {len(transactions)}")
            
            # Analyze transactions by date
            if account.get('opening_date'):
                opening_date = datetime.fromisoformat(account['opening_date']).date()
                
                before_opening = []
                after_opening = []
                
                for trans in transactions:
                    trans_date = datetime.fromisoformat(trans['transaction_date']).date()
                    if trans_date < opening_date:
                        before_opening.append(trans)
                    else:
                        after_opening.append(trans)
                
                print(f"Transactions before opening date: {len(before_opening)}")
                print(f"Transactions after opening date: {len(after_opening)}")
                
                if before_opening:
                    print("\nTransactions BEFORE opening date (should not affect balance):")
                    total_before = sum(t['amount'] for t in before_opening if t['category'] in ['income', 'expense', 'transfer'])
                    print(f"Total amount in before-opening transactions: {total_before}")
                    
                    # Show a few examples
                    for i, trans in enumerate(before_opening[:3]):
                        print(f"  {i+1}. {trans['transaction_date']}: {trans['amount']} {trans['currency']} - {trans['category']} - {trans['destinataire']}")
                    if len(before_opening) > 3:
                        print(f"  ... and {len(before_opening) - 3} more")
                
                if after_opening:
                    print(f"\nTransactions AFTER opening date (should affect balance):")
                    total_after = sum(t['amount'] for t in after_opening if t['category'] in ['income', 'expense', 'transfer'])
                    print(f"Total amount in after-opening transactions: {total_after}")
                
                # Calculate expected balance
                opening_balance = account.get('opening_balance', 0)
                expected_balance = opening_balance
                
                for trans in after_opening:
                    if trans['category'] == 'income':
                        expected_balance += trans['amount']
                    elif trans['category'] == 'expense':
                        expected_balance -= trans['amount']
                    elif trans['category'] == 'transfer' and trans['is_transfer']:
                        # For transfers, the amount is negative for source account
                        expected_balance += trans['amount']  # This will be negative
                
                print(f"\nExpected balance calculation:")
                print(f"Opening balance: {opening_balance}")
                print(f"Expected balance: {expected_balance}")
                print(f"Actual balance: {account['balance']}")
                print(f"Difference: {account['balance'] - expected_balance}")
                
                if abs(account['balance'] - expected_balance) > 0.01:
                    print("❌ Balance mismatch detected!")
                else:
                    print("✅ Balance matches expected calculation")
            else:
                print("⚠️  No opening date set for this account")
                print("All transactions will be included in balance calculation")
        
        # Run balance recalculation
        print("\n" + "="*50)
        print("Running balance recalculation...")
        result = db.recalculate_all_balances()
        print(f"Recalculation result: {result}")
        
        # Check balance after recalculation
        print("\nBalances after recalculation:")
        for account in trade_republic_accounts:
            fresh_account = db.get_account(account['id'])
            print(f"Account {account['id']} ({account['name']}): {fresh_account['balance']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    diagnose_balance_issue()