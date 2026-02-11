#!/usr/bin/env python3
"""
Setup script to create the initial admin user for Finance Tracker.
Run this script once after deploying the application.
"""

import sys
import os
import getpass

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import AuthManager


def main():
    print("=" * 50)
    print("Finance Tracker - Admin User Setup")
    print("=" * 50)
    print()

    auth_manager = AuthManager()

    # Check if any users exist
    existing_users = auth_manager.list_users()
    if existing_users:
        print(f"Found {len(existing_users)} existing user(s):")
        for user in existing_users:
            print(f"  - {user['username']} ({user['email']}) - {user['role']}")
        print()

        response = input("Do you want to create another admin user? (y/N): ").strip().lower()
        if response != 'y':
            print("Setup cancelled.")
            return

    # Get admin user details
    print("Enter details for the new admin user:")
    print()

    while True:
        username = input("Username (min 3 chars): ").strip()
        if len(username) >= 3:
            break
        print("Username must be at least 3 characters long.")

    while True:
        email = input("Email: ").strip()
        if '@' in email and '.' in email:
            break
        print("Please enter a valid email address.")

    while True:
        password = getpass.getpass("Password (min 8 chars): ")
        if len(password) >= 8:
            confirm = getpass.getpass("Confirm password: ")
            if password == confirm:
                break
            print("Passwords do not match. Try again.")
        else:
            print("Password must be at least 8 characters long.")

    print()
    print("Creating admin user...")

    success, message = auth_manager.create_user(
        username=username,
        email=email,
        password=password,
        role='admin'
    )

    if success:
        print("SUCCESS:", message)
        print()
        print("You can now log in to Finance Tracker with these credentials.")
        print("Visit the application and use the login page to access your account.")
    else:
        print("ERROR:", message)
        sys.exit(1)


if __name__ == "__main__":
    main()
