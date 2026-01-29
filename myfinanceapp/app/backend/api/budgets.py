"""
Budgets API endpoints
Manage spending budgets by category
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
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

# Pydantic models
class BudgetCreate(BaseModel):
    type_id: int
    amount: float
    currency: str = 'EUR'  # Budget currency (EUR, SEK, DKK, etc.)
    period: str = 'monthly'  # 'monthly' or 'yearly'
    start_date: str
    end_date: Optional[str] = None
    is_active: bool = True

class BudgetUpdate(BaseModel):
    type_id: Optional[int] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    period: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/")
async def get_budgets(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get all budgets"""
    budgets = db.get_budgets(include_inactive=include_inactive)
    return {"budgets": budgets, "count": len(budgets)}

@router.get("/{budget_id}")
async def get_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get specific budget by ID"""
    budgets = db.get_budgets(include_inactive=True)
    budget = next((b for b in budgets if b['id'] == budget_id), None)

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    return budget

@router.post("/")
async def create_budget(
    budget: BudgetCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new budget"""
    budget_data = {
        'type_id': budget.type_id,
        'amount': budget.amount,
        'currency': budget.currency,
        'period': budget.period,
        'start_date': budget.start_date,
        'end_date': budget.end_date,
        'is_active': budget.is_active
    }

    budget_id = db.add_budget(budget_data)

    if not budget_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create budget"
        )

    return {
        "message": "Budget created successfully",
        "budget_id": budget_id
    }

@router.put("/{budget_id}")
async def update_budget(
    budget_id: int,
    budget: BudgetUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update budget"""
    update_data = budget.dict(exclude_unset=True)

    if update_data:
        success = db.update_budget(budget_id, update_data)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update budget"
            )

    return {"message": "Budget updated successfully"}

@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete budget"""
    success = db.delete_budget(budget_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete budget"
        )

    return {"message": "Budget deleted successfully"}

@router.get("/vs-actual/{year}/{month}")
async def get_budget_vs_actual(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):
    """Get budget vs actual spending for a specific month.

    Returns budget comparisons with currency conversion. All amounts are
    converted to the user's display currency for consistent comparison.

    Response includes:
    - categories: List of budget vs actual comparisons
    - display_currency: The currency used for display amounts
    """
    data = db.get_budget_vs_actual(year, month)

    return {
        "year": year,
        "month": month,
        "categories": data.get('categories', []),
        "display_currency": data.get('display_currency', 'EUR')
    }
