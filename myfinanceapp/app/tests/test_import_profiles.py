"""
Configurable bank statement import.

The CSV parser recognised exactly two layouts, hard-coded from their header rows.
Anyone banking elsewhere could not import at all. A profile records once, per
bank, which column holds what — so the parser is told the layout instead of
having to recognise it.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_import_profiles.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from database import FinanceDatabase
from api.reconciliation import parse_csv_with_profile, parse_date_flexible


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


# A layout neither built-in parser knows: Nordic bank, semicolon-free, own names.
# Decimal commas must be quoted, or they become field separators.
NORDIC_CSV = """Bokføringsdato,Tekst,Beløb,Saldo
2026-01-15,NETTO KØBENHAVN,"-245,50","12.754,50"
2026-01-16,LØN JANUAR,"28.000,00","40.754,50"
2026-01-17,DSB REJSEKORT,"-120,00","40.634,50"
"""

NORDIC_PROFILE = {
    "column_map": {"date": "Bokføringsdato", "description": "Tekst",
                   "amount": "Beløb", "balance": "Saldo"},
    "amount_format": "european",
}


# ── the generic parser ───────────────────────────────────────────────────────

def test_a_mapped_file_parses_without_any_built_in_knowledge():
    rows, errors = parse_csv_with_profile(NORDIC_CSV, NORDIC_PROFILE)
    assert errors == []
    assert len(rows) == 3
    assert rows[0]["date"] == "2026-01-15"
    assert rows[0]["amount"] == -245.50
    assert rows[0]["description"] == "NETTO KØBENHAVN"


def test_the_running_balance_is_picked_up_when_mapped():
    rows, _ = parse_csv_with_profile(NORDIC_CSV, NORDIC_PROFILE)
    assert rows[0]["balance"] == 12754.50


def test_income_keeps_its_positive_sign():
    rows, _ = parse_csv_with_profile(NORDIC_CSV, NORDIC_PROFILE)
    assert rows[1]["amount"] == 28000.00


def test_only_date_and_amount_are_needed():
    """Everything else is optional — a bare two-column export must still work."""
    csv_text = "when,how much\n2026-03-01,-19.99\n"
    rows, errors = parse_csv_with_profile(
        csv_text, {"column_map": {"date": "when", "amount": "how much"},
                   "amount_format": "us"})
    assert errors == [] and len(rows) == 1
    assert rows[0]["amount"] == -19.99
    assert rows[0]["description"] == ""


def test_unsigned_exports_can_be_inverted():
    """Some banks export debits as positive numbers in a 'debit' column."""
    csv_text = "date,label,debit\n2026-03-01,RENT,850.00\n"
    rows, _ = parse_csv_with_profile(csv_text, {
        "column_map": {"date": "date", "description": "label", "amount": "debit"},
        "amount_format": "us", "invert_amount": True})
    assert rows[0]["amount"] == -850.00


def test_us_and_european_amounts_are_told_apart():
    us = parse_csv_with_profile("d,a\n2026-01-01,\"3,552.42\"\n",
                                {"column_map": {"date": "d", "amount": "a"},
                                 "amount_format": "us"})[0]
    eu = parse_csv_with_profile("d,a\n2026-01-01,\"3.552,42\"\n",
                                {"column_map": {"date": "d", "amount": "a"},
                                 "amount_format": "european"})[0]
    assert us[0]["amount"] == eu[0]["amount"] == 3552.42


def test_a_row_filter_drops_unsettled_rows():
    csv_text = ("date,label,amount,state\n"
                "2026-01-01,A,-10.00,COMPLETED\n"
                "2026-01-02,B,-20.00,PENDING\n"
                "2026-01-03,C,-30.00,COMPLETED\n")
    rows, _ = parse_csv_with_profile(csv_text, {
        "column_map": {"date": "date", "description": "label", "amount": "amount"},
        "amount_format": "us", "row_filter": {"state": ["COMPLETED"]}})
    assert [r["description"] for r in rows] == ["A", "C"]


def test_a_bad_row_is_reported_and_the_rest_still_import():
    csv_text = ("date,label,amount\n"
                "2026-01-01,Good,-10.00\n"
                "not-a-date,Bad,-20.00\n"
                "2026-01-03,AlsoGood,-30.00\n")
    rows, errors = parse_csv_with_profile(csv_text, {
        "column_map": {"date": "date", "description": "label", "amount": "amount"},
        "amount_format": "us"})
    assert len(rows) == 2
    assert len(errors) == 1 and "Row 3" in errors[0]


# ── date handling ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, expected", [
    ("2026-01-15", "2026-01-15"),
    ("2026-02-01T01:42:32Z", "2026-02-01"),
    ("15/01/2026", "2026-01-15"),
    ("15-01-2026", "2026-01-15"),
    ("15.01.2026", "2026-01-15"),
])
def test_common_date_layouts_are_understood(raw, expected):
    assert parse_date_flexible(raw) == expected


def test_an_explicit_pattern_wins_over_guessing():
    """Pin the format when a bank is American, or 03/04 is the wrong day."""
    assert parse_date_flexible("03/04/2026", "%m/%d/%Y") == "2026-03-04"
    assert parse_date_flexible("03/04/2026") == "2026-04-03"


def test_an_unparseable_date_is_rejected():
    with pytest.raises(ValueError):
        parse_date_flexible("sometime last tuesday")


# ── profiles are remembered ──────────────────────────────────────────────────

def test_a_profile_is_found_again_from_the_file_headers(db):
    db.save_import_profile({
        "name": "Danske Bank", "headers": list(NORDIC_PROFILE["column_map"].values()),
        "column_map": NORDIC_PROFILE["column_map"]})

    found = db.find_import_profile_by_headers(
        ["Bokføringsdato", "Tekst", "Beløb", "Saldo"])
    assert found is not None and found["name"] == "Danske Bank"


def test_reordered_or_recased_headers_still_match(db):
    """A bank shuffling its columns must not orphan the saved mapping."""
    db.save_import_profile({
        "name": "Danske Bank", "headers": ["Bokføringsdato", "Tekst", "Beløb", "Saldo"],
        "column_map": NORDIC_PROFILE["column_map"]})

    assert db.find_import_profile_by_headers(
        ["saldo", "BELØB", "Tekst", "bokføringsdato"]) is not None


def test_an_unknown_layout_matches_nothing(db):
    assert db.find_import_profile_by_headers(["foo", "bar"]) is None


def test_saving_under_an_existing_name_replaces_it(db):
    first = db.save_import_profile({
        "name": "My Bank", "headers": ["a", "b"],
        "column_map": {"date": "a", "amount": "b"}})
    second = db.save_import_profile({
        "name": "My Bank", "headers": ["a", "b", "c"],
        "column_map": {"date": "a", "amount": "b", "description": "c"}})

    assert first == second
    assert len(db.get_import_profiles()) == 1
    assert db.get_import_profile(first)["column_map"]["description"] == "c"


def test_a_profile_without_a_date_or_amount_is_refused(db):
    with pytest.raises(ValueError):
        db.save_import_profile({"name": "Broken", "headers": ["a"],
                                "column_map": {"description": "a"}})


def test_profiles_can_be_deleted(db):
    profile_id = db.save_import_profile({
        "name": "Temp", "headers": ["a", "b"],
        "column_map": {"date": "a", "amount": "b"}})
    assert db.delete_import_profile(profile_id) is True
    assert db.get_import_profiles() == []


def test_a_saved_profile_round_trips_through_the_parser(db):
    """The whole point: configure once, import that bank forever after."""
    profile_id = db.save_import_profile({
        "name": "Danske Bank", "headers": ["Bokføringsdato", "Tekst", "Beløb", "Saldo"],
        "column_map": NORDIC_PROFILE["column_map"], "amount_format": "european"})

    saved = db.get_import_profile(profile_id)
    rows, errors = parse_csv_with_profile(NORDIC_CSV, saved)

    assert errors == []
    assert [r["amount"] for r in rows] == [-245.50, 28000.00, -120.00]
