"""
FastAPI Backend for Finance Tracker
Main application file with JWT authentication
"""
import sys, os
import logging

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_ROOT)

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
import os

from database import FinanceDatabase
from backup_manager import BackupManager
from alerts import AlertManager
from categorizer import TransactionCategorizer
from predictions import SpendingPredictor

logger = logging.getLogger(__name__)

# Import API routers
from api import auth, accounts, transactions, categories, envelopes, recurring, debts, investments, reports, backups, settings, currencies, work_profiles, budgets, alerts

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

# Initialize FastAPI app
app = FastAPI(
    title="Finance Tracker API",
    description="Personal finance management API with transaction tracking and reporting",
    version="2.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
db = FinanceDatabase(db_path=DB_PATH)
backup_mgr = BackupManager(db_path=DB_PATH)
alert_manager = AlertManager()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(currencies.router, prefix="/api/currencies", tags=["Currencies"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["Accounts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(envelopes.router, prefix="/api/envelopes", tags=["Envelopes"])
app.include_router(recurring.router, prefix="/api/recurring", tags=["Recurring Transactions"])
app.include_router(debts.router, prefix="/api/debts", tags=["Debts"])
app.include_router(investments.router, prefix="/api/investments", tags=["Investments"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["Budgets"])
app.include_router(backups.router, prefix="/api/backups", tags=["Backups"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(work_profiles.router, prefix="/api/work-profiles", tags=["Work Profiles"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])

@app.get("/")
def read_root():
    """Root endpoint"""
    return {
        "message": "Finance Tracker API",
        "version": "2.0.0",
        "docs": "/docs",
        "status": "running"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database": "connected"
    }

@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    # Check for auto backup
    if backup_mgr.should_auto_backup():
        backup_result = backup_mgr.create_backup('auto', 'Daily automatic backup')
        if backup_result:
            logger.info("Auto backup created: %s", backup_result["filename"])

@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("Shutting down Finance Tracker API...")
