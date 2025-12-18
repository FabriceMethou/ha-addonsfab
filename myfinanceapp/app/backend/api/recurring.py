"""
Recurring Transactions API endpoints
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

class RecurringCreate(BaseModel):
    name: str
    account_id: int
    amount: float
    currency: str = 'EUR'
    description: str
    destinataire: str
    type_id: int
    subtype_id: int
    recurrence_pattern: str  # daily, weekly, monthly, yearly
    recurrence_interval: int = 1
    day_of_month: Optional[int] = None
    start_date: str
    end_date: Optional[str] = None
    is_active: bool = True

class RecurringUpdate(BaseModel):
    name: Optional[str] = None
    account_id: Optional[int] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    destinataire: Optional[str] = None
    type_id: Optional[int] = None
    subtype_id: Optional[int] = None
    recurrence_pattern: Optional[str] = None
    recurrence_interval: Optional[int] = None
    day_of_month: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/")
async def get_recurring_transactions(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get all recurring transaction templates"""
    recurring = db.get_recurring_templates(include_inactive=include_inactive)
    return {"recurring_transactions": recurring, "count": len(recurring)}

@router.get("/{template_id}")
async def get_recurring_transaction(
    template_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get specific recurring transaction template"""
    templates = db.get_recurring_templates()
    template = next((t for t in templates if t['id'] == template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/")
async def create_recurring_transaction(
    recurring: RecurringCreate,
    current_user: User = Depends(get_current_user)
):
    """Create recurring transaction template"""
    template_data = recurring.dict()
    template_data['tags'] = ''  # Add empty tags if needed

    template_id = db.add_recurring_template(template_data)
    return {"message": "Recurring transaction created", "template_id": template_id}

@router.put("/{template_id}")
async def update_recurring_transaction(
    template_id: int,
    recurring: RecurringUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update recurring transaction template"""
    updates = recurring.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    success = db.update_recurring_template(template_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")

    return {"message": "Recurring transaction updated successfully"}

@router.delete("/{template_id}")
async def delete_recurring_transaction(
    template_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete recurring transaction template"""
    success = db.delete_recurring_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")

    return {"message": "Recurring transaction deleted successfully"}

@router.post("/generate")
async def generate_recurring_transactions(current_user: User = Depends(get_current_user)):
    """Generate pending transactions from active templates"""
    count = db.generate_pending_from_templates()
    return {"message": f"Generated {count} pending transactions", "count": count}
