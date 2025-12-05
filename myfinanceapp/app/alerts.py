"""
Alert and Notification Module
Sends email/SMS alerts for budget thresholds and anomalies
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Dict, List, Optional
import json
from pathlib import Path


class AlertManager:
    """Manage financial alerts and notifications."""

    def __init__(self, config_path: str = "data/alerts_config.json"):
        self.config_path = Path(config_path)
        self.config = self._load_config()

    def _load_config(self) -> Dict:
        """Load alert configuration."""
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                return json.load(f)
        return {
            'email': {
                'enabled': False,
                'smtp_server': '',
                'smtp_port': 587,
                'username': '',
                'password': '',
                'from_email': '',
                'to_email': ''
            },
            'thresholds': {
                'daily_spending': 0,
                'budget_percentage': 90,  # Alert at 90% of budget
                'anomaly_detection': True
            },
            'alerts_log': []
        }

    def save_config(self):
        """Save alert configuration."""
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2, default=str)

    def update_email_settings(self, smtp_server: str, smtp_port: int,
                               username: str, password: str,
                               from_email: str, to_email: str):
        """Update email notification settings."""
        self.config['email'].update({
            'enabled': True,
            'smtp_server': smtp_server,
            'smtp_port': smtp_port,
            'username': username,
            'password': password,
            'from_email': from_email,
            'to_email': to_email
        })
        self.save_config()

    def update_thresholds(self, daily_spending: float = 0,
                          budget_percentage: int = 90,
                          anomaly_detection: bool = True):
        """Update alert thresholds."""
        self.config['thresholds'].update({
            'daily_spending': daily_spending,
            'budget_percentage': budget_percentage,
            'anomaly_detection': anomaly_detection
        })
        self.save_config()

    def send_email(self, subject: str, body: str) -> bool:
        """Send email notification."""
        if not self.config['email']['enabled']:
            return False

        try:
            msg = MIMEMultipart()
            msg['From'] = self.config['email']['from_email']
            msg['To'] = self.config['email']['to_email']
            msg['Subject'] = f"[Finance Tracker] {subject}"

            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP(
                self.config['email']['smtp_server'],
                self.config['email']['smtp_port']
            )
            server.starttls()
            server.login(
                self.config['email']['username'],
                self.config['email']['password']
            )
            server.send_message(msg)
            server.quit()

            self._log_alert('email', subject, 'sent')
            return True

        except Exception as e:
            self._log_alert('email', subject, f'failed: {str(e)}')
            return False

    def check_budget_alerts(self, budgets: List[Dict],
                            current_spending: Dict[str, float]) -> List[Dict]:
        """Check if any budgets are near or over threshold."""
        alerts = []
        threshold = self.config['thresholds']['budget_percentage'] / 100

        for budget in budgets:
            category = budget['category']
            limit = budget['limit']
            spent = current_spending.get(category, 0)

            percentage = spent / limit if limit > 0 else 0

            if percentage >= 1.0:
                alerts.append({
                    'type': 'budget_exceeded',
                    'category': category,
                    'spent': spent,
                    'limit': limit,
                    'percentage': percentage * 100,
                    'severity': 'critical'
                })
            elif percentage >= threshold:
                alerts.append({
                    'type': 'budget_warning',
                    'category': category,
                    'spent': spent,
                    'limit': limit,
                    'percentage': percentage * 100,
                    'severity': 'warning'
                })

        return alerts

    def check_daily_spending(self, today_total: float) -> Optional[Dict]:
        """Check if daily spending exceeded threshold."""
        threshold = self.config['thresholds']['daily_spending']
        if threshold > 0 and today_total > threshold:
            return {
                'type': 'daily_limit',
                'amount': today_total,
                'threshold': threshold,
                'severity': 'warning'
            }
        return None

    def send_alert_notification(self, alert: Dict):
        """Send notification for an alert."""
        if alert['type'] == 'budget_exceeded':
            subject = f"⚠️ Budget Exceeded: {alert['category']}"
            body = f"""
Your budget for {alert['category']} has been exceeded.

Spent: €{alert['spent']:.2f}
Limit: €{alert['limit']:.2f}
Over by: €{alert['spent'] - alert['limit']:.2f}

Please review your spending in this category.
"""
        elif alert['type'] == 'budget_warning':
            subject = f"⚡ Budget Warning: {alert['category']}"
            body = f"""
You've used {alert['percentage']:.0f}% of your {alert['category']} budget.

Spent: €{alert['spent']:.2f}
Limit: €{alert['limit']:.2f}
Remaining: €{alert['limit'] - alert['spent']:.2f}
"""
        elif alert['type'] == 'daily_limit':
            subject = "💸 Daily Spending Limit Reached"
            body = f"""
Your daily spending has exceeded the threshold.

Today's spending: €{alert['amount']:.2f}
Your threshold: €{alert['threshold']:.2f}
"""
        else:
            subject = "Finance Tracker Alert"
            body = str(alert)

        self.send_email(subject, body)

    def _log_alert(self, alert_type: str, message: str, status: str):
        """Log alert to history."""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'type': alert_type,
            'message': message,
            'status': status
        }
        self.config['alerts_log'].append(log_entry)
        # Keep only last 100 alerts
        self.config['alerts_log'] = self.config['alerts_log'][-100:]
        self.save_config()

    def get_alert_history(self, limit: int = 20) -> List[Dict]:
        """Get recent alert history."""
        return self.config['alerts_log'][-limit:][::-1]