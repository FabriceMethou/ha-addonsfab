"""
Debts API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys, os
import logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from deps import lazy_db
from api.auth import get_current_user, User

logger = logging.getLogger(__name__)

router = APIRouter()

# Resolved centrally so every module reads and writes the same database.
# These used to recompute it from __file__ + DATABASE_PATH, which ignored
# DATA_DIR and could point auth at a different file from everything else.
from deps import DB_PATH
db = lazy_db   # built on first use; see backend/deps.py

class DebtCreate(BaseModel):
    creditor: str  # Maps to 'name' in database
    original_amount: float  # Maps to 'principal_amount' in database
    current_balance: Optional[float] = None  # Maps to 'current_balance' in database (optional, defaults to original_amount)
    interest_rate: float = 0.0
    interest_type: str = 'simple'  # 'simple' or 'compound'
    minimum_payment: float = 0.0  # Maps to 'monthly_payment' in database
    payment_day: int = 1  # Day of month when payment is due (1-28)
    due_date: str  # Maps to 'start_date' in database
    status: str = 'active'  # Maps to 'is_active' in database
    notes: Optional[str] = None
    linked_account_id: Optional[int] = None  # Account for payments
    currency: str = 'EUR'  # Currency code (EUR, USD, GBP, etc.)

class DebtUpdate(BaseModel):
    creditor: Optional[str] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    interest_type: Optional[str] = None
    minimum_payment: Optional[float] = None
    payment_day: Optional[int] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    linked_account_id: Optional[int] = None
    currency: Optional[str] = None  # Currency code (EUR, USD, GBP, etc.)

class DebtPayment(BaseModel):
    debt_id: int
    amount: float
    payment_date: str  # Frontend sends payment_date not date
    payment_type: str = "monthly"  # "monthly" or "extra"
    notes: Optional[str] = None

@router.get("/")
def get_debts(include_inactive: bool = False, current_user: User = Depends(get_current_user)):
    """Get all debts"""
    debts = db.get_debts(include_inactive=include_inactive)

    # Map database fields to frontend expected fields
    mapped_debts = []
    for debt in debts:
        mapped_debt = {
            'id': debt.get('id'),
            'creditor': debt.get('name'),  # Map name to creditor
            'original_amount': debt.get('principal_amount'),  # Map principal_amount to original_amount
            'current_balance': debt.get('current_balance'),
            'interest_rate': debt.get('interest_rate'),
            'interest_type': debt.get('interest_type', 'simple'),
            'minimum_payment': debt.get('monthly_payment'),  # Map monthly_payment to minimum_payment
            'payment_day': debt.get('payment_day', 1),
            'due_date': debt.get('start_date'),  # Map start_date to due_date
            'status': 'active' if debt.get('is_active') == 1 else 'inactive',  # Map is_active to status
            'is_active': debt.get('is_active'),
            'notes': debt.get('notes', ''),
            'account_name': debt.get('account_name'),
            'linked_account_id': debt.get('linked_account_id'),
            'account_id': debt.get('linked_account_id'),  # Add alias for frontend compatibility
            'currency': debt.get('currency', 'EUR')  # Debt currency
        }
        mapped_debts.append(mapped_debt)

    return {"debts": mapped_debts}

@router.get("/summary")
def get_debts_summary(current_user: User = Depends(get_current_user)):
    """Get debts summary with all amounts converted to the user's display currency"""
    display_currency = db.get_preference('display_currency', 'EUR')
    debts = db.get_debts()
    exchange_rates = db.get_exchange_rates_map()
    total_original_amount = sum(
        db.convert_with_rates(debt.get('principal_amount', 0), debt.get('currency', 'EUR'), display_currency, exchange_rates)
        for debt in debts
    )
    total_debt = sum(
        db.convert_with_rates(debt.get('current_balance', 0), debt.get('currency', 'EUR'), display_currency, exchange_rates)
        for debt in debts
    )
    return {
        "total_original_amount": total_original_amount,
        "total_debt": total_debt,
        "display_currency": display_currency
    }

@router.post("/")
def create_debt(debt: DebtCreate, current_user: User = Depends(get_current_user)):
    """Create new debt"""
    # Default current_balance to original_amount if not provided
    current_balance = debt.current_balance if debt.current_balance is not None else debt.original_amount

    # linked_account_id is required
    linked_account_id = debt.linked_account_id
    if not linked_account_id:
        raise HTTPException(status_code=400, detail="linked_account_id is required")

    # Map frontend fields to database fields
    debt_data = {
        'name': debt.creditor,
        'principal_amount': debt.original_amount,
        'current_balance': current_balance,
        'interest_rate': debt.interest_rate,
        'interest_type': debt.interest_type,
        'monthly_payment': debt.minimum_payment,
        'payment_day': debt.payment_day,
        'start_date': debt.due_date,
        'linked_account_id': linked_account_id,
        'is_active': 1 if debt.status == 'active' else 0,
        'currency': debt.currency
    }

    try:
        debt_id = db.add_debt(debt_data)
        return {"message": "Debt created", "debt_id": debt_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{debt_id}")
def update_debt(debt_id: int, debt_update: DebtUpdate, current_user: User = Depends(get_current_user)):
    """Update an existing debt"""
    # Get only the fields that were explicitly set in the request
    update_data = debt_update.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Map frontend fields to database fields
    updates = {}

    if 'creditor' in update_data:
        updates['name'] = update_data['creditor']
    if 'current_balance' in update_data:
        updates['current_balance'] = update_data['current_balance']
    if 'interest_rate' in update_data:
        updates['interest_rate'] = update_data['interest_rate']
    if 'interest_type' in update_data:
        updates['interest_type'] = update_data['interest_type']
    if 'minimum_payment' in update_data:
        updates['monthly_payment'] = update_data['minimum_payment']
    if 'payment_day' in update_data:
        updates['payment_day'] = update_data['payment_day']
    if 'due_date' in update_data:
        updates['start_date'] = update_data['due_date']
    if 'status' in update_data:
        updates['is_active'] = 1 if update_data['status'] == 'active' else 0
    if 'notes' in update_data:
        updates['notes'] = update_data['notes']
    if 'linked_account_id' in update_data:
        updates['linked_account_id'] = update_data['linked_account_id']
    if 'currency' in update_data:
        updates['currency'] = update_data['currency']

    try:
        success = db.update_debt(debt_id, updates)
        if not success:
            raise HTTPException(status_code=404, detail="Debt not found")
        return {"message": "Debt updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Exception in update_debt: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error updating debt: {str(e)}")

@router.delete("/{debt_id}")
def delete_debt(debt_id: int, current_user: User = Depends(get_current_user)):
    """Delete (deactivate) a debt and its associated data"""
    try:
        success = db.delete_debt(debt_id)
        if not success:
            raise HTTPException(status_code=404, detail="Debt not found")
        return {"message": "Debt deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Exception in delete_debt: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error deleting debt: {str(e)}")

@router.post("/payments")
def add_debt_payment(payment: DebtPayment, current_user: User = Depends(get_current_user)):
    """Record a payment against a debt.

    One entry from the user, but two ledger rows: the interest, which is money
    genuinely spent, and the principal, which converts cash into a smaller debt.
    Booking the whole amount as an expense overstated monthly spending by the
    capital repaid, and made budgets look consumed by wealth-building.

    Both rows are filed under the debt's own subcategory, so reports show what
    each loan costs rather than one shared 'Payment' bucket.
    """
    debt = db.get_debt(payment.debt_id)
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    account_id = debt.get('linked_account_id')
    if not account_id:
        raise HTTPException(
            status_code=400,
            detail="Debt has no linked account. Please link an account to this debt first.")

    debt_name = debt.get('name', 'Debt')
    is_extra = payment.payment_type == "extra"

    # Split the payment before writing anything. The schedule is what decides
    # how much of a regular payment is interest; an extra payment is all capital.
    if is_extra:
        interest_part = 0.0
        principal_part = round(payment.amount, 2)
    else:
        interest_part = round(
            (debt.get('current_balance', 0) * (debt.get('interest_rate', 0) / 100)) / 12, 2)
        interest_part = min(interest_part, round(payment.amount, 2))
        principal_part = round(payment.amount - interest_part, 2)

    label = "Extra payment" if is_extra else "Monthly payment"
    tags = "Extra Debt Payment" if is_extra else "Debt Payment"

    def write_row(amount, part):
        """One ledger row. The part decides which type — and so the category."""
        type_id, subtype_id = db.get_or_create_debt_category(
            debt_name, payment.payment_type, part)
        return db.add_transaction({
            'account_id': account_id,
            'transaction_date': payment.payment_date,
            'amount': -abs(amount),
            'type_id': type_id,
            'subtype_id': subtype_id,
            'description': f"{label} ({part}): {debt_name}",
            'destinataire': debt_name,
            'currency': debt.get('currency', 'EUR'),
            'transfer_account_id': None,
            'confirmed': True,
            'tags': tags,
        })

    try:
        interest_transaction_id = write_row(interest_part, 'interest') if interest_part else None
        principal_transaction_id = write_row(principal_part, 'principal') if principal_part else None

        payment_data = {
            'debt_id': payment.debt_id,
            'amount': 0 if is_extra else payment.amount,
            'payment_date': payment.payment_date,
            'transaction_id': interest_transaction_id,
            'principal_transaction_id': principal_transaction_id,
            'extra_payment': payment.amount if is_extra else 0,
            'notes': payment.notes,
        }
        payment_id = db.add_debt_payment(payment_data)

        return {
            "message": "Payment recorded",
            "payment_id": payment_id,
            "interest": interest_part,
            "principal": principal_part,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/payments/{payment_id}")
def delete_debt_payment(payment_id: int, current_user: User = Depends(get_current_user)):
    """Undo a payment: its ledger rows go, and the debt gets its balance back."""
    if not db.delete_debt_payment(payment_id):
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"message": "Payment deleted"}


@router.get("/{debt_id}/payments")
def get_debt_payments(debt_id: int, current_user: User = Depends(get_current_user)):
    """Get payments for specific debt"""
    payments = db.get_debt_payments(debt_id)

    # Map fields if needed
    mapped_payments = []
    for payment in payments:
        mapped_payment = {
            'id': payment.get('id'),
            'amount': payment.get('amount'),
            'payment_date': payment.get('payment_date'),
            'principal_paid': payment.get('principal_paid'),
            'interest_paid': payment.get('interest_paid'),
            'extra_payment': payment.get('extra_payment'),
            'description': payment.get('description') or payment.get('destinataire'),
            'created_at': payment.get('created_at')
        }
        mapped_payments.append(mapped_payment)

    return {"payments": mapped_payments}

@router.get("/{debt_id}/schedule")
def get_amortization_schedule(debt_id: int, current_user: User = Depends(get_current_user)):
    """Get amortization schedule for a debt"""
    schedule = db.generate_amortization_schedule(debt_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Debt not found or no payments needed")
    return {"schedule": schedule}

@router.get("/{debt_id}/payoff")
def get_payoff_summary(debt_id: int, current_user: User = Depends(get_current_user)):
    """Get payoff summary for a debt (exposes existing calculate_debt_payoff)"""
    summary = db.calculate_debt_payoff(debt_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Debt not found")
    return summary
