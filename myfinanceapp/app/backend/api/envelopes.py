"""
Envelopes API endpoints
Manage savings goals (envelopes)
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
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
db = FinanceDatabase(db_path=DB_PATH)

class EnvelopeCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    deadline: Optional[str] = None
    description: Optional[str] = None
    color: str = '#4ECDC4'
    tags: Optional[str] = None
    is_active: bool = True

class EnvelopeUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[str] = None
    is_active: Optional[bool] = None

class EnvelopeTransaction(BaseModel):
    envelope_id: int
    amount: float
    description: str
    date: Optional[str] = None
    account_id: Optional[int] = None
    transaction_id: Optional[int] = None

@router.get("/")
async def get_envelopes(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get all envelopes, optionally including inactive ones"""
    envelopes = db.get_envelopes(include_inactive=include_inactive)
    return {"envelopes": envelopes}

@router.post("/")
async def create_envelope(envelope: EnvelopeCreate, current_user: User = Depends(get_current_user)):
    """Create new envelope"""
    envelope_data = {
        'name': envelope.name,
        'target_amount': envelope.target_amount,
        'current_amount': envelope.current_amount,
        'deadline': envelope.deadline,
        'description': envelope.description,
        'color': envelope.color,
        'tags': envelope.tags,
        'is_active': 1 if envelope.is_active else 0
    }
    envelope_id = db.add_envelope(envelope_data)
    return {"message": "Envelope created", "envelope_id": envelope_id}

@router.put("/{envelope_id}/reactivate")
async def reactivate_envelope(envelope_id: int, current_user: User = Depends(get_current_user)):
    """Reactivate a deactivated envelope"""
    success = db.update_envelope(envelope_id, {'is_active': 1})
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reactivate envelope")
    return {"message": "Envelope reactivated"}

@router.put("/{envelope_id}")
async def update_envelope(envelope_id: int, envelope: EnvelopeUpdate, current_user: User = Depends(get_current_user)):
    """Update envelope"""
    success = db.update_envelope(envelope_id, envelope.dict(exclude_unset=True))
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update envelope")
    return {"message": "Envelope updated"}

@router.delete("/{envelope_id}")
async def delete_envelope(
    envelope_id: int,
    permanent: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Delete envelope.
    - If permanent=False (default): Soft delete (deactivate)
    - If permanent=True: Permanently delete envelope and all transactions
    """
    if permanent:
        success = db.permanent_delete_envelope(envelope_id)
        message = "Envelope permanently deleted"
    else:
        success = db.delete_envelope(envelope_id)
        message = "Envelope deactivated"

    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete envelope")
    return {"message": message}

@router.post("/transactions")
async def add_envelope_transaction(transaction: EnvelopeTransaction, current_user: User = Depends(get_current_user)):
    """Add transaction to envelope with optional link to existing transaction"""
    # Check for over-allocation
    envelope = db.get_envelope(transaction.envelope_id)
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")

    warning = None
    if transaction.amount > 0:
        new_total = (envelope.get('current_amount', 0) or 0) + transaction.amount
        target = envelope.get('target_amount', 0) or 0
        if target > 0 and new_total > target:
            warning = f"This allocation exceeds the target by {new_total - target:.2f}"

    transaction_data = {
        'envelope_id': transaction.envelope_id,
        'transaction_date': transaction.date,  # API uses 'date', DB uses 'transaction_date'
        'amount': transaction.amount,
        'account_id': transaction.account_id,
        'description': transaction.description,
        'transaction_id': transaction.transaction_id
    }
    trans_id = db.add_envelope_transaction(transaction_data)
    result = {"message": "Transaction added", "transaction_id": trans_id}
    if warning:
        result["warning"] = warning
    return result

@router.get("/{envelope_id}/transactions")
async def get_envelope_transactions(envelope_id: int, current_user: User = Depends(get_current_user)):
    """Get transactions for specific envelope with linked transaction details"""
    transactions = db.get_envelope_transactions(envelope_id)

    # Map transaction_date to date for frontend consistency and include linked transaction details
    mapped_transactions = []
    for trans in transactions:
        mapped_trans = {
            'id': trans.get('id'),
            'envelope_id': trans.get('envelope_id'),
            'amount': trans.get('amount'),
            'date': trans.get('transaction_date'),  # Map transaction_date to date
            'description': trans.get('description'),
            'account_id': trans.get('account_id'),
            'account_name': trans.get('account_name'),
            'created_at': trans.get('created_at'),
            'transaction_id': trans.get('transaction_id'),
            'linked_transaction': {
                'date': trans.get('linked_transaction_date'),
                'description': trans.get('linked_transaction_description'),
                'amount': trans.get('linked_transaction_amount')
            } if trans.get('transaction_id') else None
        }
        mapped_transactions.append(mapped_trans)

    return {"transactions": mapped_transactions}
