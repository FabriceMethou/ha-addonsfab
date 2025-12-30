#!/usr/bin/env python3
"""
Diagnostic script specifically for the Checking account issue.
"""

import os
import sys
from datetime import datetime

# Add the project root to Python path
sys.path.append('/app')

from database import FinanceDatabase

def diagnose_checking_account():
    """Diagnose the specific Checking account issue."""
    
    print("=== Checking Account Diagnostic ===")
    
    try:
        # Initialize database
        db = FinanceDatabase()
        print("✅ Database connection successful")
        
        # Get the Checking account (ID: 1)
        account = db.get_account(1)
        if not account:
            print("❌ Checking account not found")
            return
            
        print(f"\nAccount: {account['name']} (ID: {account['id']})")
        print(f"Opening Date: {account.get('opening_date')}")
        print(f"Opening Balance: {account.get('opening_balance')}")
        print(f"Current Balance (from DB): {account['balance']}")
        print(f"Currency: {account.get('currency')}")
        
        # Get all transactions for this account
        transactions = db.get_transactions({'account_id': account['id']})
        print(f"\nTotal Transactions: {len(transactions)}")
        
        # Check transaction dates
        if transactions:
            earliest_date = min(t['transaction_date'] for t in transactions)
            latest_date = max(t['transaction_date'] for t in transactions)
            print(f"Earliest transaction: {earliest_date}")
            print(f"Latest transaction: {latest_date}")
        
        # Check opening date
        opening_date_str = account.get('opening_date')
        if opening_date_str:
            opening_date = datetime.fromisoformat(opening_date_str).date()
            current_date = datetime.now().date()
            
            print(f"\nOpening date: {opening_date}")
            print(f"Current date: {current_date}")
            print(f"Opening date is in future: {opening_date > current_date}")
            
            # Count transactions before and after opening date
            before_opening = [t for t in transactions if datetime.fromisoformat(t['transaction_date']).date() < opening_date]
            after_opening = [t for t in transactions if datetime.fromisoformat(t['transaction_date']).date() >= opening_date]
            
            print(f"Transactions before opening date: {len(before_opening)}")
            print(f"Transactions after opening date: {len(after_opening)}")
            
            # Check if transactions are marked as historical
            historical_before = [t for t in before_opening if t.get('is_historical', False)]
            historical_after = [t for t in after_opening if t.get('is_historical', False)]
            
            print(f"Historical transactions before opening: {len(historical_before)}")
            print(f"Historical transactions after opening: {len(historical_after)}")
        
        # Calculate what the balance should be based on opening date logic
        if opening_date_str:
            opening_date = datetime.fromisoformat(opening_date_str).date()
            opening_balance = account.get('opening_balance', 0)
            
            # Only include transactions on or after opening date
            relevant_transactions = [t for t in transactions 
                                   if datetime.fromisoformat(t['transaction_date']).date() >= opening_date 
                                   and not t.get('is_historical', False)]
            
            calculated_balance = opening_balance
            
            print(f"\nCalculating expected balance:")
            print(f"Starting with opening balance: {opening_balance}")
            
            for trans in relevant_transactions:
                if trans['category'] == 'income':
                    calculated_balance += trans['amount']
                    print(f"  + {trans['amount']} (income) = {calculated_balance}")
                elif trans['category'] == 'expense':
                    calculated_balance -= trans['amount']
                    print(f"  - {trans['amount']} (expense) = {calculated_balance}")
                elif trans['category'] == 'transfer' and trans['is_transfer']:
                    calculated_balance += trans['amount']  # Negative for transfers out
                    print(f"  {trans['amount']} (transfer) = {calculated_balance}")
            
            print(f"\nExpected balance: {calculated_balance}")
            print(f"Actual balance: {account['balance']}")
            print(f"Difference: {account['balance'] - calculated_balance}")
            
            if abs(account['balance'] - calculated_balance) > 0.01:
                print("❌ Balance mismatch!")
                
                # Check if the issue is that transactions after opening date are being included
                if after_opening:
                    print(f"\n⚠️  Found {len(after_opening)} transactions after opening date")
                    print("These should NOT affect the balance since opening date is in the future")
                    
                    # Show some of these transactions
                    print("Sample transactions after opening date:")
                    for i, trans in enumerate(after_opening[:5]):
                        print(f"  {trans['transaction_date']}: {trans['amount']} - {trans['category']} - {trans['destinataire']}")
                    if len(after_opening) > 5:
                        print(f"  ... and {len(after_opening) - 5} more")
        
        # Check if the balance field is being updated incorrectly
        print(f"\nChecking balance field updates...")
        
        # Get the raw balance from database
        conn = db._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT balance FROM accounts WHERE id = ?", (account['id'],))
        raw_balance = cursor.fetchone()['balance']
        conn.close()
        
        print(f"Raw balance from database: {raw_balance}")
        print(f"Balance from get_account(): {account['balance']}")
        
        if abs(raw_balance - account['balance']) > 0.01:
            print("❌ Balance mismatch between raw DB and API!")
        
        # Run recalculation and see what happens
        print(f"\nRunning balance recalculation...")
        result = db.recalculate_all_balances()
        print(f"Recalculation result: {result}")
        
        # Get fresh account data after recalculation
        fresh_account = db.get_account(account['id'])
        print(f"Balance after recalculation: {fresh_account['balance']}")
        
        if abs(fresh_account['balance'] - opening_balance) < 0.01:
            print("✅ Recalculation correctly set balance to opening balance")
        else:
            print("❌ Recalculation did not set balance to opening balance")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    diagnose_checking_account()