#!/usr/bin/env python3
"""
Migration script to create mirror transactions for existing single-entry transfers.

Existing transfers only have one transaction row (source account, negative amount).
The destination account balance was updated directly without a transaction record.

This script creates the matching destination-side transaction for each existing transfer,
linking both sides via linked_transfer_id. It does NOT modify account balances since
those are already correct from the old single-entry system.

Usage:
    python3 scripts/migrate_transfers_to_double_entry.py [--dry-run]

Options:
    --dry-run   Show what would be done without making changes
"""

import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def migrate(dry_run=False):
    db_path = os.getenv("DATABASE_PATH", "/home/fab/Documents/Development/myfinanceapp/data/finance.db")

    print(f"Connecting to database: {db_path}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Ensure linked_transfer_id column exists
        cursor.execute("PRAGMA table_info(transactions)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'linked_transfer_id' not in columns:
            print("Adding linked_transfer_id column...")
            if not dry_run:
                cursor.execute("ALTER TABLE transactions ADD COLUMN linked_transfer_id INTEGER REFERENCES transactions(id)")
                conn.commit()
            print("  Column added.")

        # Find all existing transfers that don't have a mirror yet
        cursor.execute("""
            SELECT t.id, t.account_id, t.transaction_date, t.due_date, t.amount,
                   t.currency, t.description, t.destinataire, t.type_id, t.subtype_id,
                   t.tags, t.transfer_account_id, t.transfer_amount,
                   t.recurring_template_id, t.confirmed, t.is_historical,
                   a_src.name as source_account_name,
                   a_dst.name as dest_account_name,
                   a_dst.currency as dest_currency
            FROM transactions t
            JOIN accounts a_src ON t.account_id = a_src.id
            JOIN accounts a_dst ON t.transfer_account_id = a_dst.id
            WHERE t.is_transfer = 1
              AND t.transfer_account_id IS NOT NULL
              AND (t.linked_transfer_id IS NULL)
              AND t.amount < 0
            ORDER BY t.transaction_date ASC
        """)

        transfers = cursor.fetchall()
        print(f"Found {len(transfers)} existing transfer(s) without mirror transactions.")
        print()

        if len(transfers) == 0:
            print("Nothing to migrate!")
            return

        created_count = 0
        skipped_count = 0

        for transfer in transfers:
            transfer_id = transfer['id']
            source_account_id = transfer['account_id']
            dest_account_id = transfer['transfer_account_id']
            source_amount = transfer['amount']
            transfer_amount = transfer['transfer_amount']
            source_name = transfer['source_account_name']
            dest_name = transfer['dest_account_name']
            dest_currency = transfer['dest_currency']

            # Determine destination amount
            if transfer_amount is not None:
                dest_amount = abs(transfer_amount)
            else:
                dest_amount = abs(source_amount)

            # Check if a mirror-like transaction already exists
            # (someone may have manually created one)
            cursor.execute("""
                SELECT id FROM transactions
                WHERE account_id = ?
                  AND transfer_account_id = ?
                  AND transaction_date = ?
                  AND amount > 0
                  AND is_transfer = 1
                  AND linked_transfer_id IS NULL
            """, (dest_account_id, source_account_id, transfer['transaction_date']))

            existing_mirror = cursor.fetchone()
            if existing_mirror:
                # Link the existing pair
                mirror_id = existing_mirror['id']
                print(f"  Transfer #{transfer_id}: Found existing mirror #{mirror_id}, linking them.")
                if not dry_run:
                    cursor.execute("UPDATE transactions SET linked_transfer_id = ? WHERE id = ?", (mirror_id, transfer_id))
                    cursor.execute("UPDATE transactions SET linked_transfer_id = ? WHERE id = ?", (transfer_id, mirror_id))
                skipped_count += 1
                continue

            print(f"  Transfer #{transfer_id}: {source_name} -> {dest_name}")
            print(f"    Date: {transfer['transaction_date']}, Source: {source_amount} {transfer['currency']}, Dest: +{dest_amount} {dest_currency}")
            print(f"    Description: {transfer['description'] or '(none)'}")

            if not dry_run:
                # Create mirror transaction (positive amount in destination account)
                cursor.execute("""
                    INSERT INTO transactions
                    (account_id, transaction_date, due_date, amount, currency, description,
                     destinataire, type_id, subtype_id, tags, transfer_account_id,
                     is_transfer, linked_transfer_id, is_duplicate_flag, recurring_template_id,
                     confirmed, is_historical, transfer_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    dest_account_id,
                    transfer['transaction_date'],
                    transfer['due_date'],
                    dest_amount,  # Positive: money arriving
                    dest_currency,
                    transfer['description'] or '',
                    source_name,  # Destinataire = source account name
                    transfer['type_id'],
                    transfer['subtype_id'],
                    transfer['tags'] or '',
                    source_account_id,  # Points back to source account
                    1,  # is_transfer
                    transfer_id,  # Link to source transaction
                    0,  # is_duplicate_flag
                    transfer['recurring_template_id'],
                    transfer['confirmed'],
                    transfer['is_historical'],
                    abs(source_amount) if transfer_amount is not None else None
                ))

                mirror_id = cursor.lastrowid

                # Link source transaction to mirror
                cursor.execute("UPDATE transactions SET linked_transfer_id = ? WHERE id = ?",
                               (mirror_id, transfer_id))

                print(f"    Created mirror #{mirror_id}")

            created_count += 1

        if not dry_run:
            conn.commit()

        print()
        print(f"Migration {'would create' if dry_run else 'created'} {created_count} mirror transaction(s).")
        if skipped_count:
            print(f"Linked {skipped_count} existing pair(s).")
        print()

        if dry_run:
            print("This was a dry run. Run without --dry-run to apply changes.")
        else:
            print("Migration completed successfully!")
            print()
            print("IMPORTANT: Account balances were NOT modified since they were already")
            print("correct from the old single-entry system. If you see balance issues,")
            print("use the 'Recalculate Balances' feature or run:")
            print("  python3 scripts/recalculate_balances.py")

    except Exception as e:
        print(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    migrate(dry_run=dry_run)
