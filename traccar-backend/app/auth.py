from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.database import get_session

_bearer = HTTPBearer()


async def require_session(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    session = await get_session(credentials.credentials)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
        )
    return session
