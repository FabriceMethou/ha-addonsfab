"""
Cloud Storage Integration for Backups
Supports multiple cloud providers
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Dict, Optional
import json


class CloudStorageAdapter(ABC):
    """Abstract base class for cloud storage providers."""

    @abstractmethod
    def upload(self, local_path: str, remote_path: str) -> bool:
        pass

    @abstractmethod
    def download(self, remote_path: str, local_path: str) -> bool:
        pass

    @abstractmethod
    def list_files(self, prefix: str = "") -> List[str]:
        pass

    @abstractmethod
    def delete(self, remote_path: str) -> bool:
        pass


class LocalCloudAdapter(CloudStorageAdapter):
    """
    Local filesystem adapter (for testing or network drives).
    Can be used for NAS, network shares, or external drives.
    """

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def upload(self, local_path: str, remote_path: str) -> bool:
        import shutil
        dest = self.base_path / remote_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, dest)
        return True

    def download(self, remote_path: str, local_path: str) -> bool:
        import shutil
        source = self.base_path / remote_path
        if source.exists():
            shutil.copy2(source, local_path)
            return True
        return False

    def list_files(self, prefix: str = "") -> List[str]:
        search_path = self.base_path / prefix
        if search_path.is_dir():
            return [str(f.relative_to(self.base_path)) for f in search_path.rglob("*") if f.is_file()]
        return []

    def delete(self, remote_path: str) -> bool:
        target = self.base_path / remote_path
        if target.exists():
            target.unlink()
            return True
        return False


class WebDAVAdapter(CloudStorageAdapter):
    """
    WebDAV adapter for Nextcloud, ownCloud, etc.
    Requires: pip install webdavclient3
    """

    def __init__(self, url: str, username: str, password: str, base_path: str = "/"):
        try:
            from webdav3.client import Client
        except ImportError:
            raise ImportError("Install webdavclient3: pip install webdavclient3")

        options = {
            'webdav_hostname': url,
            'webdav_login': username,
            'webdav_password': password,
            'webdav_root': base_path
        }
        self.client = Client(options)

    def upload(self, local_path: str, remote_path: str) -> bool:
        try:
            self.client.upload_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            print(f"Upload failed: {e}")
            return False

    def download(self, remote_path: str, local_path: str) -> bool:
        try:
            self.client.download_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            print(f"Download failed: {e}")
            return False

    def list_files(self, prefix: str = "") -> List[str]:
        try:
            return self.client.list(prefix)
        except Exception:
            return []

    def delete(self, remote_path: str) -> bool:
        try:
            self.client.clean(remote_path)
            return True
        except Exception:
            return False


class CloudBackupManager:
    """Manage cloud backup operations."""

    def __init__(self, adapter: CloudStorageAdapter, config_path: str = "data/cloud_config.json"):
        self.adapter = adapter
        self.config_path = Path(config_path)
        self.config = self._load_config()

    def _load_config(self) -> Dict:
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                return json.load(f)
        return {
            'sync_enabled': False,
            'auto_sync': False,
            'last_sync': None,
            'synced_backups': []
        }

    def _save_config(self):
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2, default=str)

    def sync_backup(self, backup_path: str) -> bool:
        """Upload a backup to cloud storage."""
        local_path = Path(backup_path)
        if not local_path.exists():
            return False

        remote_path = f"finance_backups/{local_path.name}"
        success = self.adapter.upload(str(local_path), remote_path)

        if success:
            from datetime import datetime
            now = datetime.now().isoformat()
            self.config['synced_backups'].append({
                'local': str(local_path),
                'remote': remote_path,
                'synced_at': now
            })
            self.config['last_sync'] = now
            self._save_config()

        return success

    def list_cloud_backups(self) -> List[str]:
        """List all backups in cloud storage."""
        return self.adapter.list_files("finance_backups/")

    def download_backup(self, remote_name: str, local_path: str) -> bool:
        """Download a backup from cloud storage."""
        remote_path = f"finance_backups/{remote_name}"
        return self.adapter.download(remote_path, local_path)

    def sync_all_backups(self, local_backup_dir: str) -> Dict:
        """Sync all local backups to cloud."""
        backup_dir = Path(local_backup_dir)
        results = {'uploaded': 0, 'failed': 0, 'skipped': 0}

        for backup_file in backup_dir.glob("*.db*"):
            # Check if already synced
            already_synced = any(
                s['local'] == str(backup_file)
                for s in self.config['synced_backups']
            )

            if already_synced:
                results['skipped'] += 1
                continue

            if self.sync_backup(str(backup_file)):
                results['uploaded'] += 1
            else:
                results['failed'] += 1

        return results