#!/usr/bin/env python3
"""
Check existing users in the database
"""
import sys
from pathlib import Path
import sqlite3

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def main():
    db_path = "data/finance.db"

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if users table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            print("❌ Users table doesn't exist yet")
            conn.close()
            return

        # Check table structure
        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        print(f"📋 Users table columns: {', '.join(columns)}")
        print()

        # Get all users
        cursor.execute("""
            SELECT id, username, email, role, is_active,
                   COALESCE(requires_password_change, 0) as requires_password_change
            FROM users
        """)
        users = cursor.fetchall()

        if not users:
            print("ℹ️  No users found in database")
        else:
            print(f"👥 Found {len(users)} user(s):\n")
            for user in users:
                print(f"  ID: {user['id']}")
                print(f"  Username: {user['username']}")
                print(f"  Email: {user['email']}")
                print(f"  Role: {user['role']}")
                print(f"  Active: {user['is_active']}")
                print(f"  Requires Password Change: {user['requires_password_change']}")
                print()

        conn.close()

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
