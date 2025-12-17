"""
Alerts and Notifications API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from alerts import AlertManager
from api.auth import get_current_user, User

router = APIRouter()

# Initialize AlertManager
alert_manager = AlertManager()

class EmailSettings(BaseModel):
    smtp_server: str
    smtp_port: int
    username: str
    password: str
    from_email: str
    to_email: str

class ThresholdSettings(BaseModel):
    daily_spending: Optional[float] = 0
    budget_percentage: Optional[int] = 90
    anomaly_detection: Optional[bool] = True

class TestEmailRequest(BaseModel):
    to_email: str

@router.get("/config")
async def get_alert_config(current_user: User = Depends(get_current_user)):
    """Get current alert configuration"""
    return {
        "email": {
            "enabled": alert_manager.config['email']['enabled'],
            "smtp_server": alert_manager.config['email']['smtp_server'],
            "smtp_port": alert_manager.config['email']['smtp_port'],
            "username": alert_manager.config['email']['username'],
            "from_email": alert_manager.config['email']['from_email'],
            "to_email": alert_manager.config['email']['to_email'],
            # Don't send password to frontend
        },
        "thresholds": alert_manager.config['thresholds']
    }

@router.put("/email")
async def update_email_settings(
    settings: EmailSettings,
    current_user: User = Depends(get_current_user)
):
    """Update email notification settings"""
    try:
        alert_manager.update_email_settings(
            smtp_server=settings.smtp_server,
            smtp_port=settings.smtp_port,
            username=settings.username,
            password=settings.password,
            from_email=settings.from_email,
            to_email=settings.to_email
        )
        return {"message": "Email settings updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update settings: {str(e)}")

@router.put("/thresholds")
async def update_thresholds(
    thresholds: ThresholdSettings,
    current_user: User = Depends(get_current_user)
):
    """Update alert thresholds"""
    try:
        alert_manager.update_thresholds(
            daily_spending=thresholds.daily_spending,
            budget_percentage=thresholds.budget_percentage,
            anomaly_detection=thresholds.anomaly_detection
        )
        return {"message": "Alert thresholds updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update thresholds: {str(e)}")

@router.post("/test-email")
async def send_test_email(
    request: TestEmailRequest,
    current_user: User = Depends(get_current_user)
):
    """Send a test email to verify settings"""
    try:
        # Temporarily update to_email for test
        original_to = alert_manager.config['email']['to_email']
        alert_manager.config['email']['to_email'] = request.to_email

        success = alert_manager.send_email(
            subject="Test Email",
            body="This is a test email from your Finance Tracker application. If you received this, your email settings are configured correctly!"
        )

        # Restore original to_email
        alert_manager.config['email']['to_email'] = original_to

        if success:
            return {"message": "Test email sent successfully"}
        else:
            raise HTTPException(status_code=400, detail="Failed to send test email. Check your settings.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send test email: {str(e)}")

@router.get("/history")
async def get_alert_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Get recent alert history"""
    history = alert_manager.get_alert_history(limit)
    return {"history": history}

@router.post("/disable-email")
async def disable_email_notifications(current_user: User = Depends(get_current_user)):
    """Disable email notifications"""
    alert_manager.config['email']['enabled'] = False
    alert_manager.save_config()
    return {"message": "Email notifications disabled"}
