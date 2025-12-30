"""
Authentication API endpoints
JWT-based authentication with multi-owner support
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from auth import AuthManager

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "JWT_SECRET_KEY environment variable is not set. "
        "This is required for secure authentication. "
        "Please set it before starting the application."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

# Get database path from environment or use default
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
auth_mgr = AuthManager(db_path=DB_PATH)

# Pydantic models
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class TokenData(BaseModel):
    username: Optional[str] = None

class User(BaseModel):
    username: str
    is_admin: bool = False

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    is_admin: bool = False

class UserUpdate(BaseModel):
    email: Optional[str] = None
    is_admin: Optional[bool] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class MFASetup(BaseModel):
    secret: str
    qr_code: str

class MFAVerify(BaseModel):
    token: str

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Verify JWT token and return current user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except jwt.PyJWTError:
        raise credentials_exception

    user_data = auth_mgr.get_user_by_username(username)
    if user_data is None:
        raise credentials_exception

    # Map role to is_admin boolean
    is_admin = user_data.get("role") == "admin"
    return User(username=user_data["username"], is_admin=is_admin)

@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint - returns JWT token"""
    # Authenticate user
    success, message, user_data = auth_mgr.authenticate(
        form_data.username,
        form_data.password
    )

    if not success or not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if MFA is enabled
    if user_data.get("mfa_enabled"):
        # Return temporary token that requires MFA verification
        temp_token = create_access_token(
            data={"sub": form_data.username, "mfa_pending": True},
            expires_delta=timedelta(minutes=5)
        )
        return {
            "access_token": temp_token,
            "token_type": "bearer",
            "user": {
                "username": user_data["username"],
                "mfa_required": True
            }
        }

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": form_data.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user_data["username"],
            "is_admin": user_data.get("role") == "admin",
            "mfa_enabled": user_data.get("mfa_enabled", False)
        }
    }

@router.post("/mfa/verify", response_model=Token)
async def verify_mfa(mfa_data: MFAVerify, token: str = Depends(oauth2_scheme)):
    """Verify MFA token and return full access token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        mfa_pending = payload.get("mfa_pending", False)

        if not mfa_pending:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA verification not required"
            )

        # Get user data for verification
        user_data_temp = auth_mgr.get_user_by_username(username)
        if not user_data_temp:
            raise HTTPException(status_code=404, detail="User not found")

        # Verify MFA token
        if not auth_mgr.verify_mfa_code(user_data_temp['id'], mfa_data.token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA token"
            )

        # Create full access token
        user_data = auth_mgr.get_user_by_username(username)
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "username": user_data["username"],
                "is_admin": user_data.get("role") == "admin",
                "mfa_enabled": True
            }
        }
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@router.post("/register", response_model=dict)
async def register_user(user_create: UserCreate, current_user: User = Depends(get_current_user)):
    """Register new user (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create new users"
        )

    # Create user
    # Note: email defaults to username@local.app if not provided
    role = 'admin' if user_create.is_admin else 'user'
    email = user_create.email if user_create.email else f"{user_create.username}@local.app"
    success, message = auth_mgr.create_user(
        username=user_create.username,
        email=email,
        password=user_create.password,
        role=role,
        requires_password_change=False
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )

    return {"message": "User created successfully", "username": user_create.username}

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user)
):
    """Change user password"""
    # Authenticate with old password
    success, message, user_data = auth_mgr.authenticate(
        current_user.username,
        password_data.old_password
    )

    if not success or not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect current password"
        )

    # Update password
    success, message = auth_mgr.update_user_password(
        user_data['id'],
        password_data.new_password,
        clear_password_change_requirement=True
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

    return {"message": "Password changed successfully"}

@router.post("/mfa/setup", response_model=MFASetup)
async def setup_mfa_endpoint(current_user: User = Depends(get_current_user)):
    """Setup MFA for current user"""
    # Get user data to get user_id
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    success, secret, qr_code = auth_mgr.setup_mfa(user_data['id'])

    if not success:
        raise HTTPException(status_code=400, detail="Failed to setup MFA")

    return {
        "secret": secret,
        "qr_code": qr_code
    }

@router.post("/mfa/enable")
async def enable_mfa(
    mfa_data: MFAVerify,
    current_user: User = Depends(get_current_user)
):
    """Enable MFA after verifying initial token"""
    # Get user data to get user_id
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify and enable MFA
    success, message = auth_mgr.verify_and_enable_mfa(user_data['id'], mfa_data.token)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message
        )

    return {"message": "MFA enabled successfully"}

@router.post("/mfa/disable")
async def disable_mfa_endpoint(current_user: User = Depends(get_current_user)):
    """Disable MFA for current user"""
    # Get user data to get user_id
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    success = auth_mgr.disable_mfa(user_data['id'])

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to disable MFA"
        )

    return {"message": "MFA disabled successfully"}

@router.get("/users")
async def list_users(current_user: User = Depends(get_current_user)):
    """List all users (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can list users"
        )

    users = auth_mgr.list_users()
    return {"users": users}

@router.get("/login-history")
async def get_login_history(
    user_id: Optional[int] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Get login history (admin can see all, users can see their own)"""
    # Get current user's ID
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # If user_id is specified and user is not admin, verify they're requesting their own history
    if user_id is not None and not current_user.is_admin:
        if user_id != user_data['id']:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own login history"
            )

    # If user is not admin and no user_id specified, show their own history
    if not current_user.is_admin and user_id is None:
        user_id = user_data['id']

    history = auth_mgr.get_login_history(user_id=user_id, limit=limit)
    return {"history": history}

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a user (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update users"
        )

    # Prevent admin from removing their own admin privileges
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if user_data and user_data['id'] == user_id and user_update.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own admin privileges"
        )

    # Update the user
    role = 'admin' if user_update.is_admin else 'user' if user_update.is_admin is not None else None
    success, message = auth_mgr.update_user(
        user_id=user_id,
        email=user_update.email,
        role=role
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

    return {"message": "User updated successfully"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a user (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete users"
        )

    # Prevent admin from deleting themselves
    user_data = auth_mgr.get_user_by_username(current_user.username)
    if user_data and user_data['id'] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    # Delete the user
    success = auth_mgr.delete_user(user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return {"message": "User deleted successfully"}
