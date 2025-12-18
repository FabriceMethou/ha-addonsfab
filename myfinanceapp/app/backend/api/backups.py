"""
Backups API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backup_manager import BackupManager
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/finance.db")
backup_mgr = BackupManager(db_path=DB_PATH)

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
    """Restore from backup"""
    success = backup_mgr.restore_backup(backup_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to restore backup")
    return {"message": "Backup restored successfully"}

@router.delete("/{backup_id}")
async def delete_backup(backup_id: str, current_user: User = Depends(get_current_user)):
    """Delete backup"""
    success = backup_mgr.delete_backup(backup_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete backup")
    return {"message": "Backup deleted"}

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
