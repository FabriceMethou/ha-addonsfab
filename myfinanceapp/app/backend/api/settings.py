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
DB_PATH = os.getenv("DATABASE_PATH", "/home/fab/Documents/Development/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

class SettingUpdate(BaseModel):
    value: Any

@router.get("/")
async def get_all_settings(current_user: User = Depends(get_current_user)):
    """Get all user settings - currently returns common settings"""
    # Return common settings with their current values
    display_currency = db.get_preference('display_currency', 'EUR')

    # Debug settings
    debug_mode = db.get_preference('debug_mode', 'false')
    debug_auto_recalculate = db.get_preference('debug_auto_recalculate', 'false')
    debug_show_logs = db.get_preference('debug_show_logs', 'false')
    debug_log_api_calls = db.get_preference('debug_log_api_calls', 'false')
    debug_log_transactions = db.get_preference('debug_log_transactions', 'false')

    return {
        "settings": {
            "display_currency": display_currency,
            "debug_mode": debug_mode == 'true',
            "debug_auto_recalculate": debug_auto_recalculate == 'true',
            "debug_show_logs": debug_show_logs == 'true',
            "debug_log_api_calls": debug_log_api_calls == 'true',
            "debug_log_transactions": debug_log_transactions == 'true',
        }
    }

@router.get("/{key}")
async def get_setting(key: str, current_user: User = Depends(get_current_user)):
    """Get specific setting"""
    value = db.get_preference(key, "")
    return {"key": key, "value": value}

@router.put("/{key}")
async def update_setting(key: str, setting: SettingUpdate, current_user: User = Depends(get_current_user)):
    """Update setting"""
    try:
        # Convert value to string for storage (lowercase for booleans)
        if isinstance(setting.value, bool):
            value_str = str(setting.value).lower()
        else:
            value_str = str(setting.value) if setting.value is not None else ""
        db.set_preference(key, value_str)
        return {"message": "Setting updated", "key": key, "value": setting.value}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update setting: {str(e)}")
