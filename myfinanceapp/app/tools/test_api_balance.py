#!/usr/bin/env python3
"""
Test script to check API balance responses.
"""

import os
import sys

# Add the project root to Python path
sys.path.append('/app')

from database import FinanceDatabase

def test_api_balance():
    """Test API balance responses."""
    
    print("=== API Balance Test ===")
    
    try:
        # Initialize database
        db = FinanceDatabase()
        print("✅ Database connection successful")
        
        # Test the database methods directly
        print("\nTesting database methods:")
        
        # Get account using db.get_account()
        account_db = db.get_account(1)
        print(f"db.get_account(1) balance: {account_db['balance']}")
        
        # Get accounts using db.get_accounts()
        accounts_db = db.get_accounts()
        account_from_list = next((a for a in accounts_db if a['id'] == 1), None)
        print(f"db.get_accounts() balance: {account_from_list['balance'] if account_from_list else 'Not found'}")
        
        # Check if they match
        if account_from_list and abs(account_db['balance'] - account_from_list['balance']) < 0.01:
            print("✅ Database methods return consistent balances")
        else:
            print("❌ Database methods return different balances")
        
        # Check the raw database value
        conn = db._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT balance FROM accounts WHERE id = 1")
        raw_balance = cursor.fetchone()['balance']
        conn.close()
        
        print(f"Raw database balance: {raw_balance}")
        
        if abs(account_db['balance'] - raw_balance) < 0.01:
            print("✅ API and database are in sync")
        else:
            print("❌ API and database are out of sync")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_api_balance()