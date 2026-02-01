"""
Authentication module for Finance Tracker
Handles user authentication, password hashing, session management, and MFA (future).
"""

import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import base64
import hmac
import struct
import time

# Optional: pyotp for TOTP MFA (install with: pip install pyotp)
try:
    import pyotp
    PYOTP_AVAILABLE = True
except ImportError:
    PYOTP_AVAILABLE = False


class AuthManager:
    """Manages user authentication, sessions, and MFA."""

    def __init__(self, db_path: str = "data/finance.db"):
        self.db_path = db_path
        self._ensure_auth_tables()

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_auth_tables(self):
        """Create authentication tables if they don't exist."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                is_active BOOLEAN DEFAULT 1,
                requires_password_change BOOLEAN DEFAULT 0,
                mfa_enabled BOOLEAN DEFAULT 0,
                mfa_secret TEXT,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Check if requires_password_change column exists (for migration)
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'requires_password_change' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN requires_password_change BOOLEAN DEFAULT 0")

        # Session tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Login history for audit
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT NOT NULL,
                success BOOLEAN NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                failure_reason TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        """)

        # MFA backup codes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mfa_backup_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                used BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        conn.commit()
        conn.close()

        # Create default admin user if no users exist
        self._ensure_default_admin()

    def _ensure_default_admin(self):
        """Create default admin user if no users exist."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Check if any users exist
        cursor.execute("SELECT COUNT(*) as count FROM users")
        result = cursor.fetchone()
        user_count = result['count']

        if user_count == 0:
            # Create default admin user
            salt = self._generate_salt()
            password_hash = self._hash_password("admin", salt)

            cursor.execute("""
                INSERT INTO users (username, email, password_hash, salt, role, requires_password_change)
                VALUES (?, ?, ?, ?, ?, ?)
            """, ("admin", "admin@localhost", password_hash, salt, "admin", 1))
            conn.commit()

        conn.close()

    # ========== Password Hashing ==========

    def _generate_salt(self) -> str:
        """Generate a random salt for password hashing."""
        return secrets.token_hex(32)

    def _hash_password(self, password: str, salt: str) -> str:
        """Hash password with salt using SHA-256 + PBKDF2."""
        # Using PBKDF2 with SHA-256, 100k iterations
        password_bytes = password.encode('utf-8')
        salt_bytes = salt.encode('utf-8')

        # PBKDF2 implementation using hashlib
        dk = hashlib.pbkdf2_hmac('sha256', password_bytes, salt_bytes, 100000)
        return base64.b64encode(dk).decode('utf-8')

    def _verify_password(self, password: str, salt: str, password_hash: str) -> bool:
        """Verify password against stored hash."""
        computed_hash = self._hash_password(password, salt)
        # Use constant-time comparison to prevent timing attacks
        return hmac.compare_digest(computed_hash, password_hash)

    # ========== User Management ==========

    def create_user(self, username: str, email: str, password: str, role: str = 'user', requires_password_change: bool = True) -> Tuple[bool, str]:
        """
        Create a new user account.
        By default, new users are required to change password on first login.
        Returns (success, message).
        """
        if len(password) < 8:
            return False, "Password must be at least 8 characters long"

        if not username or len(username) < 3:
            return False, "Username must be at least 3 characters long"

        if '@' not in email or '.' not in email:
            return False, "Invalid email format"

        salt = self._generate_salt()
        password_hash = self._hash_password(password, salt)

        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO users (username, email, password_hash, salt, role, requires_password_change)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (username.lower(), email.lower(), password_hash, salt, role, requires_password_change))
            conn.commit()
            user_id = cursor.lastrowid
            conn.close()
            return True, f"User created successfully with ID {user_id}"
        except sqlite3.IntegrityError as e:
            conn.close()
            if 'username' in str(e):
                return False, "Username already exists"
            elif 'email' in str(e):
                return False, "Email already exists"
            return False, f"Database error: {str(e)}"

    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, role, is_active, mfa_enabled,
                   last_login, created_at, failed_login_attempts, locked_until
            FROM users WHERE id = ?
        """, (user_id,))
        result = cursor.fetchone()
        conn.close()

        if result:
            return dict(result)
        return None

    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get user by username (for internal use, includes sensitive data)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username.lower(),))
        result = cursor.fetchone()
        conn.close()

        if result:
            return dict(result)
        return None

    def update_user_password(self, user_id: int, new_password: str, clear_password_change_requirement: bool = True) -> Tuple[bool, str]:
        """Update user password and optionally clear password change requirement."""
        if len(new_password) < 8:
            return False, "Password must be at least 8 characters long"

        salt = self._generate_salt()
        password_hash = self._hash_password(new_password, salt)

        conn = self._get_connection()
        cursor = conn.cursor()

        if clear_password_change_requirement:
            cursor.execute("""
                UPDATE users
                SET password_hash = ?, salt = ?, requires_password_change = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (password_hash, salt, user_id))
        else:
            cursor.execute("""
                UPDATE users
                SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (password_hash, salt, user_id))

        conn.commit()
        affected = cursor.rowcount
        conn.close()

        if affected > 0:
            return True, "Password updated successfully"
        return False, "User not found"

    def list_users(self) -> list:
        """List all users (admin function)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, role, is_active, mfa_enabled,
                   last_login, created_at, failed_login_attempts
            FROM users ORDER BY created_at DESC
        """)
        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]

    def update_user(self, user_id: int, email: str = None, role: str = None) -> Tuple[bool, str]:
        """Update user email and/or role."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Build update query dynamically based on what's provided
        updates = []
        params = []

        if email is not None:
            if '@' not in email or '.' not in email:
                return False, "Invalid email format"
            updates.append("email = ?")
            params.append(email.lower())

        if role is not None:
            if role not in ['admin', 'user']:
                return False, "Invalid role. Must be 'admin' or 'user'"
            updates.append("role = ?")
            params.append(role)

        if not updates:
            return False, "No fields to update"

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(user_id)

        try:
            cursor.execute(f"""
                UPDATE users
                SET {', '.join(updates)}
                WHERE id = ?
            """, params)
            conn.commit()
            affected = cursor.rowcount
            conn.close()

            if affected > 0:
                return True, "User updated successfully"
            return False, "User not found"
        except sqlite3.IntegrityError as e:
            conn.close()
            if 'email' in str(e):
                return False, "Email already exists"
            return False, f"Database error: {str(e)}"

    def delete_user(self, user_id: int) -> bool:
        """Delete a user account."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0

    # ========== Authentication ==========

    def authenticate(self, username: str, password: str, ip_address: str = None,
                    user_agent: str = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Authenticate user with username and password.
        Returns (success, message, user_data).
        """
        user = self.get_user_by_username(username)

        if not user:
            self._log_login_attempt(None, username, False, ip_address, user_agent, "User not found")
            return False, "Invalid username or password", None

        # Check if account is locked
        if user['locked_until']:
            lock_time = datetime.fromisoformat(user['locked_until'])
            if datetime.now() < lock_time:
                minutes_left = int((lock_time - datetime.now()).total_seconds() / 60)
                return False, f"Account locked. Try again in {minutes_left} minutes", None
            else:
                # Unlock account
                self._reset_failed_attempts(user['id'])

        # Check if account is active
        if not user['is_active']:
            self._log_login_attempt(user['id'], username, False, ip_address, user_agent, "Account disabled")
            return False, "Account is disabled", None

        # Verify password
        if not self._verify_password(password, user['salt'], user['password_hash']):
            self._increment_failed_attempts(user['id'])
            self._log_login_attempt(user['id'], username, False, ip_address, user_agent, "Invalid password")

            # Lock account after 5 failed attempts
            if user['failed_login_attempts'] >= 4:  # This will be the 5th attempt
                self._lock_account(user['id'], minutes=15)
                return False, "Account locked due to too many failed attempts. Try again in 15 minutes", None

            return False, "Invalid username or password", None

        # Check if MFA is required
        if user['mfa_enabled']:
            # Return partial success - MFA verification needed
            self._reset_failed_attempts(user['id'])
            return True, "MFA_REQUIRED", {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'role': user['role'],
                'mfa_enabled': True,
                'mfa_required': True
            }

        # Full authentication success
        self._reset_failed_attempts(user['id'])
        self._update_last_login(user['id'])
        self._log_login_attempt(user['id'], username, True, ip_address, user_agent, None)

        user_data = {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'role': user['role'],
            'mfa_enabled': user['mfa_enabled'],
            'requires_password_change': user.get('requires_password_change', False)
        }

        return True, "Authentication successful", user_data

    def _increment_failed_attempts(self, user_id: int):
        """Increment failed login attempts counter."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET failed_login_attempts = failed_login_attempts + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_id,))
        conn.commit()
        conn.close()

    def _reset_failed_attempts(self, user_id: int):
        """Reset failed login attempts counter."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET failed_login_attempts = 0, locked_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_id,))
        conn.commit()
        conn.close()

    def _lock_account(self, user_id: int, minutes: int = 15):
        """Lock user account for specified minutes."""
        lock_until = datetime.now() + timedelta(minutes=minutes)
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET locked_until = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (lock_until.isoformat(), user_id))
        conn.commit()
        conn.close()

    def _update_last_login(self, user_id: int):
        """Update last login timestamp."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_id,))
        conn.commit()
        conn.close()

    def _log_login_attempt(self, user_id: Optional[int], username: str, success: bool,
                           ip_address: str = None, user_agent: str = None,
                           failure_reason: str = None):
        """Log login attempt for audit."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO login_history (user_id, username, success, ip_address, user_agent, failure_reason)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, username, success, ip_address, user_agent, failure_reason))
        conn.commit()
        conn.close()

    # ========== Session Management ==========

    def create_session(self, user_id: int, ip_address: str = None,
                      user_agent: str = None, expires_hours: int = 24) -> str:
        """Create a new session token for user."""
        session_token = secrets.token_urlsafe(64)
        expires_at = datetime.now() + timedelta(hours=expires_hours)

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_sessions (user_id, session_token, expires_at, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, session_token, expires_at.isoformat(), ip_address, user_agent))
        conn.commit()
        conn.close()

        return session_token

    def validate_session(self, session_token: str) -> Optional[Dict[str, Any]]:
        """Validate session token and return user data if valid."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.user_id, s.expires_at, u.username, u.email, u.role, u.is_active, u.mfa_enabled
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_token = ?
        """, (session_token,))
        result = cursor.fetchone()
        conn.close()

        if not result:
            return None

        # Check if session expired
        expires_at = datetime.fromisoformat(result['expires_at'])
        if datetime.now() > expires_at:
            self.invalidate_session(session_token)
            return None

        # Check if user is still active
        if not result['is_active']:
            return None

        return {
            'id': result['user_id'],
            'username': result['username'],
            'email': result['email'],
            'role': result['role'],
            'mfa_enabled': result['mfa_enabled']
        }

    def invalidate_session(self, session_token: str):
        """Invalidate a session token (logout)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE session_token = ?", (session_token,))
        conn.commit()
        conn.close()

    def invalidate_all_user_sessions(self, user_id: int):
        """Invalidate all sessions for a user."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()

    def cleanup_expired_sessions(self):
        """Remove all expired sessions from database."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE expires_at < ?", (datetime.now().isoformat(),))
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        return deleted

    # ========== MFA (Multi-Factor Authentication) ==========

    def setup_mfa(self, user_id: int) -> Tuple[bool, str, str]:
        """
        Setup MFA for user. Returns (success, secret, provisioning_uri).
        The provisioning URI can be used to generate QR code.
        """
        if not PYOTP_AVAILABLE:
            return False, "", "pyotp library not installed. Install with: pip install pyotp"

        user = self.get_user_by_id(user_id)
        if not user:
            return False, "", "User not found"

        # Generate secret
        secret = pyotp.random_base32()

        # Generate provisioning URI for QR code
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=user['email'],
            issuer_name="Finance Tracker"
        )

        # Store secret (will be activated after verification)
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET mfa_secret = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (secret, user_id))
        conn.commit()
        conn.close()

        return True, secret, provisioning_uri

    def verify_and_enable_mfa(self, user_id: int, totp_code: str) -> Tuple[bool, str]:
        """
        Verify TOTP code and enable MFA for user.
        Returns backup codes on success.
        """
        if not PYOTP_AVAILABLE:
            return False, "pyotp library not installed"

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT mfa_secret FROM users WHERE id = ?", (user_id,))
        result = cursor.fetchone()

        if not result or not result['mfa_secret']:
            conn.close()
            return False, "MFA not set up for this user"

        secret = result['mfa_secret']
        totp = pyotp.TOTP(secret)

        if not totp.verify(totp_code, valid_window=1):
            conn.close()
            return False, "Invalid TOTP code"

        # Enable MFA
        cursor.execute("""
            UPDATE users
            SET mfa_enabled = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_id,))

        # Generate backup codes
        backup_codes = []
        for _ in range(10):
            code = secrets.token_hex(4).upper()  # 8 character hex code
            backup_codes.append(code)
            code_hash = hashlib.sha256(code.encode()).hexdigest()
            cursor.execute("""
                INSERT INTO mfa_backup_codes (user_id, code_hash)
                VALUES (?, ?)
            """, (user_id, code_hash))

        conn.commit()
        conn.close()

        # Format backup codes for display
        codes_str = "\n".join([f"{i+1}. {code}" for i, code in enumerate(backup_codes)])
        return True, f"MFA enabled successfully!\n\nBackup codes (save these securely):\n{codes_str}"

    def verify_mfa_code(self, user_id: int, code: str) -> bool:
        """Verify MFA code (TOTP or backup code)."""
        if not PYOTP_AVAILABLE:
            return False

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?", (user_id,))
        result = cursor.fetchone()

        if not result or not result['mfa_enabled']:
            conn.close()
            return False

        # Try TOTP first
        secret = result['mfa_secret']
        totp = pyotp.TOTP(secret)
        if totp.verify(code, valid_window=1):
            conn.close()
            return True

        # Try backup code
        code_hash = hashlib.sha256(code.upper().encode()).hexdigest()
        cursor.execute("""
            SELECT id FROM mfa_backup_codes
            WHERE user_id = ? AND code_hash = ? AND used = 0
        """, (user_id, code_hash))
        backup_result = cursor.fetchone()

        if backup_result:
            # Mark backup code as used
            cursor.execute("""
                UPDATE mfa_backup_codes
                SET used = 1, used_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (backup_result['id'],))
            conn.commit()
            conn.close()
            return True

        conn.close()
        return False

    def disable_mfa(self, user_id: int) -> bool:
        """Disable MFA for user."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET mfa_enabled = 0, mfa_secret = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (user_id,))

        # Remove backup codes
        cursor.execute("DELETE FROM mfa_backup_codes WHERE user_id = ?", (user_id,))

        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0

    # ========== Login History ==========

    def get_login_history(self, user_id: int = None, limit: int = 50) -> list:
        """Get login history, optionally filtered by user."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if user_id:
            cursor.execute("""
                SELECT * FROM login_history
                WHERE user_id = ?
                ORDER BY timestamp DESC LIMIT ?
            """, (user_id, limit))
        else:
            cursor.execute("""
                SELECT * FROM login_history
                ORDER BY timestamp DESC LIMIT ?
            """, (limit,))

        results = cursor.fetchall()
        conn.close()
        return [dict(row) for row in results]
