"""
Categories API endpoints
Manage transaction types and subtypes
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
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

# Pydantic models
class TypeCreate(BaseModel):
    name: str
    category: str = "expense"  # expense, income, transfer
    icon: Optional[str] = None
    color: str = "#808080"

class TypeUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class SubtypeCreate(BaseModel):
    type_id: int
    name: str

class SubtypeUpdate(BaseModel):
    type_id: Optional[int] = None
    name: Optional[str] = None

@router.get("/types")
async def get_types(current_user: User = Depends(get_current_user)):
    """Get all transaction types"""
    types = db.get_types()
    return {"types": types}

@router.get("/types/{type_id}")
async def get_type(type_id: int, current_user: User = Depends(get_current_user)):
    """Get specific transaction type by ID"""
    types = db.get_types()
    type_obj = next((t for t in types if t['id'] == type_id), None)
    if not type_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction type not found"
        )
    return type_obj

@router.post("/types")
async def create_type(
    type_data: TypeCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new transaction type"""
    type_id = db.add_type(
        name=type_data.name,
        category=type_data.category,
        icon=type_data.icon,
        color=type_data.color
    )

    if not type_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create transaction type"
        )

    return {"message": "Transaction type created successfully", "type_id": type_id}

@router.put("/types/{type_id}")
async def update_type(
    type_id: int,
    type_data: TypeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update transaction type"""
    update_data = type_data.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    success = db.update_type(type_id, update_data)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update transaction type"
        )

    return {"message": "Transaction type updated successfully"}

@router.delete("/types/{type_id}")
async def delete_type(
    type_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete transaction type"""
    success = db.delete_type(type_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete transaction type. Make sure there are no transactions using it."
        )

    return {"message": "Transaction type deleted successfully"}

# Subtypes endpoints
@router.get("/subtypes")
async def get_subtypes(
    type_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all transaction subtypes, optionally filtered by type"""
    subtypes = db.get_subtypes(type_id=type_id)
    return {"subtypes": subtypes}

@router.get("/subtypes/{subtype_id}")
async def get_subtype(
    subtype_id: int,
    current_user: User = Depends(get_current_user)
):
    """Get specific transaction subtype by ID"""
    subtypes = db.get_subtypes()
    subtype = next((s for s in subtypes if s['id'] == subtype_id), None)
    if not subtype:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction subtype not found"
        )
    return subtype

@router.post("/subtypes")
async def create_subtype(
    subtype_data: SubtypeCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new transaction subtype"""
    subtype_id = db.add_subtype(subtype_data.type_id, subtype_data.name)

    if not subtype_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create transaction subtype"
        )

    return {"message": "Transaction subtype created successfully", "subtype_id": subtype_id}

@router.put("/subtypes/{subtype_id}")
async def update_subtype(
    subtype_id: int,
    subtype_data: SubtypeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update transaction subtype"""
    update_data = subtype_data.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    success = db.update_subtype(subtype_id, update_data)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update transaction subtype"
        )

    return {"message": "Transaction subtype updated successfully"}

@router.delete("/subtypes/{subtype_id}")
async def delete_subtype(
    subtype_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete transaction subtype"""
    success = db.delete_subtype(subtype_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete transaction subtype. Make sure there are no transactions using it."
        )

    return {"message": "Transaction subtype deleted successfully"}

@router.get("/hierarchy")
async def get_category_hierarchy(current_user: User = Depends(get_current_user)):
    """Get full category hierarchy (types with their subtypes)"""
    types = db.get_types()
    subtypes = db.get_subtypes()

    hierarchy = []
    for type_obj in types:
        type_subtypes = [s for s in subtypes if s['type_id'] == type_obj['id']]
        hierarchy.append({
            **type_obj,
            "subtypes": type_subtypes
        })

    return {"categories": hierarchy}
