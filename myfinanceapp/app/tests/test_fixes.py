"""
Tests for all fixes applied to myfinanceapp.
Run:
  cd /home/fab/Documents/Dev/ha-addonsfab/myfinanceapp/app
  PYTHONPATH=. /home/fab/Documents/Dev/myfinanceapp/backend/venv/bin/python3 \
    -m pytest tests/test_fixes.py -v --tb=short
"""
import sys, os, tempfile, sqlite3
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import FinanceDatabase

# ── helpers ──────────────────────────────────────────────────────────────────

def make_db() -> FinanceDatabase:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    return FinanceDatabase(db_path=f.name)


def owner_id(db):
    return db.get_owners()[0]["id"]


def add_account(db, name="Checking", balance=1000.0, currency="EUR"):
    return db.add_account({
        "name": name,
        "owner_id": owner_id(db),
        "balance": balance,
        "currency": currency,
        "account_type": "checking",
    })


def type_ids(db, category="expense"):
    with db.db_connection(commit=False) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT tt.id, ts.id FROM transaction_types tt "
            "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
            "WHERE tt.category = ? LIMIT 1",
            (category,)
        )
        row = cur.fetchone()
        return row[0], row[1]


def add_txn(db, acc_id, amount, date_str, category="expense",
            confirmed=True, is_historical=False, transfer_account_id=None):
    tid, sid = type_ids(db, category)
    data = {
        "account_id": acc_id,
        "amount": amount,
        "transaction_date": date_str,
        "currency": "EUR",
        "type_id": tid,
        "subtype_id": sid,
        "description": "test",
        "destinataire": "",
        "tags": "",
        "confirmed": confirmed,
        "is_historical": is_historical,
        "is_transfer": transfer_account_id is not None,
    }
    if transfer_account_id is not None:
        data["transfer_account_id"] = transfer_account_id
    return db.add_transaction(data)


def make_debt(db, principal=10000.0, balance=8000.0, rate=5.0):
    acc_id = add_account(db, f"Debt account {principal}")
    with db.db_connection(commit=True) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO debts (name, principal_amount, current_balance, interest_rate, "
            "interest_type, monthly_payment, payment_day, start_date, currency, linked_account_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("Test Loan", principal, balance, rate, "compound", 300.0, 1,
             "2020-01-01", "EUR", acc_id)
        )
        return cur.lastrowid, acc_id


# ── P1-A: off-by-one in monthly summary ──────────────────────────────────────

class TestMonthlyOffByOne:
    def test_first_of_next_month_excluded(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -50.0, "2025-03-15")   # March
        add_txn(db, acc, -30.0, "2025-04-01")   # Should NOT be in March

        s = db.get_monthly_summary(2025, 3)
        assert s["total_expenses"] == 50.0, (
            f"April-1 leaked into March: expected 50 got {s['total_expenses']}"
        )

    def test_last_day_of_month_included(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -70.0, "2025-03-31")
        s = db.get_monthly_summary(2025, 3)
        assert s["total_expenses"] == 70.0

    def test_december_boundary(self):
        db = make_db()
        acc = add_account(db)
        add_txn(db, acc, -100.0, "2025-12-31")
        add_txn(db, acc, -20.0,  "2026-01-01")
        s = db.get_monthly_summary(2025, 12)
        assert s["total_expenses"] == 100.0, (
            f"Jan-1 leaked into December: expected 100 got {s['total_expenses']}"
        )



# ── P1-C: extra debt payment math ────────────────────────────────────────────

class TestExtraDebtPayment:
    def test_extra_payment_zero_interest(self):
        db = make_db()
        debt_id, _ = make_debt(db)
        db.add_debt_payment({
            "debt_id": debt_id,
            "payment_date": "2025-03-01",
            "amount": 500.0,
            "payment_type": "extra",
            "extra_payment": 500.0,
        })
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT interest_paid, amount FROM debt_payments WHERE debt_id=?",
                (debt_id,)
            )
            row = cur.fetchone()
        assert row["interest_paid"] == 0, (
            f"Extra payment must have interest=0, got {row['interest_paid']}"
        )
        assert row["amount"] > 0, (
            "amount must not be 0 for extra payment"
        )

    def test_regular_payment_has_interest(self):
        db = make_db()
        debt_id, _ = make_debt(db, rate=5.0)
        db.add_debt_payment({
            "debt_id": debt_id,
            "payment_date": "2025-03-01",
            "amount": 300.0,
            "payment_type": "regular",
        })
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT interest_paid FROM debt_payments WHERE debt_id=?",
                (debt_id,)
            )
            row = cur.fetchone()
        assert row["interest_paid"] > 0, "Regular payment on 5% loan must have interest > 0"


# ── P1-D: no duplicate securities methods ────────────────────────────────────

class TestSecuritiesMethods:
    def test_add_and_get_returns_dict(self):
        db = make_db()
        db.ensure_investment_types_exist()
        sec_id = db.add_security({
            "symbol": "AAPL",
            "name": "Apple Inc",
            "isin": "US0378331005",
            "investment_type": "stock",
            "currency": "USD",
        })
        assert isinstance(sec_id, int)
        secs = db.get_securities()
        s = next((x for x in secs if x["symbol"] == "AAPL"), None)
        assert s is not None
        assert isinstance(s, dict), f"Expected dict, got {type(s)}"
        assert s.get("name") == "Apple Inc"

    def test_all_methods_callable(self):
        db = make_db()
        for m in ("get_securities", "get_security", "add_security",
                  "update_security", "delete_security"):
            assert callable(getattr(db, m, None)), f"{m} not callable"


# ── P2-C: budget mid-month start ──────────────────────────────────────────────

class TestBudgetMidMonthStart:
    def test_budget_starting_mid_month_included(self):
        db = make_db()
        tid, _ = type_ids(db)
        # Budget starts March 15 — must appear in March report
        with db.db_connection(commit=True) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO budgets (type_id, amount, currency, period, start_date, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (tid, 200.0, "EUR", "monthly", "2025-03-15", 1)
            )
        result = db.get_budget_vs_actual(2025, 3)
        cats = result.get("categories", result) if isinstance(result, dict) else result
        total = sum(b.get("budget", b.get("amount", 0)) for b in cats)
        assert total > 0, "Budget starting mid-month must appear in that month's report"

    def test_budget_starting_next_month_excluded(self):
        db = make_db()
        tid, _ = type_ids(db)
        # Budget starts April 1 — must NOT appear in March report
        with db.db_connection(commit=True) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO budgets (type_id, amount, currency, period, start_date, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (tid, 300.0, "EUR", "monthly", "2025-04-01", 1)
            )
        result = db.get_budget_vs_actual(2025, 3)
        cats = result.get("categories", result) if isinstance(result, dict) else result
        total = sum(b.get("budget", b.get("amount", 0)) for b in cats)
        assert total == 0, (
            f"Budget starting April 1 must not be in March report, got {total}"
        )


# ── P2-D: update_transaction is_historical balance guard ─────────────────────

class TestUpdateTransactionIsHistorical:
    def test_marking_historical_restores_balance(self):
        db = make_db()
        acc = add_account(db, balance=1000.0)
        tx = add_txn(db, acc, -200.0, "2025-01-15", confirmed=True)

        accs = {a["id"]: a for a in db.get_accounts()}
        assert accs[acc]["balance"] == 800.0, "Balance should be 800 after confirmed expense"

        db.update_transaction(tx, {"is_historical": True})

        accs = {a["id"]: a for a in db.get_accounts()}
        assert accs[acc]["balance"] == 1000.0, (
            f"Marking historical must restore balance to 1000, got {accs[acc]['balance']}"
        )


# ── P2-H: debt payment notes ─────────────────────────────────────────────────

class TestDebtPaymentNotes:
    def test_notes_column_exists(self):
        db = make_db()
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA table_info(debt_payments)")
            cols = [r["name"] for r in cur.fetchall()]
        assert "notes" in cols, f"notes column missing; cols={cols}"

    def test_notes_stored_and_retrieved(self):
        db = make_db()
        debt_id, _ = make_debt(db)
        db.add_debt_payment({
            "debt_id": debt_id,
            "payment_date": "2025-03-15",
            "amount": 200.0,
            "payment_type": "regular",
            "notes": "Bonus payment from work",
        })
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT notes FROM debt_payments WHERE debt_id=?", (debt_id,)
            )
            row = cur.fetchone()
        assert row["notes"] == "Bonus payment from work", (
            f"Notes not persisted: {row['notes']}"
        )


# ── P3-A: mirror transfer_account_id sync ────────────────────────────────────

class TestMirrorTransferSync:
    def test_mirror_back_reference_updated(self):
        db = make_db()
        oid = owner_id(db)
        acc_a = add_account(db, "Account A", balance=2000.0)
        acc_b = add_account(db, "Account B", balance=500.0)
        acc_c = add_account(db, "Account C", balance=500.0)

        # Transfer A→B
        tx_id = add_txn(db, acc_a, -100.0, "2025-03-01",
                        category="transfer", transfer_account_id=acc_b)

        # Find the mirror transaction in acc_b
        mirror = next(
            (t for t in db.get_transactions({"account_id": acc_b})
             if t.get("transfer_account_id") == acc_a
             or t.get("linked_transfer_id") == tx_id),
            None
        )
        assert mirror is not None, "Mirror transaction not found"

        # Update source to acc_c
        db.update_transaction(tx_id, {"account_id": acc_c, "transfer_account_id": acc_b})

        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT transfer_account_id FROM transactions WHERE id=?",
                (mirror["id"],)
            )
            updated = cur.fetchone()

        assert updated["transfer_account_id"] == acc_c, (
            f"Mirror transfer_account_id should be acc_c={acc_c}, "
            f"got {updated['transfer_account_id']}"
        )


# ── P3-C: envelope transaction date defaults to today ────────────────────────

class TestEnvelopeTransactionDate:
    def test_date_defaults_to_today(self):
        db = make_db()
        acc = add_account(db)
        env_id = db.add_envelope({
            "name": "Vacation",
            "target_amount": 1000.0,
            "currency": "EUR",
        })
        db.add_envelope_transaction({
            "envelope_id": env_id,
            "account_id": acc,
            "amount": 50.0,
            "description": "contribution",
            "transaction_date": None,
        })
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT transaction_date FROM envelope_transactions WHERE envelope_id=?",
                (env_id,)
            )
            row = cur.fetchone()
        today = date.today().isoformat()
        assert row["transaction_date"] == today, (
            f"Expected today={today}, got {row['transaction_date']}"
        )


# ── P3-D: exchange rates map read-only ───────────────────────────────────────

class TestExchangeRatesMap:
    def test_returns_dict(self):
        db = make_db()
        rates = db.get_exchange_rates_map()
        assert isinstance(rates, dict)

    def test_no_unnecessary_write(self):
        """Verify get_exchange_rates_map uses commit=False by inspecting the source."""
        import inspect
        src = inspect.getsource(FinanceDatabase.get_exchange_rates_map)
        assert "commit=False" in src, (
            "get_exchange_rates_map must use db_connection(commit=False)"
        )


# ── P2-E: pagination falsy fix ────────────────────────────────────────────────

class TestPagination:
    def test_offset_zero_works(self):
        db = make_db()
        acc = add_account(db)
        for i in range(5):
            add_txn(db, acc, -(i + 1) * 10.0, f"2025-03-{i + 1:02d}")

        result = db.get_transactions({"limit": 2, "offset": 0})
        assert len(result) == 2, (
            f"limit=2 offset=0 must return 2 items, got {len(result)}"
        )

    def test_pages_do_not_overlap(self):
        db = make_db()
        acc = add_account(db)
        for i in range(5):
            add_txn(db, acc, -(i + 1) * 10.0, f"2025-03-{i + 1:02d}")

        p1 = {t["id"] for t in db.get_transactions({"limit": 2, "offset": 0})}
        p2 = {t["id"] for t in db.get_transactions({"limit": 2, "offset": 2})}
        assert p1.isdisjoint(p2), "Pages must not overlap"

    def test_limit_zero_returns_zero(self):
        db = make_db()
        acc = add_account(db)
        for i in range(3):
            add_txn(db, acc, -10.0, f"2025-03-{i + 1:02d}")
        result = db.get_transactions({"limit": 0})
        assert len(result) == 0, (
            f"limit=0 must return 0 items, got {len(result)}"
        )


# ── Investment category reclassification ──────────────────────────────────────

class TestInvestmentCategory:
    def test_investments_type_is_transfer(self):
        db = make_db()
        db.ensure_investment_types_exist()
        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT category FROM transaction_types WHERE name='Investments'"
            )
            row = cur.fetchone()
        assert row is not None
        assert row["category"] == "transfer", (
            f"'Investments' must be category='transfer', got '{row['category']}'"
        )

    def test_buy_excluded_from_monthly_expenses(self):
        db = make_db()
        db.ensure_investment_types_exist()
        acc = add_account(db, balance=10000.0)

        with db.db_connection(commit=False) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT tt.id, ts.id FROM transaction_types tt "
                "JOIN transaction_subtypes ts ON ts.type_id = tt.id "
                "WHERE tt.name='Investments' AND ts.name='Securities Purchase'"
            )
            row = cur.fetchone()
        assert row is not None, "Investments/Securities Purchase type not found"

        db.add_transaction({
            "account_id": acc,
            "amount": -500.0,
            "transaction_date": "2025-03-10",
            "currency": "EUR",
            "type_id": row[0],
            "subtype_id": row[1],
            "description": "Buy AAPL",
            "destinataire": "AAPL",
            "tags": "",
            "confirmed": True,
        })

        s = db.get_monthly_summary(2025, 3)
        assert s["total_expenses"] == 0.0, (
            f"Investment buy must not count as expense, got {s['total_expenses']}"
        )


# ── _init_database connection safety ─────────────────────────────────────────

class TestInitDatabase:
    def test_initializes_without_lock(self):
        f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        f.close()
        FinanceDatabase(db_path=f.name)
        # If connection leaked, this would raise "database is locked"
        conn = sqlite3.connect(f.name, timeout=1)
        conn.execute("SELECT 1")
        conn.close()
        os.unlink(f.name)

    def test_try_finally_in_source(self):
        """Confirm _init_database wraps its body in try/finally."""
        import inspect
        src = inspect.getsource(FinanceDatabase._init_database)
        assert "finally" in src, "_init_database must have try/finally for conn.close()"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v", "--tb=short"])
