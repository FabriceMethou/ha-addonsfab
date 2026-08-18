"""
Historical exchange rates.

Every conversion used the single current rate in currencies.exchange_rate_to_eur,
so a report over last year converted those transactions at today's rate. These
tests pin the rate that applied *on the transaction's own date*.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_exchange_rate_history.py -v
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase


@pytest.fixture
def db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    database = FinanceDatabase(db_path=f.name)
    yield database
    os.unlink(f.name)


def test_the_history_is_seeded_from_current_rates(db):
    """An empty history would make every lookup fall through to today's rate."""
    history = db.get_exchange_rate_history()
    assert history, "init should record a starting point for each currency"
    assert {h["code"] for h in history} >= {"EUR", "SEK", "DKK"}


def test_a_recorded_rate_is_used_for_that_date(db):
    db.record_exchange_rate("SEK", 0.100, "2025-01-01")
    db.record_exchange_rate("SEK", 0.080, "2026-01-01")

    assert db.get_rates_at("2025-06-15")["SEK"] == 0.100
    assert db.get_rates_at("2026-06-15")["SEK"] == 0.080


def test_the_most_recent_rate_on_or_before_the_date_wins(db):
    db.record_exchange_rate("SEK", 0.100, "2025-01-01")
    db.record_exchange_rate("SEK", 0.090, "2025-07-01")
    db.record_exchange_rate("SEK", 0.080, "2026-01-01")

    assert db.get_rates_at("2025-06-30")["SEK"] == 0.100
    assert db.get_rates_at("2025-07-01")["SEK"] == 0.090
    assert db.get_rates_at("2025-12-31")["SEK"] == 0.090


def test_dates_before_the_history_fall_back_to_the_oldest_rate(db):
    """Transactions older than the feature must still convert, not vanish."""
    db.record_exchange_rate("SEK", 0.100, "2025-01-01")
    assert db.get_rates_at("2019-03-01")["SEK"] == 0.100


def test_converting_uses_the_rate_of_the_transaction_date(db):
    db.record_exchange_rate("SEK", 0.100, "2025-01-01")
    db.record_exchange_rate("SEK", 0.080, "2026-01-01")

    # 1000 SEK at 0.10 is 100 EUR; the same amount a year later is 80 EUR.
    assert round(db.convert_at_date(1000, "SEK", "EUR", "2025-06-01"), 2) == 100.00
    assert round(db.convert_at_date(1000, "SEK", "EUR", "2026-06-01"), 2) == 80.00


def test_the_old_behaviour_is_what_changed(db):
    """Same amount, same date, different answer from the current-rate path."""
    db.record_exchange_rate("SEK", 0.050, "2020-01-01")
    db.update_currency("SEK", exchange_rate_to_eur=0.088)

    at_the_time = db.convert_at_date(1000, "SEK", "EUR", "2020-06-01")
    at_todays_rate = db.convert_currency(1000, "SEK", "EUR")

    assert round(at_the_time, 2) == 50.00
    assert round(at_todays_rate, 2) == 88.00
    assert at_the_time != at_todays_rate


def test_updating_a_rate_records_it(db):
    before = len(db.get_exchange_rate_history("SEK"))
    db.update_currency("SEK", exchange_rate_to_eur=0.077)
    after = db.get_exchange_rate_history("SEK")
    assert len(after) >= before
    assert after[0]["rate_to_eur"] == 0.077


def test_recording_twice_on_one_day_overwrites(db):
    db.record_exchange_rate("SEK", 0.100, "2025-01-01")
    db.record_exchange_rate("SEK", 0.110, "2025-01-01")
    rows = [h for h in db.get_exchange_rate_history("SEK")
            if h["effective_date"] == "2025-01-01"]
    assert len(rows) == 1
    assert rows[0]["rate_to_eur"] == 0.110


def test_same_currency_conversion_is_untouched(db):
    assert db.convert_at_date(123.45, "EUR", "EUR", "2020-01-01") == 123.45


# ── net worth currency ───────────────────────────────────────────────────────

def test_net_worth_uses_the_display_currency(db):
    """It used to read a separate 'dashboard_currency' defaulting to DKK, which
    no setting could change — so net worth was in a different unit from every
    other figure without saying so."""
    db.set_preference("display_currency", "SEK")
    owner = db.get_owners()[0]["id"]
    db.add_account({"name": "Cash", "owner_id": owner, "balance": 1000.0,
                    "currency": "EUR", "account_type": "checking"})

    assert db.get_net_worth()["currency"] == "SEK"


def test_changing_the_display_currency_changes_net_worth(db):
    owner = db.get_owners()[0]["id"]
    db.add_account({"name": "Cash", "owner_id": owner, "balance": 1000.0,
                    "currency": "EUR", "account_type": "checking"})

    db.set_preference("display_currency", "EUR")
    in_euros = db.get_net_worth()["net_worth"]

    db.set_preference("display_currency", "SEK")
    in_kronor = db.get_net_worth()["net_worth"]

    assert in_euros == 1000.0
    assert in_kronor > in_euros, "1000 EUR is more than 1000 SEK"
