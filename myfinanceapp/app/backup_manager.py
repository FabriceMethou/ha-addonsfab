"""
Backup Manager Module
Handles automated backups, versioning, and restoration
"""
import shutil
import gzip
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import sqlite3
import hashlib
import os
import logging

logger = logging.getLogger(__name__)


class BackupManager:
    """Manage database backups with versioning."""

    def __init__(self, db_path: str = "data/finance.db",
                 backup_dir: str = "data/backups"):
        self.db_path = Path(db_path)
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.backup_dir / "backup_metadata.json"
        self.metadata = self._load_metadata()
        self.cloud_manager = None
        self._init_cloud()

    def _load_metadata(self) -> Dict:
        """Load backup metadata."""
        if self.metadata_file.exists():
            with open(self.metadata_file, 'r') as f:
                return json.load(f)
        return {
            'backups': [],
            'settings': {
                'auto_backup_enabled': True,
                'retention_days': 30,
                'max_backups': 50,
                'compress_backups': True,
                'last_auto_backup': None
            }
        }

    def _save_metadata(self):
        """Save backup metadata."""
        with open(self.metadata_file, 'w') as f:
            json.dump(self.metadata, f, indent=2, default=str)

    def _init_cloud(self):
        """Lazy-initialize cloud backup manager on first use.

        Avoid heavy imports and network connections during startup — they block
        the event loop and can cause proxy timeouts on low-powered HA devices.
        """
        # Defer actual initialization to _get_cloud_manager()
        self.cloud_manager = None

    def _get_cloud_manager(self):
        """Return the cloud backup manager, initializing on first call."""
        if self.cloud_manager is not None:
            return self.cloud_manager

        try:
            from database import FinanceDatabase
            from cloud_backup import WebDAVAdapter, CloudBackupManager

            db = FinanceDatabase(db_path=str(self.db_path))

            webdav_url = db.get_preference('cloud_webdav_url', '')
            username = db.get_preference('cloud_webdav_username', '')
            remote_path = db.get_preference('cloud_webdav_path', '/backups/')
            enabled = db.get_preference('cloud_enabled', 'false') == 'true'
            password = os.getenv('WEBDAV_PASSWORD', '')

            if enabled and webdav_url and password:
                adapter = WebDAVAdapter(webdav_url, username, password, remote_path)
                self.cloud_manager = CloudBackupManager(adapter)
                logger.info("Cloud backup manager initialized")
            else:
                self.cloud_manager = None
        except ImportError:
            logger.warning("WebDAV client not installed. Cloud backup disabled.")
            self.cloud_manager = None
        except Exception as e:
            logger.warning(f"Failed to initialize cloud backup: {e}")
            self.cloud_manager = None

        return self.cloud_manager

    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA256 checksum of file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _get_db_stats(self) -> Dict:
        """Get database statistics."""
        if not self.db_path.exists():
            return {}

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        stats = {}
        tables = ['transactions', 'accounts', 'envelopes', 'debts']

        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cursor.fetchone()[0]
            except Exception:
                stats[table] = 0

        conn.close()
        stats['file_size'] = self.db_path.stat().st_size
        return stats

    def create_backup(self, backup_type: str = "manual",
                      description: str = "",
                      auto_sync: bool = False) -> Optional[Dict]:
        """
        Create a backup of the database.
        backup_type: 'manual', 'auto', 'pre_restore', 'pre_import'
        """
        if not self.db_path.exists():
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"finance_backup_{timestamp}_{backup_type}"

        if self.metadata['settings']['compress_backups']:
            backup_file = self.backup_dir / f"{backup_name}.db.gz"
            # Compress backup
            with open(self.db_path, 'rb') as f_in:
                with gzip.open(backup_file, 'wb', compresslevel=1) as f_out:
                    shutil.copyfileobj(f_in, f_out)
        else:
            backup_file = self.backup_dir / f"{backup_name}.db"
            shutil.copy2(self.db_path, backup_file)

        # Calculate checksum of original database
        original_checksum = self._calculate_checksum(self.db_path)

        # Get database stats
        db_stats = self._get_db_stats()

        # Create backup record
        backup_record = {
            'id': max((b['id'] for b in self.metadata['backups']), default=0) + 1,
            'filename': backup_file.name,
            'path': str(backup_file),
            'timestamp': datetime.now().isoformat(),
            'type': backup_type,
            'description': description,
            'size_bytes': backup_file.stat().st_size,
            'original_size': db_stats.get('file_size', 0),
            'checksum': original_checksum,
            'compressed': self.metadata['settings']['compress_backups'],
            'stats': db_stats
        }

        self.metadata['backups'].append(backup_record)

        if backup_type == 'auto':
            self.metadata['settings']['last_auto_backup'] = datetime.now().isoformat()

        self._save_metadata()
        self._cleanup_old_backups()

        if auto_sync and self._get_cloud_manager():
            try:
                self.cloud_manager.sync_backup(str(backup_file))
            except Exception as e:
                logger.warning(f"Cloud sync failed: {e}")

        return backup_record

    def restore_backup(self, backup_id: int) -> bool:
        """Restore database from a backup."""
        # Find backup
        backup = next(
            (b for b in self.metadata['backups'] if b['id'] == backup_id),
            None
        )

        if not backup:
            raise ValueError(f"Backup ID {backup_id} not found")

        backup_file = Path(backup['path'])
        if not backup_file.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_file}")

        # Create pre-restore backup
        self.create_backup('pre_restore', f"Before restoring backup #{backup_id}")

        # Restore
        if backup['compressed']:
            with gzip.open(backup_file, 'rb') as f_in:
                with open(self.db_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
        else:
            shutil.copy2(backup_file, self.db_path)

        # Verify checksum
        restored_checksum = self._calculate_checksum(self.db_path)
        if restored_checksum != backup['checksum']:
            raise ValueError("Checksum mismatch after restore!")

        return True

    def list_backups(self, limit: int = 20) -> List[Dict]:
        """Get list of available backups."""
        backups = sorted(
            self.metadata['backups'],
            key=lambda x: x['timestamp'],
            reverse=True
        )
        return backups[:limit]

    def delete_backup(self, backup_id: int) -> bool:
        """Delete a specific backup."""
        backup = next(
            (b for b in self.metadata['backups'] if b['id'] == backup_id),
            None
        )

        if not backup:
            return False

        # Delete file
        backup_file = Path(backup['path'])
        if backup_file.exists():
            backup_file.unlink()

        # Remove from metadata
        self.metadata['backups'] = [
            b for b in self.metadata['backups'] if b['id'] != backup_id
        ]
        self._save_metadata()

        return True

    def _cleanup_old_backups(self):
        """Remove old backups based on retention policy."""
        settings = self.metadata['settings']
        retention_days = settings['retention_days']
        max_backups = settings['max_backups']

        cutoff_date = datetime.now() - timedelta(days=retention_days)

        # Filter backups to keep
        backups_to_keep = []
        backups_to_delete = []

        for backup in self.metadata['backups']:
            backup_date = datetime.fromisoformat(backup['timestamp'])

            # Always keep manual and pre_restore backups longer
            if backup['type'] in ['manual', 'pre_restore']:
                backups_to_keep.append(backup)
            elif backup_date > cutoff_date:
                backups_to_keep.append(backup)
            else:
                backups_to_delete.append(backup)

        # Enforce max backup count (remove oldest auto backups first)
        if len(backups_to_keep) > max_backups:
            auto_backups = [b for b in backups_to_keep if b['type'] == 'auto']
            auto_backups.sort(key=lambda x: x['timestamp'])

            while len(backups_to_keep) > max_backups and auto_backups:
                oldest = auto_backups.pop(0)
                backups_to_keep.remove(oldest)
                backups_to_delete.append(oldest)

        # Delete files
        for backup in backups_to_delete:
            backup_file = Path(backup['path'])
            if backup_file.exists():
                backup_file.unlink()

        self.metadata['backups'] = backups_to_keep
        self._save_metadata()

    def should_auto_backup(self) -> bool:
        """Check if auto backup should run."""
        if not self.metadata['settings']['auto_backup_enabled']:
            return False

        last_backup = self.metadata['settings']['last_auto_backup']
        if not last_backup:
            return True

        last_backup_date = datetime.fromisoformat(last_backup)
        hours_since = (datetime.now() - last_backup_date).total_seconds() / 3600

        # Auto backup every 24 hours
        return hours_since >= 24

    def get_backup_statistics(self) -> Dict:
        """Get backup system statistics."""
        if not self.metadata['backups']:
            return {
                'total_backups': 0,
                'total_size': 0,
                'oldest_backup': None,
                'newest_backup': None
            }

        backups = self.metadata['backups']
        total_size = sum(b['size_bytes'] for b in backups)

        return {
            'total_backups': len(backups),
            'total_size': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'oldest_backup': min(b['timestamp'] for b in backups),
            'newest_backup': max(b['timestamp'] for b in backups),
            'by_type': {
                'manual': len([b for b in backups if b['type'] == 'manual']),
                'auto': len([b for b in backups if b['type'] == 'auto']),
                'pre_restore': len([b for b in backups if b['type'] == 'pre_restore'])
            }
        }

    def update_settings(self, auto_backup_enabled: bool = True,
                        retention_days: int = 30,
                        max_backups: int = 50,
                        compress_backups: bool = True):
        """Update backup settings."""
        self.metadata['settings'].update({
            'auto_backup_enabled': auto_backup_enabled,
            'retention_days': retention_days,
            'max_backups': max_backups,
            'compress_backups': compress_backups
        })
        self._save_metadata()

    def export_backup(self, backup_id: int, export_path: str) -> str:
        """Export a backup to external location."""
        backup = next(
            (b for b in self.metadata['backups'] if b['id'] == backup_id),
            None
        )

        if not backup:
            raise ValueError(f"Backup ID {backup_id} not found")

        source = Path(backup['path'])
        dest = Path(export_path) / source.name

        shutil.copy2(source, dest)
        return str(dest)

    def import_backup(self, file_path: str) -> Dict:
        """Import an external backup file."""
        source = Path(file_path)
        if not source.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Copy to backup directory
        dest = self.backup_dir / f"imported_{source.name}"
        shutil.copy2(source, dest)

        # Determine if compressed
        compressed = source.suffix == '.gz'

        # Calculate checksum
        if compressed:
            # Decompress temporarily to get checksum
            with gzip.open(dest, 'rb') as f_in:
                temp_path = self.backup_dir / "temp_verify.db"
                with open(temp_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
                checksum = self._calculate_checksum(temp_path)
                original_size = temp_path.stat().st_size
                temp_path.unlink()
        else:
            checksum = self._calculate_checksum(dest)
            original_size = dest.stat().st_size

        # Create backup record
        backup_record = {
            'id': max((b['id'] for b in self.metadata['backups']), default=0) + 1,
            'filename': dest.name,
            'path': str(dest),
            'timestamp': datetime.now().isoformat(),
            'type': 'imported',
            'description': f"Imported from {source.name}",
            'size_bytes': dest.stat().st_size,
            'original_size': original_size,
            'checksum': checksum,
            'compressed': compressed,
            'stats': {}
        }

        self.metadata['backups'].append(backup_record)
        self._save_metadata()

        return backup_record
    
    def compare_backups(self, backup_id_old: int, backup_id_new: int) -> Dict:
        """Compare statistics between two backups."""
        backup_old = next(
            (b for b in self.metadata['backups'] if b['id'] == backup_id_old),
            None
        )
        backup_new = next(
            (b for b in self.metadata['backups'] if b['id'] == backup_id_new),
            None
        )

        if not backup_old or not backup_new:
            raise ValueError("One or both backups not found")

        old_stats = backup_old.get('stats', {})
        new_stats = backup_new.get('stats', {})

        comparison = {
            'old_backup': backup_old,
            'new_backup': backup_new,
            'changes': {}
        }

        # Compare each stat
        all_keys = set(old_stats.keys()) | set(new_stats.keys())
        for key in all_keys:
            old_val = old_stats.get(key, 0)
            new_val = new_stats.get(key, 0)
            if old_val != new_val:
                comparison['changes'][key] = {
                    'old': old_val,
                    'new': new_val,
                    'diff': new_val - old_val
                }

        return comparison

    def get_backup_timeline(self) -> List[Dict]:
        """Get backup history as timeline with changes."""
        backups = sorted(
            self.metadata['backups'],
            key=lambda x: x['timestamp']
        )

        timeline = []
        prev_stats = {}

        for backup in backups:
            current_stats = backup.get('stats', {})

            changes = {}
            for key in ['transactions', 'accounts', 'envelopes', 'debts']:
                old_val = prev_stats.get(key, 0)
                new_val = current_stats.get(key, 0)
                if old_val != new_val:
                    changes[key] = new_val - old_val

            timeline.append({
                'id': backup['id'],
                'timestamp': backup['timestamp'],
                'type': backup['type'],
                'changes': changes
            })

            prev_stats = current_stats

        return timeline