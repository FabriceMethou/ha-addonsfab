"""
Login page component for Finance Tracker.
Handles user authentication UI including login form and MFA verification.
"""

import streamlit as st
from auth import AuthManager


def show_login_page(auth_manager: AuthManager):
    """
    Display the login page with authentication form.
    Returns True if user is authenticated, False otherwise.
    """

    # Center the login form
    col1, col2, col3 = st.columns([1, 2, 1])

    with col2:
        st.markdown("""
            <div style="text-align: center; padding: 20px;">
                <h1>Finance Tracker</h1>
                <p style="color: #666;">Personal Finance Management</p>
            </div>
        """, unsafe_allow_html=True)

        # Check if we're in MFA verification mode
        if st.session_state.get('mfa_pending'):
            return _show_mfa_verification(auth_manager)

        # Check if user needs to change password
        if st.session_state.get('requires_password_change'):
            return _show_forced_password_change(auth_manager)

        # Login form
        with st.form("login_form", clear_on_submit=False):
            st.subheader("Login")

            username = st.text_input("Username", key="login_username")
            password = st.text_input("Password", type="password", key="login_password")

            login_button = st.form_submit_button("Login", use_container_width=True)

        # Handle login
        if login_button:
            if not username or not password:
                st.error("Please enter both username and password")
                return False

            success, message, user_data = auth_manager.authenticate(
                username=username,
                password=password
            )

            if success:
                if message == "MFA_REQUIRED":
                    # Store user ID for MFA verification
                    st.session_state.mfa_pending = True
                    st.session_state.mfa_user_id = user_data['id']
                    st.session_state.mfa_username = user_data['username']
                    st.rerun()
                else:
                    # Check if password change is required
                    if user_data.get('requires_password_change'):
                        st.session_state.requires_password_change = True
                        st.session_state.temp_user_id = user_data['id']
                        st.session_state.temp_username = user_data['username']
                        st.rerun()
                    else:
                        # Full authentication success
                        _complete_login(auth_manager, user_data)
                        st.success("Login successful!")
                        st.rerun()
            else:
                st.error(message)
                return False

        # Show forgot password link
        st.markdown("---")
        if st.button("Forgot Password?", use_container_width=True):
            st.info("Please contact your administrator to reset your password.")

    return False


def _show_mfa_verification(auth_manager: AuthManager):
    """Show MFA verification form."""
    col1, col2, col3 = st.columns([1, 2, 1])

    with col2:
        st.subheader("Two-Factor Authentication")
        st.info(f"Verifying login for: {st.session_state.get('mfa_username', 'Unknown')}")

        with st.form("mfa_form"):
            mfa_code = st.text_input(
                "Enter your 6-digit code",
                max_chars=8,  # Allow backup codes too
                help="Enter the code from your authenticator app or a backup code"
            )

            col_verify, col_cancel = st.columns(2)
            with col_verify:
                verify_button = st.form_submit_button("Verify", use_container_width=True)
            with col_cancel:
                cancel_button = st.form_submit_button("Cancel", use_container_width=True)

        if verify_button:
            if not mfa_code:
                st.error("Please enter the verification code")
                return False

            user_id = st.session_state.get('mfa_user_id')
            if auth_manager.verify_mfa_code(user_id, mfa_code.strip()):
                # MFA verification successful
                user_data = auth_manager.get_user_by_id(user_id)
                if user_data:
                    auth_manager._update_last_login(user_id)
                    _complete_login(auth_manager, user_data)
                    st.success("Login successful!")
                    _clear_mfa_state()
                    st.rerun()
            else:
                st.error("Invalid verification code")
                return False

        if cancel_button:
            _clear_mfa_state()
            st.rerun()

    return False


def _show_forced_password_change(auth_manager: AuthManager):
    """Show forced password change form."""
    st.subheader("Password Change Required")
    st.warning("⚠️ You must change your password before continuing.")

    user_id = st.session_state.get('temp_user_id')
    username = st.session_state.get('temp_username')

    if not user_id:
        st.error("Session error. Please login again.")
        st.session_state.requires_password_change = False
        st.rerun()
        return False

    st.info(f"Logged in as: **{username}**")

    with st.form("forced_password_change_form"):
        new_password = st.text_input(
            "New Password",
            type="password",
            help="At least 8 characters"
        )
        confirm_password = st.text_input(
            "Confirm New Password",
            type="password"
        )

        col_change, col_cancel = st.columns(2)
        with col_change:
            change_button = st.form_submit_button("Change Password", use_container_width=True, type="primary")
        with col_cancel:
            cancel_button = st.form_submit_button("Cancel", use_container_width=True)

    if change_button:
        if not all([new_password, confirm_password]):
            st.error("Please fill in all fields")
            return False

        if new_password != confirm_password:
            st.error("Passwords do not match")
            return False

        result, msg = auth_manager.update_user_password(user_id, new_password, clear_password_change_requirement=True)

        if result:
            st.success("Password changed successfully! Please login with your new password.")
            # Clear temporary session state
            st.session_state.pop('requires_password_change', None)
            st.session_state.pop('temp_user_id', None)
            st.session_state.pop('temp_username', None)
            st.rerun()
        else:
            st.error(msg)
            return False

    if cancel_button:
        # Clear temporary session state
        st.session_state.pop('requires_password_change', None)
        st.session_state.pop('temp_user_id', None)
        st.session_state.pop('temp_username', None)
        st.rerun()

    return False


def _complete_login(auth_manager: AuthManager, user_data: dict):
    """Complete the login process by setting session state."""
    # Create session token
    session_token = auth_manager.create_session(user_data['id'])

    # Store authentication state
    st.session_state.is_authenticated = True
    st.session_state.user_id = user_data['id']
    st.session_state.username = user_data['username']
    st.session_state.user_email = user_data['email']
    st.session_state.user_role = user_data['role']
    st.session_state.session_token = session_token
    st.session_state.mfa_enabled = user_data.get('mfa_enabled', False)

    # Clear any MFA pending state or password change requirement
    _clear_mfa_state()
    st.session_state.pop('requires_password_change', None)
    st.session_state.pop('temp_user_id', None)
    st.session_state.pop('temp_username', None)


def _clear_mfa_state():
    """Clear MFA pending state."""
    st.session_state.pop('mfa_pending', None)
    st.session_state.pop('mfa_user_id', None)
    st.session_state.pop('mfa_username', None)


def show_logout_button(auth_manager: AuthManager):
    """Display logout button in sidebar."""
    if st.session_state.get('is_authenticated'):
        st.sidebar.markdown("---")
        st.sidebar.markdown(f"**Logged in as:** {st.session_state.get('username', 'Unknown')}")

        if st.sidebar.button("Logout", use_container_width=True):
            logout(auth_manager)
            st.rerun()


def logout(auth_manager: AuthManager):
    """Logout the current user."""
    # Invalidate session token
    session_token = st.session_state.get('session_token')
    if session_token:
        auth_manager.invalidate_session(session_token)

    # Clear session state
    keys_to_clear = [
        'is_authenticated', 'user_id', 'username', 'user_email',
        'user_role', 'session_token', 'mfa_enabled',
        'mfa_pending', 'mfa_user_id', 'mfa_username', 'show_registration'
    ]
    for key in keys_to_clear:
        st.session_state.pop(key, None)


def check_authentication(auth_manager: AuthManager) -> bool:
    """
    Check if user is authenticated.
    Returns True if authenticated, False otherwise.
    """
    if not st.session_state.get('is_authenticated'):
        return False

    # Validate session token
    session_token = st.session_state.get('session_token')
    if not session_token:
        logout(auth_manager)
        return False

    user_data = auth_manager.validate_session(session_token)
    if not user_data:
        logout(auth_manager)
        return False

    # Update session state with current user data (in case it changed)
    st.session_state.username = user_data['username']
    st.session_state.user_email = user_data['email']
    st.session_state.user_role = user_data['role']
    st.session_state.mfa_enabled = user_data['mfa_enabled']

    return True


def show_user_settings(auth_manager: AuthManager):
    """Show user account settings (password change, MFA setup)."""
    st.subheader("Account Security")

    user_id = st.session_state.get('user_id')
    if not user_id:
        st.error("Not authenticated")
        return

    # Password change
    with st.expander("Change Password"):
        with st.form("change_password_form"):
            current_password = st.text_input("Current Password", type="password")
            new_password = st.text_input("New Password", type="password")
            confirm_new = st.text_input("Confirm New Password", type="password")

            if st.form_submit_button("Update Password"):
                if not all([current_password, new_password, confirm_new]):
                    st.error("Please fill in all fields")
                elif new_password != confirm_new:
                    st.error("New passwords do not match")
                else:
                    # Verify current password first
                    success, _, _ = auth_manager.authenticate(
                        st.session_state.get('username'),
                        current_password
                    )
                    if success or _ == "MFA_REQUIRED":
                        result, msg = auth_manager.update_user_password(user_id, new_password)
                        if result:
                            st.success(msg)
                        else:
                            st.error(msg)
                    else:
                        st.error("Current password is incorrect")

    # MFA settings
    with st.expander("Two-Factor Authentication"):
        mfa_enabled = st.session_state.get('mfa_enabled', False)

        if mfa_enabled:
            st.success("MFA is currently enabled")
            st.warning("Disabling MFA will make your account less secure")

            if st.button("Disable MFA"):
                if auth_manager.disable_mfa(user_id):
                    st.session_state.mfa_enabled = False
                    st.success("MFA disabled successfully")
                    st.rerun()
                else:
                    st.error("Failed to disable MFA")
        else:
            st.info("MFA is not enabled. Enable it for additional security.")

            if st.button("Setup MFA"):
                success, secret, uri_or_msg = auth_manager.setup_mfa(user_id)
                if success:
                    st.session_state.mfa_setup_secret = secret
                    st.session_state.mfa_setup_uri = uri_or_msg
                    st.rerun()
                else:
                    st.error(uri_or_msg)

            # Show QR code and verification if setup initiated
            if st.session_state.get('mfa_setup_secret'):
                st.markdown("### Setup Instructions")
                st.markdown("1. Install an authenticator app (Google Authenticator, Authy, etc.)")
                st.markdown("2. Scan this QR code or enter the secret manually:")

                # Show secret for manual entry
                st.code(st.session_state.get('mfa_setup_secret'))

                # QR code would need qrcode library - show URI for now
                st.markdown("**Provisioning URI (for QR code generators):**")
                st.code(st.session_state.get('mfa_setup_uri'))

                st.markdown("3. Enter the 6-digit code from your app to verify:")

                with st.form("verify_mfa_setup"):
                    verify_code = st.text_input("Verification Code", max_chars=6)
                    if st.form_submit_button("Verify and Enable MFA"):
                        if verify_code:
                            success, message = auth_manager.verify_and_enable_mfa(user_id, verify_code)
                            if success:
                                st.session_state.mfa_enabled = True
                                st.session_state.pop('mfa_setup_secret', None)
                                st.session_state.pop('mfa_setup_uri', None)
                                st.success("MFA enabled!")
                                st.code(message)
                                st.warning("Save these backup codes securely. They can only be used once.")
                            else:
                                st.error(message)
                        else:
                            st.error("Please enter the verification code")
