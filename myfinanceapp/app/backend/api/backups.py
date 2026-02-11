"""
Backups API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import sys, os
import tempfile
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backup_manager import BackupManager
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
backup_mgr = BackupManager(db_path=DB_PATH)

from database import FinanceDatabase
db = FinanceDatabase(db_path=DB_PATH)

class BackupCreate(BaseModel):
    backup_type: str = "manual"
    description: str = "Manual backup"

@router.get("/")
async def list_backups(current_user: User = Depends(get_current_user)):
    """List all backups"""
    backups = backup_mgr.list_backups()
    return {"backups": backups}

@router.post("/")
async def create_backup(backup: BackupCreate, current_user: User = Depends(get_current_user)):
    """Create new backup"""
    result = backup_mgr.create_backup(backup.backup_type, backup.description)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create backup - database file may not exist")
    return {"message": "Backup created", "backup": result}

@router.post("/{backup_id}/restore")
async def restore_backup(backup_id: str, current_user: User = Depends(get_current_user)):
    """Restore from backup (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can restore backups")
    # Convert backup_id to int
    try:
        backup_id_int = int(backup_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backup ID")

    try:
        success = backup_mgr.restore_backup(backup_id_int)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to restore backup")
        return {"message": "Backup restored successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error restoring backup: {str(e)}")

@router.delete("/{backup_id}")
async def delete_backup(backup_id: str, current_user: User = Depends(get_current_user)):
    """Delete backup (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can delete backups")
    # Convert backup_id to int
    try:
        backup_id_int = int(backup_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backup ID")

    success = backup_mgr.delete_backup(backup_id_int)
    if not success:
        raise HTTPException(status_code=404, detail="Backup not found or failed to delete")
    return {"message": "Backup deleted"}

@router.get("/{backup_id}/download")
async def download_backup(backup_id: str, current_user: User = Depends(get_current_user)):
    """Download backup file"""
    # Convert backup_id to int
    try:
        backup_id_int = int(backup_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backup ID")

    # Find backup
    backup = next(
        (b for b in backup_mgr.metadata['backups'] if b['id'] == backup_id_int),
        None
    )

    if not backup:
        raise HTTPException(status_code=404, detail=f"Backup ID {backup_id} not found")

    backup_file = Path(backup['path'])

    # Prevent directory traversal attacks
    backup_dir = Path(backup_mgr.backup_dir).resolve()
    if not backup_file.resolve().is_relative_to(backup_dir):
        raise HTTPException(status_code=400, detail="Invalid backup path")

    if not backup_file.exists():
        raise HTTPException(status_code=404, detail="Backup file not found on disk")

    # Return file for download
    return FileResponse(
        path=str(backup_file),
        filename=backup_file.name,
        media_type='application/octet-stream'
    )

@router.post("/upload")
async def upload_backup(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload and import a backup file (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can upload backups")
    # Validate file extension
    if not (file.filename.endswith('.db') or file.filename.endswith('.db.gz')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only .db or .db.gz files are allowed"
        )

    # Save uploaded file to temporary location
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
        temp_path = temp_file.name
        contents = await file.read()
        temp_file.write(contents)

    try:
        # Import the backup
        backup_record = backup_mgr.import_backup(temp_path)
        return {
            "message": "Backup uploaded and imported successfully",
            "backup": backup_record
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import backup: {str(e)}")
    finally:
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.unlink(temp_path)

@router.get("/settings")
async def get_backup_settings(current_user: User = Depends(get_current_user)):
    """Get backup automation settings"""
    return {
        "settings": backup_mgr.metadata['settings'],
        "statistics": backup_mgr.get_backup_statistics()
    }

class BackupSettingsUpdate(BaseModel):
    auto_backup_enabled: bool = True
    retention_days: int = 30
    max_backups: int = 50
    compress_backups: bool = True

@router.put("/settings")
async def update_backup_settings(
    settings: BackupSettingsUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update backup automation settings"""
    backup_mgr.update_settings(
        auto_backup_enabled=settings.auto_backup_enabled,
        retention_days=settings.retention_days,
        max_backups=settings.max_backups,
        compress_backups=settings.compress_backups
    )
    return {
        "message": "Settings updated successfully",
        "settings": backup_mgr.metadata['settings']
    }

@router.post("/cleanup")
async def cleanup_old_backups(current_user: User = Depends(get_current_user)):
    """Manually trigger cleanup of old backups based on retention policy"""
    backup_mgr._cleanup_old_backups()
    return {
        "message": "Cleanup completed",
        "statistics": backup_mgr.get_backup_statistics()
    }

# Cloud Backup Endpoints

class CloudConfig(BaseModel):
    webdav_url: str
    username: str = ""
    remote_path: str = "/backups/"
    enabled: bool = True

@router.get("/cloud/config")
async def get_cloud_config(current_user: User = Depends(get_current_user)):
    """Get WebDAV cloud backup configuration"""
    config = {
        'webdav_url': db.get_preference('cloud_webdav_url', ''),
        'username': db.get_preference('cloud_webdav_username', ''),
        'remote_path': db.get_preference('cloud_webdav_path', '/backups/'),
        'enabled': db.get_preference('cloud_enabled', 'false') == 'true',
    }

    return config

@router.put("/cloud/config")
async def update_cloud_config(config: CloudConfig, current_user: User = Depends(get_current_user)):
    """Save WebDAV config (url, username, path). Password via WEBDAV_PASSWORD env var"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can manage cloud backups")

    db.set_preference('cloud_webdav_url', config.webdav_url)
    db.set_preference('cloud_webdav_username', config.username)
    db.set_preference('cloud_webdav_path', config.remote_path)
    db.set_preference('cloud_enabled', 'true' if config.enabled else 'false')

    return {
        "message": "Cloud backup configuration updated",
        "config": {
            'webdav_url': config.webdav_url,
            'username': config.username,
            'remote_path': config.remote_path,
            'enabled': config.enabled,
        }
    }

@router.get("/cloud/backups")
async def list_cloud_backups(current_user: User = Depends(get_current_user)):
    """List remote backups on WebDAV server"""
    from cloud_backup import WebDAVAdapter, CloudBackupManager

    # Get cloud config
    webdav_url = db.get_preference('cloud_webdav_url', '')
    username = db.get_preference('cloud_webdav_username', '')
    remote_path = db.get_preference('cloud_webdav_path', '/backups/')
    enabled = db.get_preference('cloud_enabled', 'false') == 'true'
    password = os.getenv('WEBDAV_PASSWORD', '')

    if not enabled or not webdav_url:
        raise HTTPException(status_code=400, detail="Cloud backup not configured or not enabled")

    if not password:
        raise HTTPException(status_code=400, detail="WEBDAV_PASSWORD environment variable not set")

    try:
        adapter = WebDAVAdapter(webdav_url, username, password, remote_path)
        cloud_manager = CloudBackupManager(adapter)
        backups = cloud_manager.list_cloud_backups()

        return {
            "backups": backups,
            "remote_path": remote_path
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="WebDAV client not installed. Install with: pip install webdavclient3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list cloud backups: {str(e)}")

@router.post("/cloud/{backup_id}/sync")
async def sync_backup_to_cloud(backup_id: str, current_user: User = Depends(get_current_user)):
    """Upload a local backup to the cloud WebDAV server"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can manage cloud backups")

    from cloud_backup import WebDAVAdapter, CloudBackupManager

    # Convert backup_id to int
    try:
        backup_id_int = int(backup_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid backup ID")

    # Find backup
    backup = next(
        (b for b in backup_mgr.metadata['backups'] if b['id'] == backup_id_int),
        None
    )

    if not backup:
        raise HTTPException(status_code=404, detail=f"Backup ID {backup_id} not found")

    backup_file = Path(backup['path'])
    if not backup_file.exists():
        raise HTTPException(status_code=404, detail="Backup file not found on disk")

    # Get cloud config
    webdav_url = db.get_preference('cloud_webdav_url', '')
    username = db.get_preference('cloud_webdav_username', '')
    remote_path = db.get_preference('cloud_webdav_path', '/backups/')
    enabled = db.get_preference('cloud_enabled', 'false') == 'true'
    password = os.getenv('WEBDAV_PASSWORD', '')

    if not enabled or not webdav_url:
        raise HTTPException(status_code=400, detail="Cloud backup not configured or not enabled")

    if not password:
        raise HTTPException(status_code=400, detail="WEBDAV_PASSWORD environment variable not set")

    try:
        adapter = WebDAVAdapter(webdav_url, username, password, remote_path)
        cloud_manager = CloudBackupManager(adapter)
        success = cloud_manager.sync_backup(str(backup_file))

        if not success:
            raise HTTPException(status_code=500, detail="Failed to upload backup to cloud")

        return {
            "message": "Backup synced to cloud successfully",
            "backup_id": backup_id,
            "filename": backup_file.name
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="WebDAV client not installed. Install with: pip install webdavclient3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync backup to cloud: {str(e)}")
