"""
Currencies API endpoints
Manage currencies and exchange rates
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

class CurrencyCreate(BaseModel):
    code: str  # e.g., "USD", "GBP"
    name: str  # e.g., "US Dollar"
    symbol: Optional[str] = ""  # e.g., "$"
    exchange_rate_to_eur: float = 1.0  # Exchange rate against EUR

class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    exchange_rate_to_eur: Optional[float] = None
    is_active: Optional[bool] = None

@router.get("/")
async def get_currencies(active_only: bool = True, current_user: User = Depends(get_current_user)):
    """Get all currencies"""
    currencies = db.get_currencies(active_only=active_only)
    return {"currencies": currencies}

@router.get("/{code}")
async def get_currency(code: str, current_user: User = Depends(get_current_user)):
    """Get a specific currency by code"""
    currency = db.get_currency(code.upper())
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    return currency

@router.post("/")
async def create_currency(currency: CurrencyCreate, current_user: User = Depends(get_current_user)):
    """Create new currency"""
    currency_data = {
        'code': currency.code.upper(),
        'name': currency.name,
        'symbol': currency.symbol,
        'exchange_rate_to_eur': currency.exchange_rate_to_eur,
        'is_active': 1
    }

    try:
        currency_id = db.add_currency(currency_data)
        return {"message": "Currency created", "currency_id": currency_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{code}")
async def update_currency(code: str, currency: CurrencyUpdate, current_user: User = Depends(get_current_user)):
    """Update currency"""
    # Convert is_active boolean to integer for database
    update_data = currency.dict(exclude_unset=True)
    if 'is_active' in update_data:
        update_data['is_active'] = 1 if update_data['is_active'] else 0

    success = db.update_currency(code.upper(), **update_data)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update currency")
    return {"message": "Currency updated"}

@router.delete("/{code}")
async def delete_currency(code: str, current_user: User = Depends(get_current_user)):
    """Delete currency (soft delete)"""
    # Check if currency is being used by any accounts
    accounts = db.get_accounts()
    if any(acc['currency'] == code.upper() for acc in accounts):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete currency that is in use by accounts. Please change account currencies first."
        )

    success = db.delete_currency(code.upper())
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete currency")
    return {"message": "Currency deleted"}

@router.get("/account-types/list")
async def get_account_types(current_user: User = Depends(get_current_user)):
    """Get list of valid account types"""
    account_types = db.get_account_types()
    return {"account_types": account_types}
