#!/usr/bin/env python3
"""
Diagnostic script to analyze all accounts for balance calculation issues.
Run this inside your Docker container.
"""

import os
import sys
from datetime import datetime

# Add the project root to Python path
sys.path.append('/app')

from database import FinanceDatabase

def analyze_account_balance(account, db):
    """Analyze a single account's balance."""
    print(f"\n--- Analyzing Account: {account['name']} (ID: {account['id']}) ---")
    print(f"Opening Date: {account.get('opening_date')}")
    print(f"Opening Balance: {account.get('opening_balance')}")
    print(f"Current Balance: {account['balance']}")
    print(f"Currency: {account.get('currency')}")
    
    # Get transactions for this account
    transactions = db.get_transactions({'account_id': account['id']})
    print(f"Total Transactions: {len(transactions)}")
    
    # Check if account has opening date
    if not account.get('opening_date'):
        print("⚠️  No opening date set - all transactions will affect balance")
        return False
    
    # Analyze transactions by date
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
    
    print(f"Expected balance: {expected_balance}")
    print(f"Actual balance: {account['balance']}")
    
    difference = account['balance'] - expected_balance
    print(f"Difference: {difference}")
    
    if abs(difference) > 0.01:
        print("❌ Balance mismatch detected!")
        
        # Show some transactions before opening date
        if before_opening:
            print(f"\nSample transactions BEFORE opening date ({opening_date}):")
            for i, trans in enumerate(before_opening[:5]):
                print(f"  {trans['transaction_date']}: {trans['amount']} - {trans['category']} - {trans['destinataire']}")
            if len(before_opening) > 5:
                print(f"  ... and {len(before_opening) - 5} more")
        
        return True  # Has issue
    else:
        print("✅ Balance matches expected calculation")
        return False  # No issue

def diagnose_all_accounts():
    """Diagnose balance calculation issues for all accounts."""
    
    print("=== All Accounts Balance Diagnostic ===")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Database path: {os.getenv('DATABASE_PATH', 'Not set')}")
    
    try:
        # Initialize database
        db = FinanceDatabase()
        print("✅ Database connection successful")
        
        # Get all accounts
        accounts = db.get_accounts()
        print(f"\nAnalyzing {len(accounts)} accounts...")
        
        # Analyze each account
        accounts_with_issues = []
        
        for account in accounts:
            has_issue = analyze_account_balance(account, db)
            if has_issue:
                accounts_with_issues.append(account['id'])
        
        # Summary
        print("\n" + "="*60)
        print("SUMMARY:")
        print(f"Total accounts analyzed: {len(accounts)}")
        print(f"Accounts with balance issues: {len(accounts_with_issues)}")
        
        if accounts_with_issues:
            print(f"Problem accounts (IDs): {accounts_with_issues}")
            print("\nRecommended actions:")
            print("1. Check that opening dates are set correctly for these accounts")
            print("2. Run balance recalculation: db.recalculate_all_balances()")
            print("3. Verify transactions before opening dates are marked as historical")
        else:
            print("✅ All accounts have correct balances!")
        
        # Run balance recalculation
        print("\n" + "="*60)
        print("Running balance recalculation...")
        result = db.recalculate_all_balances()
        print(f"Recalculation result: {result}")
        
        # Check balances after recalculation
        print("\nBalances after recalculation:")
        for account_id in accounts_with_issues[:3]:  # Show first 3 problem accounts
            fresh_account = db.get_account(account_id)
            print(f"Account {account_id} ({fresh_account['name']}): {fresh_account['balance']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    diagnose_all_accounts()