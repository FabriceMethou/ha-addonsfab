#!/usr/bin/env python3
"""
Standalone backup script for cron/scheduled tasks
Run with: python scripts/auto_backup.py
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backup_manager import BackupManager


def main():
    backup_mgr = BackupManager()

    if backup_mgr.should_auto_backup():
        result = backup_mgr.create_backup('auto', 'Scheduled automatic backup')
        if result:
            print(f"✅ Backup created: {result['filename']}")
            print(f"   Size: {result['size_bytes'] / 1024:.2f} KB")
            print(f"   Transactions: {result['stats'].get('transactions', 0)}")
        else:
            print("❌ Backup failed")
            sys.exit(1)
    else:
        print("ℹ️ Auto backup not needed yet")


if __name__ == "__main__":
    main()