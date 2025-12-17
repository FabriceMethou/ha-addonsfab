"""
Settings API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/data/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

class SettingUpdate(BaseModel):
    value: Any

@router.get("/")
async def get_all_settings(current_user: User = Depends(get_current_user)):
    """Get all user settings"""
    settings = db.get_all_settings()
    return {"settings": settings}

@router.get("/{key}")
async def get_setting(key: str, current_user: User = Depends(get_current_user)):
    """Get specific setting"""
    value = db.get_setting(key)
    return {"key": key, "value": value}

@router.put("/{key}")
async def update_setting(key: str, setting: SettingUpdate, current_user: User = Depends(get_current_user)):
    """Update setting"""
    success = db.set_setting(key, setting.value)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update setting")
    return {"message": "Setting updated", "key": key, "value": setting.value}
