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

from deps import lazy_db
from api.auth import get_current_user, User

router = APIRouter()

# Resolved centrally so every module reads and writes the same database.
# These used to recompute it from __file__ + DATABASE_PATH, which ignored
# DATA_DIR and could point auth at a different file from everything else.
from deps import DB_PATH
db = lazy_db   # built on first use; see backend/deps.py

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
def get_accounts(current_user: User = Depends(get_current_user)):
    """Get all accounts"""
    accounts = db.get_accounts()
    return {"accounts": accounts}

@router.get("/{account_id}")
def get_account(account_id: int, current_user: User = Depends(get_current_user)):
    """Get specific account by ID"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    return account

@router.post("/")
def create_account(
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
def update_account(
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
def delete_account(
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
def get_banks(current_user: User = Depends(get_current_user)):
    """Get all banks"""
    banks = db.get_banks()
    return {"banks": banks}

@router.get("/banks/{bank_id}")
def get_bank(bank_id: int, current_user: User = Depends(get_current_user)):
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
def create_bank(
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
def update_bank(
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
def delete_bank(
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
def get_owners(current_user: User = Depends(get_current_user)):
    """Get all owners"""
    owners = db.get_owners()
    return {"owners": owners}

@router.get("/owners/{owner_id}")
def get_owner(owner_id: int, current_user: User = Depends(get_current_user)):
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
def create_owner(
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
def update_owner(
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
def delete_owner(
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
def get_account_balances_summary(current_user: User = Depends(get_current_user)):
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
def create_balance_validation(
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

    response = {
        "message": "Balance validation created successfully",
        "validation_id": validation_id,
        "is_match": is_match,
        "difference": difference,
    }

    if not is_match:
        # A discrepancy used to be recorded and then forgotten. Hand back what
        # can actually be done about it, and the period to compare, so the UI
        # can open the reconciliation already filled in.
        previous = db.get_balance_validations(validation.account_id, limit=2)
        since = next((v['validation_date'] for v in previous
                      if v['id'] != validation_id), None)
        response["next_steps"] = {
            "recalculate": f"/api/accounts/{validation.account_id}/recalculate",
            "reconcile": {
                "account_id": validation.account_id,
                "start_date": since,
                "end_date": validation.validation_date,
            },
            "hint": ("Rebuild the balance from the ledger, or compare this period "
                     "against a bank statement to find the transaction behind the gap."),
        }

    return response


@router.post("/{account_id}/recalculate")
def recalculate_one_account(account_id: int, current_user: User = Depends(get_current_user)):
    """Rebuild a single account's balance from its own transactions.

    The global recalculation rewrites every account, which is heavy-handed when
    one is off. For an investment account this re-prices the portfolio instead.
    """
    try:
        result = db.recalculate_account_balance(account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result["message"] = (
        "Balance already matched the ledger" if result["adjustment"] == 0
        else f"Balance corrected by {result['adjustment']:+.2f}")
    return result

@router.get("/{account_id}/validations")
def get_account_validations(
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
def get_latest_validation(
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
def recalculate_all_balances(
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
def fix_transfer_flags(
    current_user: User = Depends(get_current_user)
):
    """
    Update all existing transfers to set is_transfer=True.

    This fixes transfers created before the auto-detection was implemented.
    Transfers should have is_transfer=True when they have a transfer_account_id.
    """
    with db.db_connection(commit=True) as conn:
        updated_count = conn.execute("""
            UPDATE transactions
            SET is_transfer = 1
            WHERE transfer_account_id IS NOT NULL
            AND is_transfer = 0
        """).rowcount

    return {
        "message": f"Updated {updated_count} transfer transactions to set is_transfer=True",
        "updated_count": updated_count
    }

@router.post("/fix-missing-transfer-transactions")
def fix_missing_transfer_transactions(
    current_user: User = Depends(get_current_user)
):
    """
    Fix missing transfer transactions.

    When a transfer is created, it should create two transaction records:
    - One on the source account
    - One on the destination account

    This endpoint finds transfers that only exist on one side and creates the missing record.
    """
    # Reads, the loop and every insert in one transaction: a failure
    # part-way through now rolls the whole repair back instead of
    # committing half of it.
    with db.db_connection(commit=True) as conn:
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

                # Link the two rows together. recalculate_all_balances() only
                # skips its legacy single-entry path when linked_transfer_id is
                # set; leaving them unlinked made each row credit the other
                # account on top of its own, doubling the transfer.
                mirror_id = cursor.lastrowid
                cursor.execute(
                    "UPDATE transactions SET linked_transfer_id = ? WHERE id = ?",
                    (mirror_id, trans['id']))
                cursor.execute(
                    "UPDATE transactions SET linked_transfer_id = ? WHERE id = ?",
                    (trans['id'], mirror_id))

                fixed_count += 1

    # The inserts above write straight to the transactions table, so the
    # accounts.balance counters know nothing about them. Rebuilding from the
    # ledger is the only way to leave the books consistent — without this the
    # repair added a second drifting account for every one it fixed.
    if fixed_count:
        db.recalculate_all_balances()


    return {
        "message": f"Fixed {fixed_count} missing transfer transactions",
        "fixed_count": fixed_count
    }

@router.get("/search/{bank_name}")
def search_accounts_by_bank(
    bank_name: str,
    current_user: User = Depends(get_current_user)
):
    """Search accounts by bank name."""
    with db.db_connection(commit=False) as conn:
        accounts = conn.execute("""
            SELECT a.id, a.name, b.name as bank_name, a.account_type, a.balance, a.currency
            FROM accounts a
            LEFT JOIN banks b ON a.bank_id = b.id
            WHERE LOWER(b.name) LIKE LOWER(?)
        """, (f"%{bank_name}%",)).fetchall()

    return {"accounts": [dict(a) for a in accounts]}

@router.get("/{account_id}/investigate")
def investigate_account(
    account_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    Investigate account balance discrepancies.
    Returns detailed information about the account and all its transactions.
    """
    # Both reads in one connection, closed on every path — including the 404
    # below, which previously relied on a manual close before raising.
    with db.db_connection(commit=False) as conn:
        account = conn.execute("""
            SELECT a.*, b.name as bank_name, o.name as owner_name
            FROM accounts a
            LEFT JOIN banks b ON a.bank_id = b.id
            LEFT JOIN owners o ON a.owner_id = o.id
            WHERE a.id = ?
        """, (account_id,)).fetchone()

        transactions = conn.execute("""
            SELECT t.id, t.transaction_date, t.amount, t.description, t.destinataire,
                   tt.name as type_name, ts.name as subtype_name, tt.category,
                   t.confirmed, t.is_historical, t.is_transfer, t.transfer_account_id,
                   t.created_at
            FROM transactions t
            LEFT JOIN transaction_types tt ON t.type_id = tt.id
            LEFT JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            WHERE t.account_id = ?
            ORDER BY t.transaction_date ASC, t.created_at ASC
        """, (account_id,)).fetchall() if account else []

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

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

