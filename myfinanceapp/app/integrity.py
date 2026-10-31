"""
What can be wrong with the data, and the repairs for it.

Shared by scripts/check_integrity.py and the Data check on the Backup page. The
add-on gives no easy shell, so a repair that only exists as a script is one that
never gets run.
"""
import logging
import sqlite3
from typing import Any, Callable, Dict, List

from database import REFUNDS_MISSING_OWNER

logger = logging.getLogger(__name__)

#: A cent of rounding per row is not drift.
TOLERANCE = 0.015


def violations(conn):
    """Rows whose foreign key points at a missing parent.

    PRAGMA foreign_key_check reports (table, rowid, parent_table, fk_index)
    and runs regardless of whether enforcement is enabled.
    """
    return conn.execute("PRAGMA foreign_key_check").fetchall()


def delete_orphans(conn, rows):
    """Delete each offending row by its rowid, grouped per table."""
    by_table = {}
    for table, rowid, _parent, _fk in rows:
        # A row can violate several constraints at once; rowid dedupes it.
        by_table.setdefault(table, set()).add(rowid)

    deleted = {}
    for table, rowids in by_table.items():
        for rowid in rowids:
            conn.execute(f'DELETE FROM "{table}" WHERE rowid = ?', (rowid,))
        deleted[table] = len(rowids)
    return deleted


def _rows(conn, query, params=()):
    return [dict(row) for row in conn.execute(query, params).fetchall()]


def _ledger_rows(conn, ids):
    """The ledger rows behind a payment or trade, and how many are missing."""
    wanted = [row_id for row_id in ids if row_id]
    found = _rows(conn, f"""
        SELECT t.*, tt.category FROM transactions t
          JOIN transaction_types tt ON tt.id = t.type_id
         WHERE t.id IN ({','.join('?' * len(wanted))})
    """, wanted) if wanted else []
    return found, len(wanted) - len(found)


def _row_problems(rows, expected, date, what):
    """Whether rows still show the cash and date of what they belong to."""
    problems = []
    cash = sum(row['amount'] for row in rows)
    if abs(cash - expected) > TOLERANCE:
        problems.append(f"the ledger shows {abs(cash):.2f}, the {what} says {abs(expected):.2f}")
    for row in rows:
        if str(row['transaction_date'])[:10] != str(date)[:10]:
            problems.append(f"a ledger row is dated {row['transaction_date']}, the {what} {date}")
        if not row['confirmed']:
            problems.append("a ledger row is marked pending")
    return problems


def _loan_payment_problems(conn):
    problems = []
    for payment in _rows(conn, """
        SELECT dp.*, d.name AS debt_name FROM debt_payments dp
          JOIN debts d ON d.id = dp.debt_id ORDER BY dp.payment_date, dp.id
    """):
        subject = f"{payment['debt_name']}, payment of {payment['payment_date']}"
        total = payment['amount'] or payment['extra_payment'] or 0
        rows, missing = _ledger_rows(
            conn, (payment['transaction_id'], payment['principal_transaction_id']))
        found = _row_problems(rows, -total, payment['payment_date'], "payment")
        if missing or (not rows and total):
            found = ["its ledger rows are missing"]
        if len({row['account_id'] for row in rows}) > 1:
            found.append("its two ledger rows are on different accounts")
        if payment['principal_transaction_id'] and any(
                row['id'] == payment['principal_transaction_id'] and row['category'] != 'transfer'
                for row in rows):
            found.append("its capital row is no longer in a transfer category")
        problems += [{'kind': 'loan payment', 'subject': subject, 'problem': p} for p in found]
    return problems


def _trade_problems(conn):
    problems = []
    for trade in _rows(conn, """
        SELECT it.*, s.symbol, a.linked_account_id
          FROM investment_transactions it
          JOIN investment_holdings h ON h.id = it.holding_id
          JOIN securities s ON s.id = h.security_id
          JOIN accounts a ON a.id = h.account_id
         ORDER BY it.transaction_date, it.id
    """):
        subject = f"{trade['symbol']}, {trade['transaction_type']} of {trade['transaction_date']}"
        total, costs = trade['total_amount'] or 0, (trade['fees'] or 0) + (trade['tax'] or 0)
        expected = {'buy': -(total + costs), 'sell': total - costs}.get(trade['transaction_type'], total)
        rows, missing = _ledger_rows(
            conn, (trade['linked_transaction_id'], trade['gain_transaction_id']))
        found = _row_problems(rows, expected, trade['transaction_date'], "trade")
        if missing or (not rows and abs(expected) > TOLERANCE):
            found = ["its cash row is missing"]
        if any(row['account_id'] != trade['linked_account_id'] for row in rows):
            found.append("its cash row is not on the broker's linked account")
        problems += [{'kind': 'trade', 'subject': subject, 'problem': p} for p in found]
    return problems


def linked_row_problems(conn):
    """Loan payments, trades and loans whose rows no longer agree with each other.

    Expects sqlite3.Row rows. Only reads: which side is right is for the owner of
    the data to say.
    """
    problems = _loan_payment_problems(conn) + _trade_problems(conn)
    problems += [{'kind': 'loan', 'subject': debt['name'],
                  'problem': f"its balance is {debt['current_balance']:.2f}, below zero"}
                 for debt in _rows(conn, "SELECT * FROM debts WHERE current_balance < -0.005")]
    # Deleting a holding used to leave these behind, after reversing their cash.
    problems += [{'kind': 'left-over gain', 'subject': f"{row['transaction_date']} {row['destinataire']}",
                  'problem': f"a realised gain of {row['amount']:.2f} belongs to no trade"}
                 for row in _rows(conn, """
        SELECT t.transaction_date, t.destinataire, t.amount FROM transactions t
          JOIN transaction_types tt ON tt.id = t.type_id
          JOIN transaction_subtypes ts ON ts.id = t.subtype_id
         WHERE tt.name = 'Investment Income' AND ts.name = 'Realised Gain'
           AND t.id NOT IN (SELECT gain_transaction_id FROM investment_transactions
                             WHERE gain_transaction_id IS NOT NULL)
    """)]
    return problems


def upgrade_notes(conn):
    """What the upgrade changes in the numbers, as opposed to what is broken."""
    notes = []
    false_interest = _rows(conn, """
        SELECT COUNT(*) AS payments, COALESCE(SUM(interest_paid), 0) AS interest
          FROM debt_payments WHERE amount = 0 AND extra_payment > 0
    """)[0]
    if false_interest['payments']:
        notes.append(f"{false_interest['payments']} extra loan payment(s) carry false interest of "
                     f"{false_interest['interest']:.2f}: the upgrade clears it.")
    for debt in _rows(conn, """
        SELECT name, current_balance, currency FROM debts
         WHERE is_active = 0 AND current_balance > 0.005 ORDER BY name
    """):
        notes.append(f"Deleted loan \"{debt['name']}\" still shows {debt['current_balance']:.2f} "
                     f"{debt['currency']}: the upgrade removes it from net worth history.")
    refunds = len(conn.execute(REFUNDS_MISSING_OWNER).fetchall())
    if refunds:
        notes.append(f"{refunds} refund(s) count for the wrong owner: "
                     f"scripts/fix_refund_owners.py repairs them.")
    return notes


# ── Repairs ──────────────────────────────────────────────────────────────────

def find_old_loan_payments(db) -> List[Dict[str, Any]]:
    """Payments still carrying a single row for the whole instalment."""
    with db.db_connection(commit=False) as conn:
        return _rows(conn, """
            SELECT p.id, p.debt_id, p.transaction_id, p.payment_date,
                   p.amount, p.principal_paid, p.interest_paid, p.extra_payment,
                   d.name AS debt_name, d.currency, d.interest_rate,
                   t.account_id, t.amount AS row_amount, t.tags, t.owner_id
              FROM debt_payments p
              JOIN debts d ON d.id = p.debt_id
              JOIN transactions t ON t.id = p.transaction_id
             WHERE p.principal_transaction_id IS NULL
               AND p.transaction_id IS NOT NULL
               AND (SELECT tt.category FROM transaction_types tt WHERE tt.id = t.type_id) = 'expense'
               AND (SELECT tt.name FROM transaction_types tt WHERE tt.id = t.type_id) != 'Debt Interest'
             ORDER BY p.payment_date
        """)


def old_payment_split(payment: Dict[str, Any]):
    """(interest, capital) of an old payment. They add up to the cash that moved,
    even where the stored interest was more than the payment."""
    cash = round(abs(payment['row_amount']), 2)
    interest = min(round(payment['interest_paid'] or 0, 2), cash)
    return interest, round(cash - interest, 2)


def rebook_old_loan_payment(db, payment: Dict[str, Any]) -> None:
    """File one old payment as interest and capital, moving no money overall."""
    interest, capital = old_payment_split(payment)
    payment_type = 'extra' if payment['extra_payment'] else 'regular'
    is_extra = payment_type == 'extra'
    parts = [(part, amount) for part, amount in (('interest', interest), ('principal', capital)) if amount]
    categories = {part: db.get_or_create_debt_category(payment['debt_name'], payment_type, part)
                  for part, _amount in parts}

    with db.db_connection(commit=True) as conn:
        written = {}
        for part, amount in parts:
            type_id, subtype_id = categories[part]
            written[part] = db._add_transaction(conn, {
                'account_id': payment['account_id'],
                'transaction_date': payment['payment_date'],
                'amount': -abs(amount),
                'type_id': type_id,
                'subtype_id': subtype_id,
                'description': f"{'Extra' if is_extra else 'Monthly'} payment ({part}): {payment['debt_name']}",
                'destinataire': payment['debt_name'],
                'keep_recipient_spelling': True,
                'currency': payment['currency'] or 'EUR',
                'confirmed': True,
                'tags': payment['tags'] or ('Extra Debt Payment' if is_extra else 'Debt Payment'),
                'owner_id': payment['owner_id'],
            })
        # Point the payment at its new rows before removing the old one, so the
        # foreign key never dangles and the row is no longer locked.
        conn.execute(
            "UPDATE debt_payments SET transaction_id = ?, principal_transaction_id = ?, "
            "interest_paid = ? WHERE id = ?",
            (written.get('interest'), written.get('principal'), interest, payment['id']))
        # _delete_transaction, not a raw DELETE: the old row still counts against
        # the balance, and dropping it in SQL would debit the payment twice.
        db._delete_transaction(conn, payment['transaction_id'])


def repair_old_loan_payments(db) -> int:
    payments = find_old_loan_payments(db)
    for payment in payments:
        rebook_old_loan_payment(db, payment)
    return len(payments)


def find_old_sales(db) -> List[Dict[str, Any]]:
    """Sales still booked as income for the whole amount received."""
    with db.db_connection(commit=False) as conn:
        return _rows(conn, """
            SELECT it.id, it.holding_id, it.linked_transaction_id
              FROM investment_transactions it
              JOIN transactions t ON t.id = it.linked_transaction_id
              JOIN transaction_types tt ON tt.id = t.type_id
             WHERE it.transaction_type = 'sell' AND tt.category != 'transfer'
             ORDER BY it.transaction_date, it.id
        """)


def repair_old_sales(db) -> int:
    """Only the gain of a sale is income: the rest is your own money coming back."""
    sales = find_old_sales(db)
    if not sales:
        return 0
    db.ensure_investment_types_exist()
    with db.db_connection(commit=True) as conn:
        capital = conn.execute("""
            SELECT tt.id AS type_id, ts.id AS subtype_id
              FROM transaction_types tt JOIN transaction_subtypes ts ON ts.type_id = tt.id
             WHERE tt.name = 'Investments' AND ts.name = 'Securities Sale'
        """).fetchone()
        for sale in sales:
            conn.execute("UPDATE transactions SET type_id = ?, subtype_id = ? WHERE id = ?",
                         (capital['type_id'], capital['subtype_id'], sale['linked_transaction_id']))
        # Two rows that add up to the same cash, so no balance moves.
        for holding_id in {sale['holding_id'] for sale in sales}:
            db._resplit_sales(conn.cursor(), holding_id)
    return len(sales)


def repair_balances(db) -> int:
    """Clear flags the date contradicts, then rebuild balances from the ledger."""
    drifted = len(db.verify_balances())
    db.clear_stale_historical_flags()
    db.recalculate_all_balances()
    return drifted


def find_refunds_to_repair(db) -> List[Dict[str, Any]]:
    with db.db_connection(commit=False) as conn:
        return _rows(conn, REFUNDS_MISSING_OWNER)


def repair_refund_owners(db) -> int:
    refunds = find_refunds_to_repair(db)
    with db.db_connection(commit=True) as conn:
        for refund in refunds:
            conn.execute("UPDATE transactions SET owner_id = ? WHERE id = ?",
                         (refund['expense_owner_id'], refund['id']))
    return len(refunds)


def _dead_rows(db) -> List[Any]:
    conn = sqlite3.connect(db.db_path)
    try:
        return violations(conn)
    finally:
        conn.close()


def repair_dead_rows(db) -> int:
    """Delete rows pointing at something long gone. Enforcement stays off on this
    connection, and removing one row can leave another without its parent."""
    conn = sqlite3.connect(db.db_path)
    try:
        removed = 0
        rows = violations(conn)
        while rows:
            removed += sum(delete_orphans(conn, rows).values())
            rows = violations(conn)
        conn.commit()
        return removed
    finally:
        conn.close()


#: id -> (title, what it does, how many it applies to, the repair)
REPAIRS: Dict[str, Dict[str, Any]] = {
    'balances': {
        'title': 'Balances that disagree with their transactions',
        'detail': 'Rebuilds every balance from its transactions. Compare the account with your bank first.',
        'count': lambda db: len(db.verify_balances()),
        'apply': repair_balances,
    },
    'old_loan_payments': {
        'title': 'Old loan payments counted as spending',
        'detail': 'Files them as interest and capital, so only the interest is spending. No money moves.',
        'count': lambda db: len(find_old_loan_payments(db)),
        'apply': repair_old_loan_payments,
    },
    'old_sales': {
        'title': 'Old sales counted as income',
        'detail': 'Files them as capital and gain, so only the gain is income. No money moves.',
        'count': lambda db: len(find_old_sales(db)),
        'apply': repair_old_sales,
    },
    'refund_owners': {
        'title': 'Refunds counted for the wrong owner',
        'detail': 'Gives them the owner of the expense they pay back.',
        'count': lambda db: len(find_refunds_to_repair(db)),
        'apply': repair_refund_owners,
    },
    'dead_rows': {
        'title': 'Rows pointing at deleted records',
        'detail': 'Deletes them. They no longer show anywhere and change no total.',
        'count': lambda db: len({(row[0], row[1]) for row in _dead_rows(db)}),
        'apply': repair_dead_rows,
    },
}


def data_check(db) -> Dict[str, Any]:
    """Everything the Data check shows. Only reads."""
    conn = sqlite3.connect(db.db_path)
    conn.row_factory = sqlite3.Row
    try:
        problems = linked_row_problems(conn)
    finally:
        conn.close()
    return {
        'problems': problems,
        'balances': db.verify_balances(),
        'repairs': [{'id': key, 'title': r['title'], 'detail': r['detail'], 'count': r['count'](db)}
                    for key, r in REPAIRS.items()],
    }


def run_repair(db, repair: str) -> int:
    """Apply one repair by id. Returns how many it applied to."""
    if repair not in REPAIRS:
        raise ValueError(f"Unknown repair: {repair}")
    repaired = REPAIRS[repair]['apply'](db)
    logger.info(f"Data check repair {repair}: {repaired} applied")
    return repaired
