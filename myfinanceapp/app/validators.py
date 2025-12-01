"""
Validation utilities for Finance Tracker.

Centralizes validation logic for consistent error handling across the application.
"""
from typing import Tuple, List, Dict, Any, Optional


def validate_amount(
    amount: float,
    field_name: str = "Amount",
    allow_zero: bool = False,
    allow_negative: bool = False,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None
) -> Tuple[bool, str]:
    """
    Validate amount value with configurable rules.

    Args:
        amount: The amount to validate
        field_name: Name of the field for error messages
        allow_zero: Whether zero is acceptable (default: False)
        allow_negative: Whether negative values are acceptable (default: False)
        min_value: Minimum allowed value (optional)
        max_value: Maximum allowed value (optional)

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if amount passes all validations
        - error_message: Empty string if valid, error description if invalid

    Examples:
        >>> validate_amount(100.0)
        (True, '')

        >>> validate_amount(0, allow_zero=True)
        (True, '')

        >>> validate_amount(-50)
        (False, 'Amount cannot be negative')

        >>> validate_amount(150, max_value=100)
        (False, 'Amount cannot exceed 100')
    """
    if amount is None:
        return False, f"{field_name} is required"

    if not allow_zero and amount == 0:
        return False, f"{field_name} cannot be zero"

    if not allow_negative and amount < 0:
        return False, f"{field_name} cannot be negative"

    if min_value is not None and amount < min_value:
        return False, f"{field_name} must be at least {min_value}"

    if max_value is not None and amount > max_value:
        return False, f"{field_name} cannot exceed {max_value}"

    return True, ""


def validate_required_fields(
    fields: Dict[str, Any],
    field_labels: Optional[Dict[str, str]] = None
) -> Tuple[bool, List[str]]:
    """
    Validate that all required fields have values.

    Args:
        fields: Dictionary of {field_name: value} to validate
        field_labels: Optional dictionary of {field_name: display_label} for better error messages

    Returns:
        Tuple of (all_valid, list_of_errors)
        - all_valid: True if all fields have values
        - list_of_errors: List of error messages (empty if all valid)

    Examples:
        >>> validate_required_fields({'name': 'John', 'age': 25})
        (True, [])

        >>> validate_required_fields({'name': '', 'age': None})
        (False, ['Name is required', 'Age is required'])

        >>> validate_required_fields(
        ...     {'account_name': ''},
        ...     {'account_name': 'Account Name'}
        ... )
        (False, ['Account Name is required'])
    """
    errors = []
    labels = field_labels or {}

    for field_name, value in fields.items():
        # Get display label (default to formatted field name)
        label = labels.get(field_name, field_name.replace('_', ' ').title())

        # Check if value is empty
        if value is None:
            errors.append(f"{label} is required")
        elif value == "":
            errors.append(f"{label} is required")
        elif isinstance(value, str) and not value.strip():
            errors.append(f"{label} is required")

    return len(errors) == 0, errors


def validate_date_range(
    start_date: str,
    end_date: str,
    start_label: str = "Start date",
    end_label: str = "End date"
) -> Tuple[bool, str]:
    """
    Validate that start_date is before or equal to end_date.

    Args:
        start_date: Start date string (ISO format)
        end_date: End date string (ISO format)
        start_label: Label for start date in error messages
        end_label: Label for end date in error messages

    Returns:
        Tuple of (is_valid, error_message)

    Examples:
        >>> validate_date_range('2024-01-01', '2024-12-31')
        (True, '')

        >>> validate_date_range('2024-12-31', '2024-01-01')
        (False, 'Start date must be before or equal to End date')
    """
    if not start_date or not end_date:
        return False, "Both dates are required"

    try:
        if start_date > end_date:
            return False, f"{start_label} must be before or equal to {end_label}"
        return True, ""
    except (ValueError, TypeError):
        return False, "Invalid date format"


def validate_positive_integer(
    value: int,
    field_name: str = "Value",
    min_value: int = 1
) -> Tuple[bool, str]:
    """
    Validate that value is a positive integer.

    Args:
        value: The value to validate
        field_name: Name of the field for error messages
        min_value: Minimum allowed value (default: 1)

    Returns:
        Tuple of (is_valid, error_message)

    Examples:
        >>> validate_positive_integer(5)
        (True, '')

        >>> validate_positive_integer(0)
        (False, 'Value must be at least 1')

        >>> validate_positive_integer(-5)
        (False, 'Value must be at least 1')
    """
    if value is None:
        return False, f"{field_name} is required"

    try:
        value = int(value)
        if value < min_value:
            return False, f"{field_name} must be at least {min_value}"
        return True, ""
    except (ValueError, TypeError):
        return False, f"{field_name} must be a valid integer"


def validate_email(email: str) -> Tuple[bool, str]:
    """
    Basic email validation.

    Args:
        email: Email address to validate

    Returns:
        Tuple of (is_valid, error_message)

    Examples:
        >>> validate_email('user@example.com')
        (True, '')

        >>> validate_email('invalid-email')
        (False, 'Invalid email format')

        >>> validate_email('')
        (False, 'Email is required')
    """
    if not email or not email.strip():
        return False, "Email is required"

    email = email.strip()

    # Basic email validation
    if '@' not in email or '.' not in email.split('@')[1]:
        return False, "Invalid email format"

    if email.count('@') != 1:
        return False, "Invalid email format"

    local, domain = email.split('@')
    if not local or not domain:
        return False, "Invalid email format"

    return True, ""


def validate_password_strength(
    password: str,
    min_length: int = 8,
    require_uppercase: bool = True,
    require_lowercase: bool = True,
    require_digit: bool = True,
    require_special: bool = False
) -> Tuple[bool, List[str]]:
    """
    Validate password strength with configurable requirements.

    Args:
        password: Password to validate
        min_length: Minimum password length
        require_uppercase: Require at least one uppercase letter
        require_lowercase: Require at least one lowercase letter
        require_digit: Require at least one digit
        require_special: Require at least one special character

    Returns:
        Tuple of (is_valid, list_of_errors)

    Examples:
        >>> validate_password_strength('StrongPass123')
        (True, [])

        >>> validate_password_strength('weak')
        (False, ['Password must be at least 8 characters', ...])
    """
    errors = []

    if not password:
        return False, ["Password is required"]

    if len(password) < min_length:
        errors.append(f"Password must be at least {min_length} characters")

    if require_uppercase and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")

    if require_lowercase and not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")

    if require_digit and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one digit")

    if require_special and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain at least one special character")

    return len(errors) == 0, errors
