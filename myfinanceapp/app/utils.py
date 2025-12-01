"""
Utility functions for Finance Tracker
"""

def parse_amount(amount_str: str, allow_negative: bool = False) -> float:
    """
    Parse German-formatted amount string to float.

    Examples:
        "1 234,56" -> 1234.56
        "1.234,56" -> 1234.56
        "1234.56" -> 1234.56
        "1234,56" -> 1234.56

    Args:
        amount_str: The amount as a string (e.g., "1 234,56")
        allow_negative: Set to True if negative amounts are okay

    Returns:
        The amount as a float number

    Raises:
        ValueError: If the amount is invalid or negative when not allowed
    """
    if not amount_str or not isinstance(amount_str, str):
        raise ValueError("Amount is required and must be a string")

    try:
        # Remove all spaces (including special non-breaking spaces)
        cleaned = amount_str.strip()
        cleaned = cleaned.replace(" ", "")
        cleaned = cleaned.replace("\xa0", "")  # Non-breaking space
        cleaned = cleaned.replace("\u00A0", "")  # Unicode non-breaking space

        # Replace comma with period for decimal point
        cleaned = cleaned.replace(",", ".")

        # Convert to float
        amount = float(cleaned)

        # Check if negative amounts are allowed
        if not allow_negative and amount < 0:
            raise ValueError("Amount cannot be negative")

        return amount

    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid amount format: '{amount_str}'. Please use format like '1 234,56'") from e


def format_amount(amount: float, include_spaces: bool = True) -> str:
    """
    Format a number back to German format for display.

    Examples:
        1234.56 -> "1 234,56"
        1234.56 (no spaces) -> "1234,56"

    Args:
        amount: The number to format
        include_spaces: Whether to include spaces as thousand separators

    Returns:
        Formatted string
    """
    if include_spaces:
        # Format with spaces as thousand separator
        formatted = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    else:
        # Format without spaces
        formatted = f"{amount:.2f}".replace(".", ",")

    return formatted