"""
Input validation.

validators.py sits at the boundary — amounts, dates, emails, password strength —
and was covered by nothing. These tests pin the rules that actually reject bad
input, including the boundaries where off-by-one errors live.

Run:
  cd app && PYTHONPATH=$PWD ../.venv-dev/bin/python -m pytest tests/test_validators.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from validators import (
    validate_amount,
    validate_date_range,
    validate_email,
    validate_password_strength,
    validate_positive_integer,
    validate_required_fields,
)


# ── passwords ────────────────────────────────────────────────────────────────

def test_a_strong_password_is_accepted():
    ok, errors = validate_password_strength("StrongPass123")
    assert ok and errors == []


@pytest.mark.parametrize("password, missing", [
    ("Sh0rt", "at least 8"),
    ("alllowercase1", "uppercase"),
    ("ALLUPPERCASE1", "lowercase"),
    ("NoDigitsHere", "digit"),
])
def test_weak_passwords_say_what_is_missing(password, missing):
    ok, errors = validate_password_strength(password)
    assert not ok
    assert any(missing in e for e in errors), errors


def test_an_empty_password_is_rejected():
    ok, errors = validate_password_strength("")
    assert not ok and errors == ["Password is required"]


def test_every_failing_rule_is_reported_not_just_the_first():
    """A user fixing one rule at a time is a bad experience."""
    ok, errors = validate_password_strength("abc")
    assert not ok
    assert len(errors) >= 3


def test_the_special_character_rule_is_opt_in():
    assert validate_password_strength("StrongPass123")[0] is True
    ok, errors = validate_password_strength("StrongPass123", require_special=True)
    assert not ok and any("special" in e for e in errors)


def test_minimum_length_is_inclusive():
    """Exactly min_length must pass — this is where off-by-one hides."""
    assert validate_password_strength("Abcdefg1", min_length=8)[0] is True
    assert validate_password_strength("Abcdef1", min_length=8)[0] is False


# ── emails ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("email", [
    "user@example.com", "first.last@sub.domain.org", "a+tag@example.co.uk",
])
def test_valid_emails_are_accepted(email):
    assert validate_email(email)[0] is True


@pytest.mark.parametrize("email", [
    "", "no-at-sign", "@no-local.com", "no-domain@", "spaces in@example.com",
])
def test_invalid_emails_are_rejected(email):
    assert validate_email(email)[0] is False


# ── amounts ──────────────────────────────────────────────────────────────────

def test_a_plain_amount_is_accepted():
    ok, error = validate_amount(100.50)
    assert ok and error == ""


def test_a_non_numeric_amount_is_rejected():
    assert validate_amount("not a number")[0] is False


def test_bounds_are_enforced():
    assert validate_amount(50, min_value=10, max_value=100)[0] is True
    assert validate_amount(5, min_value=10)[0] is False
    assert validate_amount(500, max_value=100)[0] is False


def test_negative_amounts_are_rejected_when_asked():
    assert validate_amount(-5, allow_negative=True)[0] is True
    assert validate_amount(-5, allow_negative=False)[0] is False


def test_zero_is_rejected_when_asked():
    assert validate_amount(0, allow_zero=True)[0] is True
    assert validate_amount(0, allow_zero=False)[0] is False


# ── dates ────────────────────────────────────────────────────────────────────

def test_a_well_ordered_range_is_accepted():
    assert validate_date_range("2026-01-01", "2026-12-31")[0] is True


def test_an_inverted_range_is_rejected():
    assert validate_date_range("2026-12-31", "2026-01-01")[0] is False


def test_the_same_day_twice_is_a_valid_range():
    assert validate_date_range("2026-06-15", "2026-06-15")[0] is True


def test_a_malformed_date_is_rejected():
    assert validate_date_range("15/06/2026", "2026-06-16")[0] is False


# ── integers and required fields ─────────────────────────────────────────────

def test_positive_integers():
    assert validate_positive_integer(5, "count")[0] is True
    assert validate_positive_integer(0, "count")[0] is False
    assert validate_positive_integer(-1, "count")[0] is False
    assert validate_positive_integer("abc", "count")[0] is False


def test_empty_required_fields_are_named():
    """Takes {field: value} and reports the ones with no value."""
    ok, errors = validate_required_fields(
        {"account_name": "Checking", "bank_name": "", "owner_name": None})
    assert not ok
    assert any("Bank Name" in e for e in errors)
    assert any("Owner Name" in e for e in errors)
    assert not any("Account Name" in e for e in errors)


def test_all_fields_filled_passes():
    assert validate_required_fields({"a": 1, "b": "x"})[0] is True


def test_custom_labels_are_used_in_errors():
    ok, errors = validate_required_fields(
        {"dest": ""}, field_labels={"dest": "Destinataire"})
    assert not ok and any("Destinataire" in e for e in errors)
