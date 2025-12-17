"""
Accounts API endpoints
Manage accounts, banks, and owners
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/data/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

# Pydantic models
class AccountCreate(BaseModel):
    bank_id: int
    owner_id: int
    account_type: str
    balance: float
    currency: str = "EUR"
    opening_date: Optional[str] = None
    opening_balance: Optional[float] = None
    linked_account_id: Optional[int] = None

class AccountUpdate(BaseModel):
    bank_id: Optional[int] = None
    owner_id: Optional[int] = None
    account_type: Optional[str] = None
    balance: Optional[float] = None
    currency: Optional[str] = None
    opening_date: Optional[str] = None
    opening_balance: Optional[float] = None
    linked_account_id: Optional[int] = None

class BankCreate(BaseModel):
    name: str

class BankUpdate(BaseModel):
    name: str

class OwnerCreate(BaseModel):
    name: str

class OwnerUpdate(BaseModel):
    name: str

class BalanceValidationCreate(BaseModel):
    account_id: int
    validation_date: str
    actual_balance: float
    notes: Optional[str] = None

@router.get("/")
async def get_accounts(current_user: User = Depends(get_current_user)):
    """Get all accounts"""
    accounts = db.get_accounts()
    return {"accounts": accounts}

@router.get("/{account_id}")
async def get_account(account_id: int, current_user: User = Depends(get_current_user)):
    """Get specific account by ID"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    return account

@router.post("/")
async def create_account(
    account: AccountCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new account"""
    account_data = {
        'bank_id': account.bank_id,
        'owner_id': account.owner_id,
        'account_type': account.account_type,
        'balance': account.balance,
        'currency': account.currency,
        'opening_date': account.opening_date,
        'opening_balance': account.opening_balance if account.opening_balance is not None else account.balance,
        'linked_account_id': account.linked_account_id
    }
    account_id = db.add_account(account_data)

    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create account"
        )

    return {"message": "Account created successfully", "account_id": account_id}

@router.put("/{account_id}")
async def update_account(
    account_id: int,
    account: AccountUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update account"""
    # Get existing account
    all_accounts = db.get_accounts()
    existing = next((a for a in all_accounts if a['id'] == account_id), None)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    # Update fields
    update_data = account.dict(exclude_unset=True)
    if update_data:
        success = db.update_account(account_id, update_data)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update account"
            )

    return {"message": "Account updated successfully"}

@router.delete("/{account_id}")
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete account"""
    success = db.delete_account(account_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete account. Make sure there are no transactions linked to it."
        )

    return {"message": "Account deleted successfully"}

# Banks endpoints
@router.get("/banks/all")
async def get_banks(current_user: User = Depends(get_current_user)):
    """Get all banks"""
    banks = db.get_banks()
    return {"banks": banks}

@router.get("/banks/{bank_id}")
async def get_bank(bank_id: int, current_user: User = Depends(get_current_user)):
    """Get specific bank by ID"""
    banks = db.get_banks()
    bank = next((b for b in banks if b['id'] == bank_id), None)
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bank not found"
        )
    return bank

@router.post("/banks/")
async def create_bank(
    bank: BankCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new bank"""
    bank_id = db.add_bank(bank.name)

    if not bank_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create bank"
        )

    return {"message": "Bank created successfully", "bank_id": bank_id}

@router.put("/banks/{bank_id}")
async def update_bank(
    bank_id: int,
    bank: BankUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update bank"""
    success = db.update_bank(bank_id, bank.name)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update bank"
        )

    return {"message": "Bank updated successfully"}

@router.delete("/banks/{bank_id}")
async def delete_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete bank"""
    success = db.delete_bank(bank_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete bank. Make sure there are no accounts linked to it."
        )

    return {"message": "Bank deleted successfully"}

# Owners endpoints
@router.get("/owners/all")
async def get_owners(current_user: User = Depends(get_current_user)):
    """Get all owners"""
    owners = db.get_owners()
    return {"owners": owners}

@router.get("/owners/{owner_id}")
async def get_owner(owner_id: int, current_user: User = Depends(get_current_user)):
    """Get specific owner by ID"""
    owners = db.get_owners()
    owner = next((o for o in owners if o['id'] == owner_id), None)
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Owner not found"
        )
    return owner

@router.post("/owners/")
async def create_owner(
    owner: OwnerCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new owner"""
    owner_id = db.add_owner(owner.name)

    if not owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create owner"
        )

    return {"message": "Owner created successfully", "owner_id": owner_id}

@router.put("/owners/{owner_id}")
async def update_owner(
    owner_id: int,
    owner: OwnerUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update owner"""
    success = db.update_owner(owner_id, owner.name)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update owner"
        )

    return {"message": "Owner updated successfully"}

@router.delete("/owners/{owner_id}")
async def delete_owner(
    owner_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete owner"""
    success = db.delete_owner(owner_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete owner. Make sure there are no accounts linked to it."
        )

    return {"message": "Owner deleted successfully"}

@router.get("/summary/balances")
async def get_account_balances_summary(current_user: User = Depends(get_current_user)):
    """Get summary of account balances by owner"""
    accounts = db.get_accounts()
    owners = db.get_owners()

    summary = []
    for owner in owners:
        owner_accounts = [a for a in accounts if a['owner_id'] == owner['id']]
        total_balance = sum(a['balance'] for a in owner_accounts)
        summary.append({
            "owner_id": owner['id'],
            "owner_name": owner['name'],
            "total_balance": total_balance,
            "account_count": len(owner_accounts),
            "accounts": owner_accounts
        })

    return {"summary": summary}

# Balance Validation endpoints
@router.post("/validations/")
async def create_balance_validation(
    validation: BalanceValidationCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new balance validation for an account"""
    # Get current system balance for the account
    account = db.get_account(validation.account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    system_balance = account['balance']
    difference = validation.actual_balance - system_balance
    is_match = abs(difference) < 0.01  # Consider match if difference is less than 1 cent

    validation_data = {
        'account_id': validation.account_id,
        'validation_date': validation.validation_date,
        'system_balance': system_balance,
        'actual_balance': validation.actual_balance,
        'difference': difference,
        'is_match': is_match,
        'notes': validation.notes
    }

    validation_id = db.add_balance_validation(validation_data)

    if not validation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create balance validation"
        )

    return {
        "message": "Balance validation created successfully",
        "validation_id": validation_id,
        "is_match": is_match,
        "difference": difference
    }

@router.get("/{account_id}/validations")
async def get_account_validations(
    account_id: int,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """Get validation history for an account"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    validations = db.get_balance_validations(account_id, limit)
    return {"validations": validations}

@router.get("/{account_id}/validations/latest")
async def get_latest_validation(
    account_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get the latest balance validation for an account"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    validation = db.get_latest_balance_validation(account_id)
    if not validation:
        return {"validation": None}

    return {"validation": validation}
