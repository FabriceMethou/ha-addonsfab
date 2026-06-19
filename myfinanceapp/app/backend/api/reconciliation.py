"""
Reconciliation API endpoints
CSV-based transaction reconciliation and matching
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sys
import os
import tempfile
import csv
import re
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User

router = APIRouter()

# Get database path from environment or use default
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
db = FinanceDatabase(db_path=DB_PATH)

# French month mapping for date parsing
FRENCH_MONTHS = {
    'janv.': 1, 'janvier': 1,
    'févr.': 2, 'février': 2, 'fevr.': 2, 'fevrier': 2,
    'mars': 3,
    'avr.': 4, 'avril': 4,
    'mai': 5,
    'juin': 6,
    'juil.': 7, 'juillet': 7,
    'août': 8, 'aout': 8,
    'sept.': 9, 'septembre': 9,
    'oct.': 10, 'octobre': 10,
    'nov.': 11, 'novembre': 11,
    'déc.': 12, 'décembre': 12, 'dec.': 12, 'decembre': 12
}


# Pydantic models
class ReconciliationComplete(BaseModel):
    account_id: int
    validation_date: str
    actual_balance: float
    matched_count: int
    added_count: int
    flagged_count: int


def parse_french_date(date_str: str) -> str:
    """
    Parse date to ISO format. Supports:
        ISO format:    '2026-02-01'       -> '2026-02-01'
        French format: '01 sept. 2025'    -> '2025-09-01'
        French format: '15 janvier 2025'  -> '2025-01-15'
    """
    date_str = date_str.strip()

    # ISO format: YYYY-MM-DD (also handles datetime like 2026-02-01T01:42:32Z)
    iso_match = re.match(r'^(\d{4}-\d{2}-\d{2})', date_str)
    if iso_match:
        return iso_match.group(1)

    parts = date_str.split()
    if len(parts) != 3:
        raise ValueError(f"Invalid date format: {date_str}")

    day = int(parts[0])
    month_str = parts[1].lower()
    year = int(parts[2])

    month = FRENCH_MONTHS.get(month_str)
    if not month:
        raise ValueError(f"Unknown French month: {month_str}")

    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_european_amount(amount_str: str) -> float:
    """
    Parse European format amount to float.
    Examples:
        '26,85 €' -> 26.85
        '1 000,50 €' -> 1000.50
        '-500,00 €' -> -500.00
        '1.000,50 €' -> 1000.50 (with dot as thousands separator)
    """
    if not amount_str:
        return 0.0

    # Remove currency symbol and whitespace
    cleaned = amount_str.replace('€', '').replace('\xa0', '').strip()

    # Handle negative amounts
    is_negative = '-' in cleaned
    cleaned = cleaned.replace('-', '')

    # Remove thousands separators (space or dot)
    cleaned = cleaned.replace(' ', '')

    # Handle case where dot is thousands separator (e.g., "1.000,50")
    if '.' in cleaned and ',' in cleaned:
        # Dot is thousands separator, comma is decimal
        cleaned = cleaned.replace('.', '')

    # Replace comma decimal separator with dot
    cleaned = cleaned.replace(',', '.')

    try:
        value = float(cleaned)
        return -value if is_negative else value
    except ValueError:
        raise ValueError(f"Could not parse amount: {amount_str}")


def parse_us_amount(amount_str: str) -> float:
    """
    Parse US/UK format amount (comma thousands, dot decimal) to float.
    Used for Revolut exports.
    Examples:
        '7.93'      -> 7.93
        '-26.04'    -> -26.04
        '3,552.42'  -> 3552.42
        '10000.00'  -> 10000.0
    """
    if not amount_str:
        return 0.0

    cleaned = amount_str.replace('€', '').replace('\xa0', '').replace(' ', '').strip()

    is_negative = cleaned.startswith('-')
    cleaned = cleaned.replace('-', '')

    # Remove thousands separators (comma); dot stays as decimal separator
    cleaned = cleaned.replace(',', '')

    try:
        value = float(cleaned)
        return -value if is_negative else value
    except ValueError:
        raise ValueError(f"Could not parse amount: {amount_str}")


def extract_recipient_from_description(description: str, transaction_type: str) -> Optional[str]:
    """
    Extract likely recipient from CSV description based on transaction type.
    """
    if not description:
        return None

    # Clean up the description
    cleaned = description.strip()

    # For transfers (Virement), often the name is in the description
    if transaction_type.lower() in ['virement', 'avoir']:
        # Take first meaningful words (often the name)
        words = cleaned.split()
        if len(words) >= 2:
            return ' '.join(words[:3])

    # For bank charges/debits, extract company name
    if 'prelevement' in transaction_type.lower():
        return cleaned[:50] if len(cleaned) > 50 else cleaned

    # Default: return first 50 chars of description
    return cleaned[:50] if len(cleaned) > 50 else cleaned


def parse_csv_rows(file_content: str, account_currency: Optional[str] = None) -> tuple:
    """
    Parse bank CSV content into normalized transactions, auto-detecting the layout
    from the header row.

    Supported layouts:
      - Trade Republic: lowercase `datetime`/`date`, `amount`, `balance`, `type`,
        `description` columns with European amounts (`26,85 €`).
      - Revolut: `Type, Product, Started Date, Completed Date, Description, Amount,
        Fee, Currency, State, Balance` with US amounts (`3552.42`).

    Revolut-specific handling:
      - Only `COMPLETED` rows are kept (PENDING/REVERTED/DECLINED rows haven't
        settled and aren't reflected in the Balance column).
      - The `Completed Date` (settlement) is used as the transaction date, falling
        back to `Started Date` when it's empty. Completed Date is what users record
        for Revolut transactions — month-boundary direct debits often start a few
        days before they settle, and the ledger entry lands on the settlement date.
      - The `Fee` column is ignored for matching: the per-transaction `Amount` is
        what the user typically records, and the `Balance` column already reflects
        fees for the ending-balance check.
      - Revolut exports a single file covering every product. When the export mixes
        the main `Current` account with a savings pot (which appears as
        `Product=Deposit`, e.g. "Instant Access Savings"), each inter-pot transfer
        shows up on both sides. To avoid phantom rows, only `Current` rows are kept
        when any exist; otherwise all rows are used (e.g. a savings-only export).
      - Rows whose `Currency` doesn't match the account currency are skipped.

    Returns (transactions, parse_errors). Transactions are NOT date-filtered.
    """
    from io import StringIO

    transactions = []
    parse_errors = []

    reader = csv.DictReader(StringIO(file_content))
    fieldnames = reader.fieldnames or []
    is_revolut = (
        'Started Date' in fieldnames
        and 'Completed Date' in fieldnames
        and 'Amount' in fieldnames
    )

    rows = list(reader)

    # For Revolut multi-product exports, prefer the main "Current" account rows.
    revolut_use_current_only = False
    if is_revolut:
        products = {(r.get('Product') or '').strip() for r in rows}
        revolut_use_current_only = 'Current' in products

    for row_idx, row in enumerate(rows):
        try:
            if is_revolut:
                state = (row.get('State') or '').strip().upper()
                if state and state != 'COMPLETED':
                    continue

                product = (row.get('Product') or '').strip()
                if revolut_use_current_only and product != 'Current':
                    continue

                row_currency = (row.get('Currency') or '').strip()
                if account_currency and row_currency and row_currency.upper() != account_currency.upper():
                    continue

                date_field = (row.get('Completed Date') or row.get('Started Date') or '').strip()
                amount_field = (row.get('Amount') or '').strip()
                balance_field = (row.get('Balance') or '').strip()
                tx_type = (row.get('Type') or '').strip()
                description = (row.get('Description') or '').strip()
                amount_parser = parse_us_amount
            else:
                # Trade Republic / generic: prefer 'datetime' (execution timestamp)
                # over 'date' (settlement/booking date) when both are present.
                datetime_field = (row.get('datetime') or '').strip()
                date_field = datetime_field if datetime_field else (row.get('date') or '').strip()
                amount_field = (row.get('amount') or '').strip()
                balance_field = (row.get('balance') or '').strip()
                tx_type = (row.get('type') or '').strip()
                description = (row.get('description') or '').strip()
                amount_parser = parse_european_amount

            if not date_field:
                parse_errors.append(f"Row {row_idx + 2}: Missing date")
                continue

            parsed_date = parse_french_date(date_field)

            if not amount_field:
                parse_errors.append(f"Row {row_idx + 2}: Missing amount")
                continue

            amount = amount_parser(amount_field)

            balance = None
            if balance_field:
                try:
                    balance = amount_parser(balance_field)
                except ValueError:
                    pass  # Balance parsing is optional

            transactions.append({
                'date': parsed_date,
                'original_date': date_field,
                'type': tx_type,
                'amount': amount,
                'balance': balance,
                'description': description,
                'suggested_recipient': extract_recipient_from_description(description, tx_type),
            })

        except ValueError as e:
            parse_errors.append(f"Row {row_idx + 2}: {str(e)}")
            continue

    return transactions, parse_errors


def match_transactions(csv_transactions: List[Dict], system_transactions: List[Dict]) -> Dict:
    """
    Match CSV transactions with system transactions.

    Matching strategy:
    - Primary match: Exact amount (0.01 tolerance) + exact date
    - Secondary match: Exact amount (0.01 tolerance) + date within ±2 days

    When dates don't match exactly, the match includes a date_mismatch indicator.
    """
    AMOUNT_TOLERANCE = 0.01
    DATE_TOLERANCE_DAYS = 2

    matched = []
    matched_system_ids = set()
    matched_csv_indices = set()

    def parse_date(date_str: str) -> datetime:
        """Parse ISO date string to datetime."""
        return datetime.strptime(date_str, '%Y-%m-%d')

    def days_difference(date1: str, date2: str) -> int:
        """Calculate absolute days difference between two ISO date strings."""
        d1 = parse_date(date1)
        d2 = parse_date(date2)
        return abs((d1 - d2).days)

    # First pass: exact amount + exact date matches
    for csv_idx, csv_tx in enumerate(csv_transactions):
        if csv_idx in matched_csv_indices:
            continue

        for sys_tx in system_transactions:
            if sys_tx['id'] in matched_system_ids:
                continue

            # Get system date
            sys_date = sys_tx.get('transaction_date') or sys_tx.get('date')
            csv_date = csv_tx['date']

            # Check exact amount match
            if abs(abs(sys_tx['amount']) - abs(csv_tx['amount'])) < AMOUNT_TOLERANCE:
                # Check exact date match
                if sys_date == csv_date:
                    matched.append({
                        'csv_index': csv_idx,
                        'system_id': sys_tx['id'],
                        'date_mismatch': False,
                        'csv_date': csv_date,
                        'system_date': sys_date,
                        'days_difference': 0
                    })
                    matched_system_ids.add(sys_tx['id'])
                    matched_csv_indices.add(csv_idx)
                    break

    # Second pass: exact amount + date within tolerance (for remaining unmatched)
    for csv_idx, csv_tx in enumerate(csv_transactions):
        if csv_idx in matched_csv_indices:
            continue

        best_match = None
        best_days_diff = DATE_TOLERANCE_DAYS + 1  # Start with invalid value

        for sys_tx in system_transactions:
            if sys_tx['id'] in matched_system_ids:
                continue

            # Get system date
            sys_date = sys_tx.get('transaction_date') or sys_tx.get('date')
            csv_date = csv_tx['date']

            # Check exact amount match
            if abs(abs(sys_tx['amount']) - abs(csv_tx['amount'])) < AMOUNT_TOLERANCE:
                # Check date within tolerance
                try:
                    days_diff = days_difference(csv_date, sys_date)
                    if days_diff <= DATE_TOLERANCE_DAYS and days_diff < best_days_diff:
                        best_match = sys_tx
                        best_days_diff = days_diff
                except (ValueError, TypeError):
                    continue

        if best_match is not None:
            sys_date = best_match.get('transaction_date') or best_match.get('date')
            matched.append({
                'csv_index': csv_idx,
                'system_id': best_match['id'],
                'date_mismatch': True,
                'csv_date': csv_tx['date'],
                'system_date': sys_date,
                'days_difference': best_days_diff
            })
            matched_system_ids.add(best_match['id'])
            matched_csv_indices.add(csv_idx)

    # Find unmatched
    missing_from_system = [i for i in range(len(csv_transactions)) if i not in matched_csv_indices]
    not_in_csv = [tx['id'] for tx in system_transactions if tx['id'] not in matched_system_ids]

    # Count exact vs date-mismatched
    exact_matches = sum(1 for m in matched if not m['date_mismatch'])
    date_mismatch_matches = sum(1 for m in matched if m['date_mismatch'])

    return {
        'matched': matched,
        'missing_from_system': missing_from_system,
        'not_in_csv': not_in_csv,
        'exact_matches': exact_matches,
        'date_mismatch_matches': date_mismatch_matches
    }


@router.post("/upload")
async def upload_csv(
    account_id: int,
    start_date: str,
    end_date: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload CSV file, parse it, and return comparison with system transactions.
    """
    # Validate account exists
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    # Save to temp file and parse
    csv_transactions = []
    parse_errors = []

    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv', mode='wb') as temp_file:
        temp_path = temp_file.name
        contents = await file.read()
        temp_file.write(contents)

    try:
        # Try different encodings
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
        file_content = None

        for encoding in encodings:
            try:
                with open(temp_path, 'r', encoding=encoding) as f:
                    file_content = f.read()
                break
            except UnicodeDecodeError:
                continue

        if file_content is None:
            raise HTTPException(status_code=400, detail="Could not decode CSV file")

        # Parse CSV
        lines = file_content.strip().split('\n')
        if len(lines) < 2:
            raise HTTPException(status_code=400, detail="CSV file appears to be empty")

        # Parse all rows (auto-detects Trade Republic vs Revolut layout), then
        # filter to the requested date range.
        all_transactions, parse_errors = parse_csv_rows(file_content, account.get('currency'))
        csv_transactions = [
            tx for tx in all_transactions
            if start_date <= tx['date'] <= end_date
        ]

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    # Get system transactions for the same period
    # This includes transactions directly on this account
    system_transactions = db.get_transactions({
        'account_id': account_id,
        'start_date': start_date,
        'end_date': end_date
    })

    # Also get incoming transfers (where transfer_account_id = this account)
    # These are transfers FROM other accounts TO this account
    # In the system, they're stored as negative on the source account
    # but for reconciliation, they appear as positive on the destination account
    incoming_transfers = db.get_transactions({
        'transfer_account_id': account_id,
        'start_date': start_date,
        'end_date': end_date
    })

    # Add incoming transfers to system_transactions with inverted amounts
    # Mark them so we can identify them later
    for transfer in incoming_transfers:
        # Create a virtual transaction representing the incoming side
        virtual_tx = {
            'id': transfer['id'],  # Same ID for reference
            'transaction_date': transfer.get('transaction_date') or transfer.get('date'),
            'amount': -transfer['amount'],  # Invert: -2000 becomes +2000
            'type_name': 'Transfer',
            'subtype_name': 'Incoming Transfer',
            'destinataire': transfer.get('destinataire'),
            'description': f"Transfer from {transfer.get('account_name', 'another account')}",
            'tags': transfer.get('tags'),
            'is_incoming_transfer': True,  # Mark as virtual incoming transfer
            'source_account_id': transfer.get('account_id'),
            'source_account_name': transfer.get('account_name'),
        }
        system_transactions.append(virtual_tx)

    # Perform matching
    match_result = match_transactions(csv_transactions, system_transactions)

    # Get CSV ending balance (from the last transaction by date)
    csv_ending_balance = None
    if csv_transactions:
        # Sort by date and get the last one with a balance
        sorted_txs = sorted(csv_transactions, key=lambda x: x['date'])
        for tx in reversed(sorted_txs):
            if tx['balance'] is not None:
                csv_ending_balance = tx['balance']
                break

    # Build detailed match info for debugging
    match_details = []
    for m in match_result['matched']:
        csv_tx = csv_transactions[m['csv_index']]
        sys_tx = next((t for t in system_transactions if t['id'] == m['system_id']), None)
        match_details.append({
            'csv_index': m['csv_index'],
            'csv_date': csv_tx['date'],
            'csv_amount': csv_tx['amount'],
            'csv_description': csv_tx.get('description', '')[:50],
            'system_id': m['system_id'],
            'system_date': sys_tx.get('transaction_date') or sys_tx.get('date') if sys_tx else None,
            'system_amount': sys_tx['amount'] if sys_tx else None,
            'system_destinataire': sys_tx.get('destinataire', '')[:50] if sys_tx else None,
            'date_mismatch': m['date_mismatch'],
            'days_difference': m['days_difference']
        })

    return {
        'csv_transactions': csv_transactions,
        'system_transactions': system_transactions,
        'matched': match_result['matched'],
        'match_details': match_details,  # Added for debugging
        'missing_from_system': match_result['missing_from_system'],
        'not_in_csv': match_result['not_in_csv'],
        'csv_ending_balance': csv_ending_balance,
        'parse_errors': parse_errors,
        'summary': {
            'total_csv': len(csv_transactions),
            'total_system': len(system_transactions),
            'matched': len(match_result['matched']),
            'exact_matches': match_result.get('exact_matches', 0),
            'date_mismatch_matches': match_result.get('date_mismatch_matches', 0),
            'missing': len(match_result['missing_from_system']),
            'extra': len(match_result['not_in_csv']),
            'parse_errors': len(parse_errors)
        }
    }


@router.post("/flag/{transaction_id}")
async def flag_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    Add 'needs-verification' tag to a transaction.
    """
    transaction = db.get_transaction(transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get existing tags and add new one
    existing_tags = transaction.get('tags', '') or ''
    tag_list = [t.strip() for t in existing_tags.split(',') if t.strip()]

    if 'needs-verification' not in tag_list:
        tag_list.append('needs-verification')

    new_tags = ', '.join(tag_list)

    # Update transaction with new tags
    success = db.update_transaction(transaction_id, {'tags': new_tags})
    if not success:
        raise HTTPException(status_code=400, detail="Failed to flag transaction")

    return {"message": "Transaction flagged for verification", "tags": new_tags}


@router.post("/complete")
async def complete_reconciliation(
    data: ReconciliationComplete,
    current_user: User = Depends(get_current_user)
):
    """
    Complete reconciliation by creating a balance validation record.
    """
    account = db.get_account(data.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Create validation record using existing API pattern
    system_balance = account['balance']
    notes = f"CSV Reconciliation: {data.matched_count} matched, {data.added_count} added, {data.flagged_count} flagged"

    validation_data = {
        'account_id': data.account_id,
        'validation_date': data.validation_date,
        'system_balance': system_balance,
        'actual_balance': data.actual_balance,
        'notes': notes
    }

    validation_id = db.add_balance_validation(validation_data)

    if not validation_id:
        raise HTTPException(status_code=400, detail="Failed to create validation record")

    return {
        "message": "Reconciliation completed",
        "validation_id": validation_id,
        "is_match": abs(data.actual_balance - system_balance) < 0.01,
        "difference": data.actual_balance - system_balance
    }
