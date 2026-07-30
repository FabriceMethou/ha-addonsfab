"""
Reports API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User
from predictions import SpendingPredictor

router = APIRouter()

# Get database path from environment or use default
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
db = FinanceDatabase(db_path=DB_PATH)

UNCATEGORIZED = 'Uncategorized'
NO_SUBCATEGORY = 'Other'


def _resolve_period(months_back: int, start_date: Optional[str], end_date: Optional[str]):
    """Resolve a report period to (range_start, range_end) datetimes.

    An explicit start/end pair always wins — that is how the "Custom Range"
    option on the Reports page is expressed. Otherwise the range runs from the
    first day of the month `months_back` months ago up to now.
    """
    if start_date and end_date:
        return (datetime.strptime(start_date, '%Y-%m-%d'),
                datetime.strptime(end_date, '%Y-%m-%d'))

    range_end = datetime.now()
    return (range_end - relativedelta(months=months_back)).replace(day=1), range_end


def _month_windows(range_start: datetime, range_end: datetime):
    """Split a range into per-month windows clipped to the range.

    Returns (calendar_month_start, window_start, window_end) tuples so labels
    read as whole calendar months while queries stay inside the requested range
    — a custom range starting mid-month must not pull in the earlier days.
    """
    windows = []
    cursor = range_start.replace(day=1)
    while cursor <= range_end:
        month_end = cursor + relativedelta(months=1) - timedelta(days=1)
        windows.append((cursor, max(cursor, range_start), min(month_end, range_end)))
        cursor += relativedelta(months=1)
    return windows


def _accumulate_category(breakdown: Dict[str, Any], transaction: Dict[str, Any], amount: float) -> None:
    """Add an amount to a category -> subcategory breakdown map.

    Reports aggregate on the full category hierarchy: the main category
    (transaction_types.name) and the subcategory (transaction_subtypes.name).
    """
    category = transaction.get('type_name') or UNCATEGORIZED
    subcategory = transaction.get('subtype_name') or NO_SUBCATEGORY

    entry = breakdown.setdefault(category, {'total': 0, 'subcategories': {}})
    entry['total'] += amount
    entry['subcategories'][subcategory] = entry['subcategories'].get(subcategory, 0) + amount


def _format_breakdown(breakdown: Dict[str, Any], amount_key: str = 'total') -> List[Dict[str, Any]]:
    """Format a breakdown map as a list sorted by amount, with nested subcategories."""
    return sorted(
        [
            {
                "category": category,
                amount_key: entry['total'],
                "subcategories": sorted(
                    [
                        {"category": subcategory, amount_key: sub_amount}
                        for subcategory, sub_amount in entry['subcategories'].items()
                    ],
                    key=lambda sub: sub[amount_key],
                    reverse=True
                )
            }
            for category, entry in breakdown.items()
        ],
        key=lambda cat: cat[amount_key],
        reverse=True
    )


@router.get("/net-worth")
async def net_worth(
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Calculate total net worth in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    accounts = db.get_accounts(owner_id=owner_id)
    debts = db.get_debts()

    # Filter debts by owner if specified
    if owner_id:
        debts = [d for d in debts if d.get('owner_id') == owner_id]

    # Convert all account balances to display currency
    total_assets = sum(
        db.convert_currency(a['balance'], a.get('currency', 'EUR'), display_currency)
        for a in accounts
    )

    # Convert all debt balances to display currency
    total_debts = sum(
        db.convert_currency(d['current_balance'], d.get('currency', 'EUR'), display_currency)
        for d in debts
    )

    return {
        "total_assets": total_assets,
        "total_debts": total_debts,
        "net_worth": total_assets - total_debts,
        "account_count": len(accounts),
        "debt_count": len(debts),
        "currency": display_currency,
        "owner_id": owner_id
    }

@router.get("/spending-by-category")
async def spending_by_category(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get spending breakdown by category in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    filters = {}
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date
    if owner_id:
        filters['owner_id'] = owner_id
    transactions = db.get_transactions(filters=filters if filters else None)

    # Group by category and subcategory (exclude transfers)
    category_spending = {}
    for t in transactions:
        if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
            # Convert transaction amount to display currency
            account_currency = t.get('account_currency', 'EUR')
            converted_amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)
            _accumulate_category(category_spending, t, converted_amount)

    return {
        "categories": _format_breakdown(category_spending),
        "total": sum(entry['total'] for entry in category_spending.values()),
        "currency": display_currency,
        "owner_id": owner_id
    }

@router.get("/income-vs-expenses")
async def income_vs_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get income vs expenses comparison in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    filters = {}
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date
    if owner_id:
        filters['owner_id'] = owner_id
    transactions = db.get_transactions(filters=filters if filters else None)

    # Convert all transactions to display currency
    # Exclude transfers from income/expense calculations
    income = sum(
        db.convert_currency(t['amount'], t.get('account_currency', 'EUR'), display_currency)
        for t in transactions if t['amount'] > 0 and t.get('category') != 'transfer'
    )
    expenses = sum(
        db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
        for t in transactions if t['amount'] < 0 and t.get('category') != 'transfer'
    )

    # Also group income by category and subcategory
    income_categories = {}
    for t in transactions:
        if t['amount'] > 0 and t.get('category') != 'transfer':  # Only income, exclude transfers
            account_currency = t.get('account_currency', 'EUR')
            converted_amount = db.convert_currency(t['amount'], account_currency, display_currency)
            _accumulate_category(income_categories, t, converted_amount)

    return {
        "income": income,
        "expenses": expenses,
        "net": income - expenses,
        "income_categories": _format_breakdown(income_categories),
        "start_date": start_date,
        "end_date": end_date,
        "currency": display_currency,
        "owner_id": owner_id
    }


@router.get("/spending-prediction")
async def spending_prediction(
    months_ahead: int = 1,
    current_user: User = Depends(get_current_user)
):
    """Predict spending for upcoming months"""
    try:
        display_currency = db.get_preference('display_currency', 'EUR')
        exchange_rates = db.get_exchange_rates_map()

        # All transactions are fetched and converted to display_currency in one step
        transactions = db.get_transactions_for_prediction(months=24, display_currency=display_currency)

        # Normalise budgets to display currency so _compare_with_budgets is accurate
        raw_budgets = db.get_budgets(include_inactive=False)
        budgets = []
        for b in raw_budgets:
            b_copy = dict(b)
            b_currency = b.get('currency', 'EUR')
            if b_currency != display_currency:
                b_copy['amount'] = db.convert_with_rates(
                    b['amount'], b_currency, display_currency, exchange_rates
                )
            budgets.append(b_copy)

        # Create predictor and predict
        predictor = SpendingPredictor(
            transactions=transactions,
            budgets=budgets
        )

        prediction = predictor.predict_monthly_spending(months_ahead=months_ahead)
        category_breakdown = predictor.predict_category_spending()

        return {
            "months_ahead": months_ahead,
            "prediction": {**prediction, "category_breakdown": category_breakdown},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.get("/net-worth/trend")
async def net_worth_trend(
    months: int = 12,
    owner_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get net worth trend over time in user's preferred currency.

    Uses the database's get_net_worth_trend method which properly handles:
    - Account opening dates (doesn't show balances before account existed)
    - Opening balances as starting point
    - Forward calculation from opening balance + transactions
    """
    try:
        # An explicit start/end pair (the "Custom Range" option) wins, otherwise
        # the range is the last `months` months up to now.
        if start_date and end_date:
            range_start, range_end = start_date, end_date
        else:
            now = datetime.now()
            range_start = (now - relativedelta(months=months)).strftime('%Y-%m-%d')
            range_end = now.strftime('%Y-%m-%d')

        # Use the database method that properly handles opening dates
        result = db.get_net_worth_trend(
            start_date=range_start,
            end_date=range_end,
            frequency='monthly',
            owner_id=owner_id
        )

        # Transform data to match expected API format (add 'month' display name)
        trends = []
        for item in result['data']:
            date_obj = datetime.strptime(item['date'], '%Y-%m-%d')
            trends.append({
                "date": item['date'],
                "month": date_obj.strftime('%B %Y'),
                "assets": item['assets'],
                "debts": item['debts'],
                "net_worth": item['net_worth']
            })

        # Get current net worth from last item
        current_net_worth = trends[-1]['net_worth'] if trends else 0

        return {
            "months": months,
            "start_date": range_start,
            "end_date": range_end,
            "trend": trends,
            "current_net_worth": current_net_worth,
            "currency": result['currency']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trend calculation failed: {str(e)}")

@router.get("/monthly-summary")
async def monthly_summary(
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get a comprehensive period summary in the user's preferred currency.

    Accepts either a year/month pair or an explicit start_date/end_date range
    (the "Custom Range" option on the Reports page).
    """
    try:
        # Get user's preferred display currency
        display_currency = db.get_preference('display_currency', 'EUR')

        if start_date and end_date:
            # Budget vs actual is defined per calendar month, so it has no
            # meaning for an arbitrary range.
            period_start, period_end = start_date, end_date
            budget_data = []
        elif year and month:
            period_start = datetime(year, month, 1).strftime('%Y-%m-%d')
            if month == 12:
                period_end = datetime(year + 1, 1, 1) - timedelta(days=1)
            else:
                period_end = datetime(year, month + 1, 1) - timedelta(days=1)
            period_end = period_end.strftime('%Y-%m-%d')
            budget_data = db.get_budget_vs_actual(year, month)
        else:
            raise HTTPException(
                status_code=400,
                detail="Provide either year and month, or start_date and end_date"
            )

        # Get transactions for the period
        filters = {'start_date': period_start, 'end_date': period_end}
        if owner_id:
            filters['owner_id'] = owner_id
        transactions = db.get_transactions(filters=filters)

        # Calculate totals with currency conversion (exclude transfers)
        income = sum(
            db.convert_currency(t['amount'], t.get('account_currency', 'EUR'), display_currency)
            for t in transactions if t['amount'] > 0 and t.get('category') != 'transfer'
        )
        expenses = sum(
            db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
            for t in transactions if t['amount'] < 0 and t.get('category') != 'transfer'
        )

        # Spending by category and subcategory with currency conversion (exclude transfers)
        category_spending = {}
        for t in transactions:
            if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
                converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
                _accumulate_category(category_spending, t, converted_amount)

        return {
            "year": year,
            "month": month,
            "start_date": period_start,
            "end_date": period_end,
            "income": income,
            "expenses": expenses,
            "net": income - expenses,
            "transaction_count": len(transactions),
            "budget_vs_actual": budget_data,
            "spending_by_category": _format_breakdown(category_spending, amount_key='amount'),
            "currency": display_currency
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary calculation failed: {str(e)}")

@router.get("/tags/{tag}")
async def tag_report(
    tag: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get detailed report for a specific tag in user's preferred currency"""
    try:
        # Get user's preferred display currency
        display_currency = db.get_preference('display_currency', 'EUR')

        # Build filters
        filters = {}
        if start_date:
            filters['start_date'] = start_date
        if end_date:
            filters['end_date'] = end_date

        # Get all transactions
        all_transactions = db.get_transactions(filters=filters if filters else None)

        # Filter transactions by tag
        tagged_transactions = [
            t for t in all_transactions
            if t.get('tags') and tag.lower() in [t.strip().lower() for t in t['tags'].split(',')]
        ]

        if not tagged_transactions:
            return {
                "tag": tag,
                "transaction_count": 0,
                "total_income": 0,
                "total_expenses": 0,
                "net": 0,
                "transactions": [],
                "spending_by_category": [],
                "distribution_by_account": [],
                "monthly_trend": [],
                "currency": display_currency
            }

        # Calculate summary metrics with currency conversion (exclude transfers)
        total_income = sum(
            db.convert_currency(t['amount'], t.get('account_currency', 'EUR'), display_currency)
            for t in tagged_transactions if t['amount'] > 0 and t.get('category') != 'transfer'
        )
        total_expenses = sum(
            db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
            for t in tagged_transactions if t['amount'] < 0 and t.get('category') != 'transfer'
        )

        # Spending by category and subcategory with currency conversion (exclude transfers)
        category_spending = {}
        for t in tagged_transactions:
            if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
                converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
                _accumulate_category(category_spending, t, converted_amount)

        # Distribution by account with currency conversion
        account_distribution = {}
        for t in tagged_transactions:
            account = t.get('account_name', 'Unknown')
            if account not in account_distribution:
                account_distribution[account] = 0
            converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
            account_distribution[account] += converted_amount

        # Monthly trend with currency conversion (exclude transfers)
        from collections import defaultdict
        monthly_data = defaultdict(lambda: {'income': 0, 'expenses': 0})
        for t in tagged_transactions:
            if t.get('category') == 'transfer':
                continue
            month_key = t['transaction_date'][:7]  # YYYY-MM
            converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
            if t['amount'] > 0:
                monthly_data[month_key]['income'] += converted_amount
            else:
                monthly_data[month_key]['expenses'] += converted_amount

        monthly_trend = [
            {
                "month": month,
                "income": data['income'],
                "expenses": data['expenses'],
                "net": data['income'] - data['expenses']
            }
            for month, data in sorted(monthly_data.items())
        ]

        return {
            "tag": tag,
            "transaction_count": len(tagged_transactions),
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net": total_income - total_expenses,
            "transactions": tagged_transactions,
            "spending_by_category": _format_breakdown(category_spending, amount_key='amount'),
            "distribution_by_account": [
                {"account": acc, "amount": amt}
                for acc, amt in sorted(account_distribution.items(), key=lambda x: x[1], reverse=True)
            ],
            "monthly_trend": monthly_trend,
            "currency": display_currency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tag report failed: {str(e)}")

@router.get("/spending-trends")
async def spending_trends(
    months: int = 6,
    category: Optional[str] = None,
    owner_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get spending trends by category over time in user's preferred currency.

    Covers the last `months` months, or an explicit start_date/end_date range
    (the "Custom Range" option on the Reports page).
    """
    try:
        # Get user's preferred display currency
        display_currency = db.get_preference('display_currency', 'EUR')

        range_start, range_end = _resolve_period(months, start_date, end_date)
        trends = []

        # Categories/subcategories seen across the whole period
        categories_set = set()
        subcategories_map = {}

        def build_month(
            month_start: datetime, period_start: datetime, period_end: datetime
        ) -> Dict[str, Any]:
            """Aggregate one month of spending by category and subcategory."""
            filters = {
                'start_date': period_start.strftime('%Y-%m-%d'),
                'end_date': period_end.strftime('%Y-%m-%d')
            }
            if owner_id:
                filters['owner_id'] = owner_id
            transactions = db.get_transactions(filters=filters)

            month_data = {
                "month": month_start.strftime('%B %Y'),
                "date": month_start.strftime('%Y-%m'),
                "categories": {},
                "subcategories": {}
            }

            total_expenses = 0
            total_income = 0
            for t in transactions:
                account_currency = t.get('account_currency', 'EUR')
                # Calculate expenses (exclude transfers)
                if t['amount'] < 0 and t.get('category') != 'transfer':
                    cat = t.get('type_name') or UNCATEGORIZED
                    subcat = t.get('subtype_name') or NO_SUBCATEGORY
                    categories_set.add(cat)
                    subcategories_map.setdefault(cat, set()).add(subcat)

                    # If filtering by category, only include that category
                    if category and cat != category:
                        continue

                    converted_amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)
                    month_data["categories"][cat] = month_data["categories"].get(cat, 0) + converted_amount
                    month_subcats = month_data["subcategories"].setdefault(cat, {})
                    month_subcats[subcat] = month_subcats.get(subcat, 0) + converted_amount
                    total_expenses += converted_amount

                # Calculate income (exclude transfers)
                elif t['amount'] > 0 and t.get('category') != 'transfer':
                    converted_amount = db.convert_currency(t['amount'], account_currency, display_currency)
                    total_income += converted_amount

            month_data["total_expenses"] = total_expenses
            month_data["total_income"] = total_income
            return month_data

        for month_start, window_start, window_end in _month_windows(range_start, range_end):
            trends.append(build_month(month_start, window_start, window_end))

        # Calculate trend direction (increasing/decreasing) for each category
        trend_analysis = {}
        if len(trends) >= 2:
            # Compare last month to first month
            first_month = trends[0]["categories"]
            last_month = trends[-1]["categories"]

            for cat in categories_set:
                first_val = first_month.get(cat, 0)
                last_val = last_month.get(cat, 0)

                if first_val == 0:
                    change = 100 if last_val > 0 else 0
                else:
                    change = ((last_val - first_val) / first_val) * 100

                trend_analysis[cat] = {
                    "change_percent": round(change, 1),
                    "direction": "increasing" if change > 5 else ("decreasing" if change < -5 else "stable"),
                    "first_month_value": first_val,
                    "last_month_value": last_val
                }

        return {
            "months": months,
            "start_date": range_start.strftime('%Y-%m-%d'),
            "end_date": range_end.strftime('%Y-%m-%d'),
            "category_filter": category,
            "trends": trends,
            "all_categories": sorted(list(categories_set)),
            "all_subcategories": {
                cat: sorted(subs) for cat, subs in subcategories_map.items()
            },
            "trend_analysis": trend_analysis,
            "currency": display_currency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spending trends failed: {str(e)}")

@router.get("/category-breakdown")
async def category_breakdown(
    type_id: int,
    months: int = 6,
    owner_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Detailed report for a single category: subcategory split and monthly trend.

    Args:
        type_id: The transaction type (main category) to report on
        months: Number of months to cover, ending with the current (partial) month
        owner_id: Optional owner filter
        start_date/end_date: Explicit range, overriding `months`
    """
    try:
        display_currency = db.get_preference('display_currency', 'EUR')

        with db.db_connection(commit=False) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, category FROM transaction_types WHERE id = ?",
                (type_id,)
            )
            type_row = cursor.fetchone()

        if not type_row:
            raise HTTPException(status_code=404, detail=f"Category {type_id} not found")

        # Month buckets, oldest first, ending with the current (partial) month
        range_start, range_end = _resolve_period(months - 1, start_date, end_date)
        windows = _month_windows(range_start, range_end)
        month_keys = [month_start.strftime('%Y-%m') for month_start, _, _ in windows]

        filters = {
            'start_date': range_start.strftime('%Y-%m-%d'),
            'end_date': range_end.strftime('%Y-%m-%d'),
            'type_id': type_id
        }
        if owner_id:
            filters['owner_id'] = owner_id
        transactions = db.get_transactions(filters=filters)

        # Aggregate by subcategory and by month. Amounts are absolute so income
        # and expense categories both read as a positive magnitude.
        subcategory_totals = {}
        monthly = {key: {'total': 0, 'subcategories': {}} for key in month_keys}
        total = 0

        for t in transactions:
            amount = db.convert_currency(
                abs(t['amount']), t.get('account_currency', 'EUR'), display_currency
            )
            subcategory = t.get('subtype_name') or NO_SUBCATEGORY

            entry = subcategory_totals.setdefault(
                subcategory, {'amount': 0, 'transaction_count': 0}
            )
            entry['amount'] += amount
            entry['transaction_count'] += 1
            total += amount

            month_key = t['transaction_date'][:7]
            if month_key in monthly:
                bucket = monthly[month_key]
                bucket['total'] += amount
                bucket['subcategories'][subcategory] = \
                    bucket['subcategories'].get(subcategory, 0) + amount

        subcategories = sorted(
            [
                {
                    "name": name,
                    "amount": data['amount'],
                    "transaction_count": data['transaction_count'],
                    "percentage": round(data['amount'] / total * 100, 1) if total else 0
                }
                for name, data in subcategory_totals.items()
            ],
            key=lambda s: s['amount'],
            reverse=True
        )

        monthly_trend = [
            {
                "date": key,
                "month": datetime.strptime(key, '%Y-%m').strftime('%b %Y'),
                "total": monthly[key]['total'],
                "subcategories": monthly[key]['subcategories']
            }
            for key in month_keys
        ]

        return {
            "category": {
                "id": type_row['id'],
                "name": type_row['name'],
                "kind": type_row['category']
            },
            "months": len(windows),
            "owner_id": owner_id,
            "start_date": range_start.strftime('%Y-%m-%d'),
            "end_date": range_end.strftime('%Y-%m-%d'),
            "currency": display_currency,
            "summary": {
                "total": total,
                "transaction_count": len(transactions),
                "monthly_average": total / len(windows) if windows else 0,
                "subcategory_count": len(subcategories)
            },
            "subcategories": subcategories,
            "monthly_trend": monthly_trend
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Category breakdown failed: {str(e)}")

@router.get("/year-by-year")
async def year_by_year_stats(
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get income/expense breakdown by category, entity (destinataire), and tag.

    Args:
        year: The year to get stats for
        month: Optional month (1-12) to filter to a specific month
        start_date/end_date: Explicit range, overriding year/month
            (the "Custom Range" option on the Reports page)
    """
    try:
        display_currency = db.get_preference('display_currency', 'EUR')

        # Get date range from the explicit range, the month, or the whole year
        if start_date and end_date:
            period_start, period_end = start_date, end_date
        elif year and month:
            period_start = f"{year}-{month:02d}-01"
            if month == 12:
                period_end = f"{year}-12-31"
            else:
                # Last day of the selected month
                next_month = datetime(year, month + 1, 1)
                last_day = (next_month - timedelta(days=1)).day
                period_end = f"{year}-{month:02d}-{last_day:02d}"
        elif year:
            period_start = f"{year}-01-01"
            period_end = f"{year}-12-31"
        else:
            raise HTTPException(
                status_code=400,
                detail="Provide either year, or start_date and end_date"
            )

        # Fetch all transactions for the period
        transactions = db.get_transactions({
            'start_date': period_start,
            'end_date': period_end
        })

        # Get year of first transaction
        first_trx_year = db.get_first_transaction_year()

        # Initialize aggregation dictionaries
        income_by_category = {}
        expense_by_category = {}
        income_by_entity = {}
        expense_by_entity = {}
        income_by_tag = {}
        expense_by_tag = {}

        total_income = 0
        total_expenses = 0

        for t in transactions:
            # Skip transfers
            if t.get('category') == 'transfer':
                continue

            # Currency conversion
            account_currency = t.get('account_currency', 'EUR')
            amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)

            category_name = t.get('type_name', 'Uncategorized')
            category_id = t.get('type_id')
            subtype_name = t.get('subtype_name', 'Other')
            subtype_id = t.get('subtype_id')
            entity = t.get('destinataire', '') or 'Unknown'
            tags_str = t.get('tags', '') or ''

            if t['category'] == 'income':
                total_income += amount

                # By category with subcategories
                if category_name not in income_by_category:
                    income_by_category[category_name] = {'id': category_id, 'amount': 0, 'subcategories': {}}
                income_by_category[category_name]['amount'] += amount

                # Track subcategory
                if subtype_name not in income_by_category[category_name]['subcategories']:
                    income_by_category[category_name]['subcategories'][subtype_name] = {'id': subtype_id, 'amount': 0}
                income_by_category[category_name]['subcategories'][subtype_name]['amount'] += amount

                # By entity
                income_by_entity[entity] = income_by_entity.get(entity, 0) + amount

                # By tag
                for tag in [t.strip() for t in tags_str.split(',') if t.strip()]:
                    income_by_tag[tag] = income_by_tag.get(tag, 0) + amount

            elif t['category'] == 'expense':
                total_expenses += amount

                # By category with subcategories
                if category_name not in expense_by_category:
                    expense_by_category[category_name] = {'id': category_id, 'amount': 0, 'subcategories': {}}
                expense_by_category[category_name]['amount'] += amount

                # Track subcategory
                if subtype_name not in expense_by_category[category_name]['subcategories']:
                    expense_by_category[category_name]['subcategories'][subtype_name] = {'id': subtype_id, 'amount': 0}
                expense_by_category[category_name]['subcategories'][subtype_name]['amount'] += amount

                # By entity
                expense_by_entity[entity] = expense_by_entity.get(entity, 0) + amount

                # By tag
                for tag in [t.strip() for t in tags_str.split(',') if t.strip()]:
                    expense_by_tag[tag] = expense_by_tag.get(tag, 0) + amount

        # Format categories with subcategories
        def format_category_with_subcategories(cat_dict):
            return sorted(
                [{
                    "id": v['id'],
                    "name": k,
                    "amount": v['amount'],
                    "subcategories": sorted(
                        [{"id": sub['id'], "name": sub_name, "amount": sub['amount']}
                         for sub_name, sub in v['subcategories'].items()],
                        key=lambda x: x['amount'], reverse=True
                    )
                } for k, v in cat_dict.items()],
                key=lambda x: x['amount'], reverse=True
            )

        # Build Sankey diagram data
        # Nodes: Income sources + "Total Income" + Expense categories
        # Links: Income sources -> Total Income -> Expense categories
        sankey_nodes = []
        sankey_links = []
        node_index = {}

        # Add income category nodes
        for cat_name in income_by_category.keys():
            node_index[f"income_{cat_name}"] = len(sankey_nodes)
            sankey_nodes.append({"id": f"income_{cat_name}", "label": cat_name, "type": "income"})

        # Add central "Budget" node
        node_index["budget"] = len(sankey_nodes)
        sankey_nodes.append({"id": "budget", "label": "Budget", "type": "central"})

        # Add expense category nodes (top 10 + "Other")
        expense_items = sorted(expense_by_category.items(), key=lambda x: x[1]['amount'], reverse=True)
        top_expenses = expense_items[:10]
        other_expenses = expense_items[10:]

        for cat_name, _ in top_expenses:
            node_index[f"expense_{cat_name}"] = len(sankey_nodes)
            sankey_nodes.append({"id": f"expense_{cat_name}", "label": cat_name, "type": "expense"})

        if other_expenses:
            node_index["expense_Other"] = len(sankey_nodes)
            sankey_nodes.append({"id": "expense_Other", "label": "Other", "type": "expense"})

        # Create links: Income -> Budget
        for cat_name, cat_data in income_by_category.items():
            if cat_data['amount'] > 0:
                sankey_links.append({
                    "source": f"income_{cat_name}",
                    "target": "budget",
                    "value": round(cat_data['amount'], 2)
                })

        # Create links: Budget -> Expenses
        for cat_name, cat_data in top_expenses:
            if cat_data['amount'] > 0:
                sankey_links.append({
                    "source": "budget",
                    "target": f"expense_{cat_name}",
                    "value": round(cat_data['amount'], 2)
                })

        if other_expenses:
            other_total = sum(cat_data['amount'] for _, cat_data in other_expenses)
            if other_total > 0:
                sankey_links.append({
                    "source": "budget",
                    "target": "expense_Other",
                    "value": round(other_total, 2)
                })

        # Format response with sorted lists
        return {
            "year": year,
            "month": month,
            "start_date": period_start,
            "end_date": period_end,
            "year_of_first_transaction": first_trx_year,
            "currency": display_currency,
            "summary": {
                "total_income": total_income,
                "total_expenses": total_expenses,
                "net": total_income - total_expenses
            },
            "categories": {
                "income": format_category_with_subcategories(income_by_category),
                "expenses": format_category_with_subcategories(expense_by_category)
            },
            "entities": {
                "income": sorted(
                    [{"name": k, "amount": v} for k, v in income_by_entity.items()],
                    key=lambda x: x['amount'], reverse=True
                ),
                "expenses": sorted(
                    [{"name": k, "amount": v} for k, v in expense_by_entity.items()],
                    key=lambda x: x['amount'], reverse=True
                )
            },
            "tags": {
                "income": sorted(
                    [{"name": k, "amount": v} for k, v in income_by_tag.items()],
                    key=lambda x: x['amount'], reverse=True
                ),
                "expenses": sorted(
                    [{"name": k, "amount": v} for k, v in expense_by_tag.items()],
                    key=lambda x: x['amount'], reverse=True
                )
            },
            "sankey": {
                "nodes": sankey_nodes,
                "links": sankey_links
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Year-by-year stats failed: {str(e)}")
