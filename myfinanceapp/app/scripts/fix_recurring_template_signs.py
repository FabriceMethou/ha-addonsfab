#!/usr/bin/env python3
"""
Fix recurring template amount signs.

This script corrects the amount signs for existing recurring templates
that were created with positive amounts for expenses (should be negative).

The bug: When creating recurring templates, the amount was stored as-is
(always positive from the frontend) instead of applying the correct sign
based on the transaction category (expense = negative, income = positive).

Usage:
    python3 scripts/fix_recurring_template_signs.py [--dry-run]

Options:
    --dry-run    Show what would be changed without making changes
"""

import sqlite3
import sys
import os

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# Get database path
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)


def get_connection():
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def fix_recurring_templates(dry_run: bool = False):
    """Fix amount signs for recurring templates based on their category."""
    conn = get_connection()
    cursor = conn.cursor()

    # Get all recurring templates with their category
    cursor.execute("""
        SELECT
            rt.id,
            rt.name,
            rt.amount,
            rt.type_id,
            tt.name as type_name,
            tt.category
        FROM recurring_templates rt
        JOIN transaction_types tt ON rt.type_id = tt.id
        ORDER BY rt.id
    """)

    templates = cursor.fetchall()

    templates_to_fix = []
    for t in templates:
        current_amount = t['amount']
        category = t['category']

        # Determine what the correct sign should be
        if category == 'expense':
            correct_amount = -abs(current_amount)
        elif category == 'income':
            correct_amount = abs(current_amount)
        elif category == 'transfer':
            correct_amount = -abs(current_amount)
        else:
            correct_amount = current_amount

        # Check if sign needs to be fixed
        if current_amount != correct_amount:
            templates_to_fix.append({
                'id': t['id'],
                'name': t['name'],
                'current_amount': current_amount,
                'correct_amount': correct_amount,
                'type_name': t['type_name'],
                'category': category
            })

    if not templates_to_fix:
        print("No recurring templates need fixing.")
        conn.close()
        return 0

    print(f"\nFound {len(templates_to_fix)} recurring template(s) with incorrect amount signs:\n")
    print("-" * 80)

    for t in templates_to_fix:
        print(f"ID: {t['id']}")
        print(f"  Name: {t['name']}")
        print(f"  Type: {t['type_name']} ({t['category']})")
        print(f"  Current amount: {t['current_amount']}")
        print(f"  Correct amount: {t['correct_amount']}")
        print()

    if dry_run:
        print("-" * 80)
        print("DRY RUN - No changes made. Run without --dry-run to apply fixes.")
        conn.close()
        return len(templates_to_fix)

    # Apply fixes
    print("-" * 80)
    print("Applying fixes...")

    for t in templates_to_fix:
        cursor.execute(
            "UPDATE recurring_templates SET amount = ? WHERE id = ?",
            (t['correct_amount'], t['id'])
        )
        print(f"  Fixed template {t['id']}: {t['current_amount']} -> {t['correct_amount']}")

    conn.commit()
    print(f"\nFixed {len(templates_to_fix)} recurring template(s).")

    conn.close()
    return len(templates_to_fix)


def fix_pending_transactions(dry_run: bool = False):
    """Fix amount signs for pending transactions based on their category."""
    conn = get_connection()
    cursor = conn.cursor()

    # Get all pending transactions with their category
    cursor.execute("""
        SELECT
            pt.id,
            pt.amount,
            pt.destinataire,
            pt.transaction_date,
            pt.type_id,
            tt.name as type_name,
            tt.category
        FROM pending_transactions pt
        JOIN transaction_types tt ON pt.type_id = tt.id
        ORDER BY pt.id
    """)

    pending = cursor.fetchall()

    pending_to_fix = []
    for p in pending:
        current_amount = p['amount']
        category = p['category']

        # Determine what the correct sign should be
        if category == 'expense':
            correct_amount = -abs(current_amount)
        elif category == 'income':
            correct_amount = abs(current_amount)
        elif category == 'transfer':
            correct_amount = -abs(current_amount)
        else:
            correct_amount = current_amount

        # Check if sign needs to be fixed
        if current_amount != correct_amount:
            pending_to_fix.append({
                'id': p['id'],
                'destinataire': p['destinataire'],
                'transaction_date': p['transaction_date'],
                'current_amount': current_amount,
                'correct_amount': correct_amount,
                'type_name': p['type_name'],
                'category': category
            })

    if not pending_to_fix:
        print("No pending transactions need fixing.")
        conn.close()
        return 0

    print(f"\nFound {len(pending_to_fix)} pending transaction(s) with incorrect amount signs:\n")
    print("-" * 80)

    for p in pending_to_fix:
        print(f"ID: {p['id']}")
        print(f"  Recipient: {p['destinataire']}")
        print(f"  Date: {p['transaction_date']}")
        print(f"  Type: {p['type_name']} ({p['category']})")
        print(f"  Current amount: {p['current_amount']}")
        print(f"  Correct amount: {p['correct_amount']}")
        print()

    if dry_run:
        print("-" * 80)
        print("DRY RUN - No changes made. Run without --dry-run to apply fixes.")
        conn.close()
        return len(pending_to_fix)

    # Apply fixes
    print("-" * 80)
    print("Applying fixes...")

    for p in pending_to_fix:
        cursor.execute(
            "UPDATE pending_transactions SET amount = ? WHERE id = ?",
            (p['correct_amount'], p['id'])
        )
        print(f"  Fixed pending transaction {p['id']}: {p['current_amount']} -> {p['correct_amount']}")

    conn.commit()
    print(f"\nFixed {len(pending_to_fix)} pending transaction(s).")

    conn.close()
    return len(pending_to_fix)


def main():
    dry_run = '--dry-run' in sys.argv

    print("=" * 80)
    print("Recurring Template Amount Sign Fix Script")
    print("=" * 80)
    print(f"\nDatabase: {DB_PATH}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print()

    # Fix recurring templates
    print("=" * 80)
    print("RECURRING TEMPLATES")
    print("=" * 80)
    templates_fixed = fix_recurring_templates(dry_run)

    # Fix pending transactions
    print("\n" + "=" * 80)
    print("PENDING TRANSACTIONS")
    print("=" * 80)
    pending_fixed = fix_pending_transactions(dry_run)

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Recurring templates {'would be' if dry_run else ''} fixed: {templates_fixed}")
    print(f"Pending transactions {'would be' if dry_run else ''} fixed: {pending_fixed}")

    if dry_run and (templates_fixed > 0 or pending_fixed > 0):
        print("\nRun without --dry-run to apply these fixes.")


if __name__ == "__main__":
    main()
