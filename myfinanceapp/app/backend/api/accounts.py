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
DB_PATH = os.getenv("DATABASE_PATH", "/home/fab/Documents/Development/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

# Pydantic models
class AccountCreate(BaseModel):
    name: Optional[str] = None
    bank_id: int
    owner_id: int
    account_type: str
    balance: float
    currency: str = "EUR"
    opening_date: Optional[str] = None
    opening_balance: Optional[float] = None
    linked_account_id: Optional[int] = None

class AccountUpdate(BaseModel):
    name: Optional[str] = None
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
    # Validate that investment accounts have a linked account
    if account.account_type == 'investment' and not account.linked_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investment accounts must have a linked account for cash movements"
        )

    account_name = (account.name or "").strip()
    if not account_name:
        account_name = f"{account.account_type.title()} Account"

    account_data = {
        'name': account_name,
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
    if 'name' in update_data:
        update_data['name'] = update_data['name'].strip() if update_data['name'] else ''
        if not update_data['name']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account name cannot be empty"
            )

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
    """Get summary of account balances by owner in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    accounts = db.get_accounts()
    owners = db.get_owners()

    summary = []
    for owner in owners:
        owner_accounts = [a for a in accounts if a['owner_id'] == owner['id']]
        # Convert each account balance to display currency
        total_balance = sum(
            db.convert_currency(a['balance'], a.get('currency', 'EUR'), display_currency)
            for a in owner_accounts
        )
        summary.append({
            "owner_id": owner['id'],
            "owner_name": owner['name'],
            "total_balance": total_balance,
            "account_count": len(owner_accounts),
            "accounts": owner_accounts
        })

    return {"summary": summary, "currency": display_currency}

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

@router.post("/recalculate-balances")
async def recalculate_all_balances(
    current_user: User = Depends(get_current_user)
):
    """
    Recalculate all account balances from scratch based on transactions.

    This will:
    1. Reset all accounts to their opening balances
    2. Process all confirmed transactions (including linked investment transactions)
    3. Skip transactions dated before account opening dates

    Use this to fix balance inconsistencies or after fixing historical data.
    """
    try:
        result = db.recalculate_all_balances()
        return {
            "message": "Balances recalculated successfully",
            "accounts_updated": result['accounts_updated'],
            "transactions_processed": result['transactions_processed'],
            "historical_skipped": result['historical_skipped']
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recalculate balances: {str(e)}"
        )

@router.post("/fix-transfer-flags")
async def fix_transfer_flags(
    current_user: User = Depends(get_current_user)
):
    """
    Update all existing transfers to set is_transfer=True.

    This fixes transfers created before the auto-detection was implemented.
    Transfers should have is_transfer=True when they have a transfer_account_id.
    """
    conn = db._get_connection()
    cursor = conn.cursor()

    # Update all transactions that have transfer_account_id but is_transfer=False
    cursor.execute("""
        UPDATE transactions
        SET is_transfer = 1
        WHERE transfer_account_id IS NOT NULL
        AND is_transfer = 0
    """)

    updated_count = cursor.rowcount
    conn.commit()
    conn.close()

    return {
        "message": f"Updated {updated_count} transfer transactions to set is_transfer=True",
        "updated_count": updated_count
    }

@router.post("/fix-missing-transfer-transactions")
async def fix_missing_transfer_transactions(
    current_user: User = Depends(get_current_user)
):
    """
    Fix missing transfer transactions.

    When a transfer is created, it should create two transaction records:
    - One on the source account
    - One on the destination account

    This endpoint finds transfers that only exist on one side and creates the missing record.
    """
    conn = db._get_connection()
    cursor = conn.cursor()

    # Find all transfer transactions
    cursor.execute("""
        SELECT t.id, t.account_id, t.transfer_account_id, t.amount, t.transaction_date,
               t.description, t.destinataire, t.type_id, t.subtype_id, t.currency,
               t.confirmed, t.is_historical
        FROM transactions t
        WHERE t.is_transfer = 1 AND t.transfer_account_id IS NOT NULL
    """)
    transfer_transactions = cursor.fetchall()

    fixed_count = 0
    for trans in transfer_transactions:
        # Check if corresponding transaction exists on the other account
        cursor.execute("""
            SELECT id FROM transactions
            WHERE account_id = ? AND transfer_account_id = ? AND transaction_date = ? AND ABS(ABS(amount) - ABS(?)) < 0.01
        """, (trans['transfer_account_id'], trans['account_id'], trans['transaction_date'], trans['amount']))

        corresponding = cursor.fetchone()

        if not corresponding:
            # Missing! Create the corresponding transaction
            # Amount should be positive for the receiving account
            corresponding_amount = abs(trans['amount'])

            cursor.execute("""
                INSERT INTO transactions
                (account_id, transaction_date, amount, currency, description, destinataire,
                 type_id, subtype_id, is_transfer, transfer_account_id, confirmed, is_historical)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            """, (
                trans['transfer_account_id'],  # The OTHER account
                trans['transaction_date'],
                corresponding_amount,
                trans['currency'],
                trans['description'] or '',
                trans['destinataire'] or '',
                trans['type_id'],
                trans['subtype_id'],
                trans['account_id'],  # Transfer FROM the original account
                trans['confirmed'],
                trans['is_historical']
            ))

            fixed_count += 1

    conn.commit()
    conn.close()

    return {
        "message": f"Fixed {fixed_count} missing transfer transactions",
        "fixed_count": fixed_count
    }

@router.get("/search/{bank_name}")
async def search_accounts_by_bank(
    bank_name: str,
    current_user: User = Depends(get_current_user)
):
    """Search accounts by bank name."""
    conn = db._get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT a.id, a.name, b.name as bank_name, a.account_type, a.balance, a.currency
        FROM accounts a
        LEFT JOIN banks b ON a.bank_id = b.id
        WHERE LOWER(b.name) LIKE LOWER(?)
    """, (f"%{bank_name}%",))
    accounts = cursor.fetchall()
    conn.close()

    return {"accounts": [dict(a) for a in accounts]}

@router.get("/{account_id}/investigate")
async def investigate_account(
    account_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    Investigate account balance discrepancies.
    Returns detailed information about the account and all its transactions.
    """
    conn = db._get_connection()
    cursor = conn.cursor()

    # Get account details
    cursor.execute("""
        SELECT a.*, b.name as bank_name, o.name as owner_name
        FROM accounts a
        LEFT JOIN banks b ON a.bank_id = b.id
        LEFT JOIN owners o ON a.owner_id = o.id
        WHERE a.id = ?
    """, (account_id,))
    account = cursor.fetchone()

    if not account:
        conn.close()
        raise HTTPException(status_code=404, detail="Account not found")

    # Get all transactions for this account
    cursor.execute("""
        SELECT t.id, t.transaction_date, t.amount, t.description, t.destinataire,
               tt.name as type_name, ts.name as subtype_name, tt.category,
               t.confirmed, t.is_historical, t.is_transfer, t.transfer_account_id,
               t.created_at
        FROM transactions t
        LEFT JOIN transaction_types tt ON t.type_id = tt.id
        LEFT JOIN transaction_subtypes ts ON t.subtype_id = ts.id
        WHERE t.account_id = ?
        ORDER BY t.transaction_date ASC, t.created_at ASC
    """, (account_id,))
    transactions = cursor.fetchall()

    conn.close()

    # Calculate expected balance
    opening_balance = account['opening_balance'] if account['opening_balance'] is not None else 0
    running_balance = opening_balance
    calculation_steps = []

    for trans in transactions:
        trans_dict = dict(trans)

        # Check if should be skipped
        skip_reason = None
        if trans_dict['is_historical']:
            skip_reason = "historical"
        elif trans_dict['transaction_date'] < account['opening_date']:
            skip_reason = f"before opening date ({account['opening_date']})"
        elif not trans_dict['confirmed']:
            skip_reason = "not confirmed"

        if skip_reason:
            calculation_steps.append({
                "transaction_id": trans_dict['id'],
                "date": trans_dict['transaction_date'],
                "description": trans_dict['description'],
                "amount": trans_dict['amount'],
                "type": trans_dict['type_name'],
                "skipped": True,
                "skip_reason": skip_reason,
                "balance_after": running_balance
            })
            continue

        category = trans_dict['category']
        amount = trans_dict['amount']

        # All amounts are stored with correct sign:
        # - Income: positive (+100)
        # - Expense: negative (-50)
        # - Transfer: negative (-100, money leaving)
        # So we always just add the amount
        running_balance += amount

        # Display operation with sign
        if amount >= 0:
            operation = f"+{amount}"
        else:
            operation = f"{amount}"  # Already has negative sign

        calculation_steps.append({
            "transaction_id": trans_dict['id'],
            "date": trans_dict['transaction_date'],
            "description": trans_dict['description'],
            "amount": trans_dict['amount'],
            "type": f"{trans_dict['type_name']} - {trans_dict['subtype_name']}",
            "category": category,
            "operation": operation,
            "skipped": False,
            "balance_after": running_balance
        })

    return {
        "account": {
            "id": account['id'],
            "bank": account['bank_name'],
            "owner": account['owner_name'],
            "account_type": account['account_type'],
            "current_balance": account['balance'],
            "opening_date": account['opening_date'],
            "opening_balance": opening_balance,
            "currency": account['currency']
        },
        "transactions": [dict(t) for t in transactions],
        "calculation": {
            "opening_balance": opening_balance,
            "expected_balance": running_balance,
            "actual_balance": account['balance'],
            "difference": running_balance - account['balance'],
            "steps": calculation_steps
        }
    }

