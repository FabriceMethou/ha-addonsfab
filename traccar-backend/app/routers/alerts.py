from fastapi import APIRouter, Depends, Query

from app.alerts import public_alert
from app.auth import require_session
from app.authz import visible_device_ids
from app.database import get_groups_for_device, list_alerts

router = APIRouter()


@router.get("/alerts")
async def get_alerts(
    since_id: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    session: dict = Depends(require_session),
) -> list[dict]:
    """Alerts about people the caller can see, newest first.

    Phones call this after reconnecting, to catch up on anything raised
    while their live connection was down.
    """
    visible = await visible_device_ids(session)
    groups = set(await get_groups_for_device(session["device_unique_id"]))
    rows = await list_alerts(visible, groups, since_id, limit)
    return [public_alert(r) for r in rows]
