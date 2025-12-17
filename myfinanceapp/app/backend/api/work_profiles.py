"""
Work Profiles API endpoints
Manage work profiles for calculating work hours from expenses
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
DB_PATH = os.getenv("DATABASE_PATH", "/data/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

class WorkProfileCreate(BaseModel):
    owner_id: int
    monthly_salary: float
    working_hours_per_month: float
    currency: str = 'EUR'
    tax_rate: Optional[float] = 0.0

class WorkProfileUpdate(BaseModel):
    monthly_salary: Optional[float] = None
    working_hours_per_month: Optional[float] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None

@router.get("/")
async def get_all_work_profiles(current_user: User = Depends(get_current_user)):
    """Get all work profiles"""
    profiles = db.get_all_work_profiles()

    # Calculate hourly rate for each profile
    for profile in profiles:
        if profile['working_hours_per_month'] > 0:
            profile['hourly_rate'] = profile['monthly_salary'] / profile['working_hours_per_month']
        else:
            profile['hourly_rate'] = 0

    return {"work_profiles": profiles}

@router.get("/{owner_id}")
async def get_work_profile(owner_id: int, current_user: User = Depends(get_current_user)):
    """Get work profile for specific owner"""
    profile = db.get_work_profile(owner_id)

    if not profile:
        raise HTTPException(status_code=404, detail="Work profile not found")

    # Calculate hourly rate
    if profile['working_hours_per_month'] > 0:
        profile['hourly_rate'] = profile['monthly_salary'] / profile['working_hours_per_month']
    else:
        profile['hourly_rate'] = 0

    return profile

@router.post("/")
async def create_or_update_work_profile(
    profile: WorkProfileCreate,
    current_user: User = Depends(get_current_user)
):
    """Create or update work profile"""
    profile_data = profile.dict()

    # Calculate hourly rate
    if profile_data['working_hours_per_month'] > 0:
        profile_data['hourly_rate'] = profile_data['monthly_salary'] / profile_data['working_hours_per_month']
    else:
        profile_data['hourly_rate'] = 0

    owner_id = db.add_or_update_work_profile(profile_data)

    return {"message": "Work profile saved successfully", "owner_id": owner_id}

@router.put("/{owner_id}")
async def update_work_profile(
    owner_id: int,
    profile: WorkProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update existing work profile"""
    # Get existing profile
    existing = db.get_work_profile(owner_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Work profile not found")

    # Merge updates with existing data
    updates = profile.dict(exclude_unset=True)
    profile_data = {**existing, **updates, 'owner_id': owner_id}

    # Calculate hourly rate
    if profile_data['working_hours_per_month'] > 0:
        profile_data['hourly_rate'] = profile_data['monthly_salary'] / profile_data['working_hours_per_month']
    else:
        profile_data['hourly_rate'] = 0

    db.add_or_update_work_profile(profile_data)

    return {"message": "Work profile updated successfully"}

@router.delete("/{owner_id}")
async def delete_work_profile(owner_id: int, current_user: User = Depends(get_current_user)):
    """Delete work profile"""
    success = db.delete_work_profile(owner_id)

    if not success:
        raise HTTPException(status_code=404, detail="Work profile not found")

    return {"message": "Work profile deleted successfully"}

@router.post("/calculate")
async def calculate_work_hours(
    amount: float,
    owner_id: int,
    current_user: User = Depends(get_current_user)
):
    """Calculate work hours required for a given amount"""
    profile = db.get_work_profile(owner_id)

    if not profile:
        raise HTTPException(status_code=404, detail="Work profile not found")

    if profile['working_hours_per_month'] <= 0:
        raise HTTPException(status_code=400, detail="Invalid working hours")

    hourly_rate = profile['monthly_salary'] / profile['working_hours_per_month']

    if hourly_rate <= 0:
        raise HTTPException(status_code=400, detail="Invalid hourly rate")

    work_hours = amount / hourly_rate
    work_days = work_hours / 8  # Assuming 8-hour workday
    work_weeks = work_days / 5  # Assuming 5-day workweek
    work_months = work_weeks / 4  # Approximately 4 weeks per month

    return {
        "amount": amount,
        "currency": profile['currency'],
        "hourly_rate": hourly_rate,
        "work_hours": work_hours,
        "work_days": work_days,
        "work_weeks": work_weeks,
        "work_months": work_months,
        "minutes": work_hours * 60
    }
