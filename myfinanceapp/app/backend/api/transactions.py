"""
Transactions API endpoints
Manage financial transactions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User
from categorizer import TransactionCategorizer

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)
categorizer = TransactionCategorizer()

# Pydantic models
class TransactionCreate(BaseModel):
    account_id: int
    date: str  # ISO format date string
    due_date: Optional[str] = None  # ISO format date string
    amount: float
    type_id: int
    subtype_id: Optional[int] = None
    description: str
    destinataire: Optional[str] = None  # Recipient/payee
    transfer_account_id: Optional[int] = None
    transfer_amount: Optional[float] = None
    is_pending: bool = False
    tags: Optional[str] = None

class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    date: Optional[str] = None
    due_date: Optional[str] = None  # ISO format date string
    amount: Optional[float] = None
    type_id: Optional[int] = None
    subtype_id: Optional[int] = None
    description: Optional[str] = None
    destinataire: Optional[str] = None  # Recipient/payee
    transfer_account_id: Optional[int] = None
    transfer_amount: Optional[float] = None
    is_pending: Optional[bool] = None
    tags: Optional[str] = None

class TransactionFilter(BaseModel):
    account_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    type_id: Optional[int] = None
    subtype_id: Optional[int] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    search_text: Optional[str] = None
    tags: Optional[str] = None

class AutoCategorizeRequest(BaseModel):
    description: str

@router.get("/")
async def get_transactions(
    account_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type_id: Optional[int] = None,
    subtype_id: Optional[int] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Get transactions with optional filters"""
    # Build filters dictionary
    filters = {}
    if account_id:
        filters['account_id'] = account_id
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date
    if type_id:
        filters['type_id'] = type_id
    if subtype_id:
        filters['subtype_id'] = subtype_id
    if limit:
        filters['limit'] = limit
    if offset:
        filters['offset'] = offset

    transactions = db.get_transactions(filters=filters if filters else None)

    # Map transaction_date to date for frontend compatibility
    for transaction in transactions:
        if 'transaction_date' in transaction:
            transaction['date'] = transaction['transaction_date']
            # Keep transaction_date for backward compatibility

    return {"transactions": transactions, "count": len(transactions)}

@router.get("/{transaction_id}")
async def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get specific transaction by ID"""
    transaction = db.get_transaction(transaction_id)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    # Map transaction_date to date for frontend compatibility
    if 'transaction_date' in transaction:
        transaction['date'] = transaction['transaction_date']

    return transaction

@router.post("/")
async def create_transaction(
    transaction: TransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new transaction"""
    # Get transaction type category from database directly
    conn = db._get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT category FROM transaction_types WHERE id = ?", (transaction.type_id,))
    result = cursor.fetchone()

    if not result:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction type"
        )

    category = result['category']

    # Determine amount sign based on category
    amount = transaction.amount
    if category == 'expense':
        amount = -abs(amount)  # Expenses are negative
    elif category == 'income':
        amount = abs(amount)  # Income is positive
    # Transfers keep the sign as entered

    # Determine destinataire - priority: explicit destinataire > transfer account name > description
    if transaction.destinataire:
        destinataire = transaction.destinataire
    elif category == 'transfer' and transaction.transfer_account_id:
        cursor.execute("SELECT name FROM accounts WHERE id = ?", (transaction.transfer_account_id,))
        account_result = cursor.fetchone()
        if account_result:
            destinataire = account_result['name']
        else:
            destinataire = transaction.description
    else:
        destinataire = transaction.description

    conn.close()

    # Add transaction - map API fields to database fields
    transaction_data = {
        'account_id': transaction.account_id,
        'transaction_date': transaction.date,  # API uses 'date', DB uses 'transaction_date'
        'amount': amount,
        'type_id': transaction.type_id,
        'subtype_id': transaction.subtype_id,
        'description': transaction.description,
        'destinataire': destinataire,
        'currency': 'EUR',  # Default currency
        'transfer_account_id': transaction.transfer_account_id,
        'transfer_amount': transaction.transfer_amount,  # For cross-currency transfers
        'confirmed': not transaction.is_pending,  # Inverted: pending=True means confirmed=False
        'tags': transaction.tags,
    }
    transaction_id = db.add_transaction(transaction_data)

    if not transaction_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create transaction"
        )

    return {
        "message": "Transaction created successfully",
        "transaction_id": transaction_id
    }

@router.post("/bulk")
async def create_transactions_bulk(
    transactions: List[TransactionCreate],
    current_user: User = Depends(get_current_user)
):
    """Create multiple transactions at once"""
    created_ids = []
    errors = []

    for idx, transaction in enumerate(transactions):
        try:
            # Get transaction type category from database directly
            conn = db._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT category FROM transaction_types WHERE id = ?", (transaction.type_id,))
            result = cursor.fetchone()

            if not result:
                conn.close()
                errors.append({
                    "index": idx,
                    "error": "Invalid transaction type"
                })
                continue

            category = result['category']

            # Determine amount sign based on category
            amount = transaction.amount
            if category == 'expense':
                amount = -abs(amount)  # Expenses are negative
            elif category == 'income':
                amount = abs(amount)  # Income is positive

            # Determine destinataire - priority: explicit destinataire > transfer account name > description
            if transaction.destinataire:
                destinataire = transaction.destinataire
            elif category == 'transfer' and transaction.transfer_account_id:
                cursor.execute("SELECT name FROM accounts WHERE id = ?", (transaction.transfer_account_id,))
                account_result = cursor.fetchone()
                if account_result:
                    destinataire = account_result['name']
                else:
                    destinataire = transaction.description
            else:
                destinataire = transaction.description

            conn.close()

            # Add transaction - map API fields to database fields
            transaction_data = {
                'account_id': transaction.account_id,
                'transaction_date': transaction.date,  # API uses 'date', DB uses 'transaction_date'
                'amount': amount,
                'type_id': transaction.type_id,
                'subtype_id': transaction.subtype_id,
                'description': transaction.description,
                'destinataire': destinataire,
                'currency': 'EUR',  # Default currency
                'transfer_account_id': transaction.transfer_account_id,
                'transfer_amount': transaction.transfer_amount,  # For cross-currency transfers
                'confirmed': not transaction.is_pending,  # Inverted: pending=True means confirmed=False
                'tags': transaction.tags,
            }
            transaction_id = db.add_transaction(transaction_data)

            if transaction_id:
                created_ids.append(transaction_id)
            else:
                errors.append({
                    "index": idx,
                    "error": "Failed to create transaction"
                })

        except Exception as e:
            errors.append({
                "index": idx,
                "error": str(e)
            })

    return {
        "message": f"Created {len(created_ids)} transactions",
        "created_count": len(created_ids),
        "created_ids": created_ids,
        "errors": errors
    }

@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: int,
    transaction: TransactionUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update transaction"""
    # Get existing transaction
    existing = db.get_transaction(transaction_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    # Update fields
    update_data = transaction.dict(exclude_unset=True)

    # Determine the transaction type category (use new type_id if provided, otherwise existing)
    type_id = update_data.get('type_id', existing.get('type_id'))

    # Get category from type_id to determine amount sign
    conn = db._get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT category FROM transaction_types WHERE id = ?", (type_id,))
    result = cursor.fetchone()
    conn.close()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid transaction type"
        )

    category = result['category']

    # Adjust amount sign based on category if amount is being updated
    if 'amount' in update_data:
        amount = update_data['amount']
        if category == 'expense':
            update_data['amount'] = -abs(amount)  # Expenses are negative
        elif category == 'income':
            update_data['amount'] = abs(amount)  # Income is positive
        # Transfers keep the sign as entered

    # Map API field names to database column names
    if 'date' in update_data:
        update_data['transaction_date'] = update_data.pop('date')

    if 'is_pending' in update_data:
        update_data['confirmed'] = not update_data.pop('is_pending')

    # Set destinataire - for transfers, use the receiving account name
    if 'description' in update_data or 'transfer_account_id' in update_data:
        if category == 'transfer':
            # Use the new transfer_account_id if provided, otherwise existing
            transfer_account_id = update_data.get('transfer_account_id', existing.get('transfer_account_id'))
            if transfer_account_id:
                conn = db._get_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM accounts WHERE id = ?", (transfer_account_id,))
                account_result = cursor.fetchone()
                conn.close()
                if account_result:
                    update_data['destinataire'] = account_result['name']
        elif 'description' in update_data:
            # For non-transfers, use description as destinataire
            update_data['destinataire'] = update_data['description']

    if update_data:
        success = db.update_transaction(transaction_id, update_data)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update transaction"
            )

    return {"message": "Transaction updated successfully"}

@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete transaction"""
    success = db.delete_transaction(transaction_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete transaction"
        )

    return {"message": "Transaction deleted successfully"}

@router.post("/search")
async def search_transactions(
    filter_data: TransactionFilter,
    current_user: User = Depends(get_current_user)
):
    """Advanced transaction search with filters"""
    transactions = db.search_transactions(
        account_id=filter_data.account_id,
        start_date=filter_data.start_date,
        end_date=filter_data.end_date,
        type_id=filter_data.type_id,
        subtype_id=filter_data.subtype_id,
        min_amount=filter_data.min_amount,
        max_amount=filter_data.max_amount,
        search_text=filter_data.search_text
    )

    # Map transaction_date to date for frontend compatibility
    for transaction in transactions:
        if 'transaction_date' in transaction:
            transaction['date'] = transaction['transaction_date']

    return {"transactions": transactions, "count": len(transactions)}

@router.get("/stats/summary")
async def get_transaction_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get transaction statistics summary in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    filters = {}
    if account_id:
        filters['account_id'] = account_id
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date

    transactions = db.get_transactions(filters=filters if filters else None)

    # Convert all transaction amounts to display currency
    # Exclude transfers from income/expense calculations
    total_income = sum(
        db.convert_currency(t['amount'], t.get('account_currency', 'EUR'), display_currency)
        for t in transactions if t['amount'] > 0 and t.get('category') != 'transfer'
    )
    total_expense = sum(
        db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
        for t in transactions if t['amount'] < 0 and t.get('category') != 'transfer'
    )
    net_change = total_income - total_expense

    return {
        "total_transactions": len(transactions),
        "total_income": total_income,
        "total_expense": total_expense,
        "net_change": net_change,
        "start_date": start_date,
        "end_date": end_date,
        "currency": display_currency
    }

@router.post("/auto-categorize")
async def auto_categorize_transaction(
    request: AutoCategorizeRequest,
    current_user: User = Depends(get_current_user)
):
    """Auto-categorize a transaction based on description"""
    try:
        # Train categorizer if not already trained
        model_info = categorizer.get_model_info()
        is_trained = model_info.get('trained', False)
        if not is_trained:
            transactions = db.get_transactions()  # Fixed: get_all_transactions doesn't exist
            if len(transactions) > 10:  # Need minimum transactions to train
                categorizer.train_model(transactions)

        # Predict category - returns (type_id, subtype_id, confidence)
        type_id, subtype_id, confidence = categorizer.predict(request.description)

        if type_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categorizer model not trained. Need at least 10 categorized transactions."
            )

        # Get category names from database
        conn = db._get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM transaction_types WHERE id = ?", (type_id,))
        type_result = cursor.fetchone()
        type_name = type_result['name'] if type_result else None

        subtype_name = None
        if subtype_id:
            cursor.execute("SELECT name FROM transaction_subtypes WHERE id = ?", (subtype_id,))
            subtype_result = cursor.fetchone()
            subtype_name = subtype_result['name'] if subtype_result else None

        conn.close()

        return {
            "type_id": type_id,
            "type_name": type_name,
            "subtype_id": subtype_id,
            "subtype_name": subtype_name,
            "confidence": confidence
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Auto-categorization failed: {str(e)}"
        )

@router.get("/categorizer/status")
async def get_categorizer_status(current_user: User = Depends(get_current_user)):
    """Get categorizer model status and statistics"""
    try:
        transactions = db.get_transactions()  # Fixed: get_all_transactions doesn't exist
        categorized_txns = [t for t in transactions if t.get('type_id') and t.get('description')]

        # Check if model file exists and get last modified time
        import os
        model_path = "data/categorizer_model.pkl"
        model_exists = os.path.exists(model_path)
        last_trained = None

        if model_exists:
            import time
            mtime = os.path.getmtime(model_path)
            last_trained = datetime.fromtimestamp(mtime).isoformat()

        # Fixed: is_trained() method doesn't exist, use get_model_info() instead
        model_info = categorizer.get_model_info()
        is_trained = model_info.get('trained', False)

        return {
            "is_trained": is_trained,
            "model_exists": model_exists,
            "last_trained": last_trained,
            "total_transactions": len(transactions),
            "categorized_transactions": len(categorized_txns),
            "ready_to_train": len(categorized_txns) >= 10,
            "ml_available": categorizer.model is not None or model_exists
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get status: {str(e)}"
        )

@router.post("/train-categorizer")
async def train_categorizer(current_user: User = Depends(get_current_user)):
    """Train the transaction categorizer with existing data"""
    try:
        transactions = db.get_transactions()  # Fixed: get_all_transactions doesn't exist

        if len(transactions) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Not enough transactions to train categorizer (minimum 10 required)"
            )

        # Filter transactions with categories
        categorized_txns = [t for t in transactions if t.get('type_id') and t.get('description')]

        if len(categorized_txns) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Not enough categorized transactions to train model (minimum 10 required)"
            )

        # Train the model
        training_samples, unique_categories = categorizer.train_model(categorized_txns)

        return {
            "message": "Categorizer trained successfully",
            "training_samples": training_samples,
            "unique_categories": unique_categories,
            "total_transactions": len(transactions),
            "categorized_transactions": len(categorized_txns),
            "trained_at": datetime.now().isoformat()
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Training failed: {str(e)}"
        )

@router.get("/pending/all")
async def get_pending_transactions(current_user: User = Depends(get_current_user)):
    """Get all pending transactions"""
    pending = db.get_pending_transactions()
    return {"pending_transactions": pending, "count": len(pending)}

@router.post("/{transaction_id}/confirm")
async def confirm_pending_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Confirm a pending transaction"""
    success = db.confirm_pending_transaction(transaction_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to confirm transaction"
        )

    return {"message": "Transaction confirmed successfully"}

@router.delete("/{transaction_id}/reject")
async def reject_pending_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Reject/delete a pending transaction"""
    # For pending transactions, just delete them
    success = db.delete_transaction(transaction_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to reject transaction"
        )

    return {"message": "Transaction rejected successfully"}

@router.get("/tags/all")
async def get_all_tags(
    limit: int = Query(100, le=500),
    current_user: User = Depends(get_current_user)
):
    """Get all distinct tags from transactions and envelopes"""
    tags = db.get_distinct_tags(limit=limit)
    return {"tags": tags, "count": len(tags)}

@router.get("/recipients/all")
async def get_all_recipients(
    limit: int = Query(100, le=500),
    current_user: User = Depends(get_current_user)
):
    """Get all distinct recipients/payers from transactions"""
    transactions = db.get_transactions()

    # Collect all unique recipients
    recipients_set = set()
    for t in transactions:
        if t.get('destinataire'):
            recipients_set.add(t['destinataire'].strip())

    # Convert to list and sort
    recipients = sorted(list(recipients_set))[:limit]

    return {"recipients": recipients, "count": len(recipients)}
