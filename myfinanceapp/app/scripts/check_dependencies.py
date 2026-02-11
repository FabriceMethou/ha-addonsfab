#!/usr/bin/env python3
"""
Dependency Update Checker
Checks for outdated Python packages from requirements.txt and sends notifications
Run with: python scripts/check_dependencies.py
"""
import sys
import subprocess
from pathlib import Path
from datetime import datetime
import re

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from alerts import AlertManager


def get_required_packages():
    """Parse requirements.txt to get list of required packages."""
    req_file = Path(__file__).parent.parent / 'requirements.txt'
    packages = []

    if req_file.exists():
        with open(req_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    # Extract package name (before ==, >=, etc.)
                    match = re.match(r'^([a-zA-Z0-9_-]+)', line)
                    if match:
                        packages.append(match.group(1))
    return packages


def get_outdated_packages():
    """Check for outdated packages from requirements.txt using pip."""
    try:
        result = subprocess.run(
            ['pip', 'list', '--outdated', '--format=json'],
            capture_output=True,
            text=True,
            check=True
        )
        import json
        all_outdated = json.loads(result.stdout)

        # Filter to only packages in requirements.txt
        required = get_required_packages()
        required_lower = [p.lower() for p in required]

        filtered = [
            pkg for pkg in all_outdated
            if pkg['name'].lower() in required_lower
        ]

        return filtered
    except subprocess.CalledProcessError as e:
        print(f"Error checking packages: {e}")
        return []


def format_update_report(outdated):
    """Format a readable report of outdated packages."""
    if not outdated:
        return "✅ All packages are up to date!"

    report = f"📦 Package Updates Available ({len(outdated)})\n"
    report += "=" * 60 + "\n\n"

    for pkg in outdated:
        name = pkg['name']
        current = pkg['version']
        latest = pkg['latest_version']
        pkg_type = pkg.get('latest_filetype', 'wheel')

        report += f"• {name}\n"
        report += f"  Current: {current} → Latest: {latest}\n"
        report += f"  Update: pip install --upgrade {name}\n\n"

    report += "\nTo update all packages:\n"
    report += "pip install --upgrade " + " ".join([p['name'] for p in outdated])

    return report


def send_notification(alert_manager, outdated):
    """Send email notification about outdated packages."""
    if not alert_manager.config['email']['enabled']:
        print("Email notifications not enabled")
        return False

    subject = f"📦 {len(outdated)} Package Update(s) Available"
    message = format_update_report(outdated)

    success = alert_manager.send_email(
        subject=subject,
        body=message
    )

    if success:
        print("✅ Email notification sent")
    else:
        print("❌ Failed to send email notification")

    return success


def main():
    print(f"Checking for outdated packages... ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")

    outdated = get_outdated_packages()
    report = format_update_report(outdated)

    print("\n" + report + "\n")

    # Send email notification if there are updates
    if outdated:
        alert_manager = AlertManager()
        send_notification(alert_manager, outdated)

        # Exit with code 1 to indicate updates available (useful for monitoring)
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
