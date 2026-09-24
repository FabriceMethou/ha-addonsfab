"""
Recipients API endpoints
Add, rename, merge and delete the recipients (payees) typed on transactions.

A recipient is unique whatever its case: "Lidl" and "LIDL" are one. The account,
holding and creditor names written by transfers, investments and debt payments
are not recipients and never appear or change here.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from deps import lazy_db
from database import DatabaseIntegrityError, RecordInUseError
from api.auth import get_current_user, User

router = APIRouter()

db = lazy_db   # built on first use; see backend/deps.py


class RecipientCreate(BaseModel):
    name: str


class RecipientRename(BaseModel):
    new_name: str
    # Defaults to a dry run: the caller has to ask for the change explicitly,
    # because a rename can merge two recipients and cannot be undone.
    confirm: bool = False


@router.get("/")
def list_recipients(current_user: User = Depends(get_current_user)):
    """Every recipient with its transaction count, date range and how many of
    its transactions are stored under another spelling."""
    return {"recipients": db.get_recipients()}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_recipient(
    recipient: RecipientCreate,
    current_user: User = Depends(get_current_user),
):
    """Add a recipient before any transaction uses it."""
    try:
        return db.add_recipient(recipient.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DatabaseIntegrityError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/{recipient_id}/rename")
def rename_recipient(
    recipient_id: int,
    rename: RecipientRename,
    current_user: User = Depends(get_current_user),
):
    """Rename a recipient across every transaction filed under it.

    Without `confirm` this only reports what would happen: how many
    transactions change, and whether the new name belongs to another recipient,
    in which case the two merge. The UI shows that before asking again.
    """
    try:
        result = db.rename_recipient(
            recipient_id, rename.new_name, apply_changes=rename.confirm)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result is None:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if not result["applied"]:
        result["message"] = (
            f"{result['affected']} transaction(s) would be renamed to "
            f"'{result['new_name']}'")
        if result["merges_into_existing"]:
            result["message"] += (
                f", merging with {result['existing_count']} already under that name")
        result["message"] += ". This cannot be undone."
    elif result["merges_into_existing"]:
        result["message"] = (
            f"Merged into '{result['new_name']}' "
            f"({result['affected'] + result['existing_count']} transaction(s))")
    else:
        result["message"] = (
            f"Renamed to '{result['new_name']}' ({result['affected']} transaction(s))")

    return result


@router.delete("/{recipient_id}")
def delete_recipient(
    recipient_id: int,
    current_user: User = Depends(get_current_user),
):
    """Delete a recipient. Refused while any transaction uses it."""
    try:
        deleted = db.delete_recipient(recipient_id)
    except RecordInUseError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return {"message": "Recipient deleted"}


@router.get("/duplicates")
def list_duplicates(current_user: User = Depends(get_current_user)):
    """Recipients whose transactions are stored under several spellings, with
    the spelling that unifying would keep. Changes nothing."""
    duplicates = db.get_recipient_duplicates()
    return {
        "duplicates": duplicates,
        "transaction_count": sum(d["affected"] for d in duplicates),
    }


@router.post("/duplicates/unify")
def unify_duplicates(current_user: User = Depends(get_current_user)):
    """Store every recipient's transactions under its most used spelling."""
    result = db.unify_recipient_duplicates()
    result["message"] = (
        f"Unified {result['recipients']} recipient(s), "
        f"{result['transactions']} transaction(s) renamed")
    return result
