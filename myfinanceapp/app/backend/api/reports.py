"""
Reports API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
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

@router.get("/net-worth")
async def net_worth(current_user: User = Depends(get_current_user)):
    """Calculate total net worth in user's preferred currency"""
    # Get user's preferred display currency
    display_currency = db.get_preference('display_currency', 'EUR')

    accounts = db.get_accounts()
    debts = db.get_debts()

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
        "currency": display_currency
    }

@router.get("/spending-by-category")
async def spending_by_category(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
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
    transactions = db.get_transactions(filters=filters if filters else None)

    # Group by category (exclude transfers)
    category_spending = {}
    for t in transactions:
        if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
            category = t.get('type_name', 'Uncategorized')
            if category not in category_spending:
                category_spending[category] = 0
            # Convert transaction amount to display currency
            account_currency = t.get('account_currency', 'EUR')
            converted_amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)
            category_spending[category] += converted_amount

    return {
        "categories": [
            {"category": cat, "total": amt}
            for cat, amt in category_spending.items()
        ],
        "total": sum(category_spending.values()),
        "currency": display_currency
    }

@router.get("/income-vs-expenses")
async def income_vs_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
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

    # Also group income by category
    income_categories = {}
    for t in transactions:
        if t['amount'] > 0 and t.get('category') != 'transfer':  # Only income, exclude transfers
            category = t.get('type_name', 'Uncategorized')
            if category not in income_categories:
                income_categories[category] = 0
            account_currency = t.get('account_currency', 'EUR')
            converted_amount = db.convert_currency(t['amount'], account_currency, display_currency)
            income_categories[category] += converted_amount

    return {
        "income": income,
        "expenses": expenses,
        "net": income - expenses,
        "income_categories": [
            {"category": cat, "total": amt}
            for cat, amt in income_categories.items()
        ],
        "start_date": start_date,
        "end_date": end_date,
        "currency": display_currency
    }

@router.get("/spending-prediction")
async def spending_prediction(
    months_ahead: int = 1,
    current_user: User = Depends(get_current_user)
):
    """Predict spending for upcoming months"""
    try:
        # Get historical transactions
        transactions = db.get_transactions()

        # Get pending and future recurring transactions
        pending = db.get_pending_transactions()

        # Get future recurring transactions (simplified - would need actual implementation)
        future_recurring = []

        # Get active budgets
        budgets = db.get_budgets(include_inactive=False)

        # Create predictor and predict
        predictor = SpendingPredictor(
            transactions=transactions,
            pending_transactions=pending,
            future_recurring=future_recurring,
            budgets=budgets
        )

        prediction = predictor.predict_monthly_spending(months_ahead=months_ahead)

        return {
            "months_ahead": months_ahead,
            "prediction": prediction
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@router.get("/net-worth/trend")
async def net_worth_trend(
    months: int = 12,
    current_user: User = Depends(get_current_user)
):
    """Get net worth trend over time in user's preferred currency.

    Uses the database's get_net_worth_trend method which properly handles:
    - Account opening dates (doesn't show balances before account existed)
    - Opening balances as starting point
    - Forward calculation from opening balance + transactions
    """
    try:
        # Calculate date range based on months parameter
        end_date = datetime.now()
        start_date = end_date - relativedelta(months=months)

        # Use the database method that properly handles opening dates
        result = db.get_net_worth_trend(
            start_date=start_date.strftime('%Y-%m-%d'),
            end_date=end_date.strftime('%Y-%m-%d'),
            frequency='monthly'
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
            "trend": trends,
            "current_net_worth": current_net_worth,
            "currency": result['currency']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trend calculation failed: {str(e)}")

@router.get("/monthly-summary")
async def monthly_summary(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive monthly summary with budgets in user's preferred currency"""
    try:
        # Get user's preferred display currency
        display_currency = db.get_preference('display_currency', 'EUR')

        # Build date range for the month
        start_date = datetime(year, month, 1).strftime('%Y-%m-%d')
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        end_date = end_date.strftime('%Y-%m-%d')

        # Get transactions for the month
        filters = {'start_date': start_date, 'end_date': end_date}
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

        # Get budget vs actual
        budget_data = db.get_budget_vs_actual(year, month)

        # Spending by category with currency conversion (exclude transfers)
        category_spending = {}
        for t in transactions:
            if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
                category = t.get('type_name', 'Uncategorized')
                if category not in category_spending:
                    category_spending[category] = 0
                converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
                category_spending[category] += converted_amount

        return {
            "year": year,
            "month": month,
            "income": income,
            "expenses": expenses,
            "net": income - expenses,
            "transaction_count": len(transactions),
            "budget_vs_actual": budget_data,
            "spending_by_category": [
                {"category": cat, "amount": amt}
                for cat, amt in sorted(category_spending.items(), key=lambda x: x[1], reverse=True)
            ],
            "currency": display_currency
        }
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

        # Spending by category with currency conversion (exclude transfers)
        category_spending = {}
        for t in tagged_transactions:
            if t['amount'] < 0 and t.get('category') != 'transfer':  # Only expenses, exclude transfers
                category = t.get('type_name', 'Uncategorized')
                if category not in category_spending:
                    category_spending[category] = 0
                converted_amount = db.convert_currency(abs(t['amount']), t.get('account_currency', 'EUR'), display_currency)
                category_spending[category] += converted_amount

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
            "spending_by_category": [
                {"category": cat, "amount": amt}
                for cat, amt in sorted(category_spending.items(), key=lambda x: x[1], reverse=True)
            ],
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
    current_user: User = Depends(get_current_user)
):
    """Get spending trends by category over time in user's preferred currency"""
    try:
        # Get user's preferred display currency
        display_currency = db.get_preference('display_currency', 'EUR')

        end_date = datetime.now()
        trends = []

        # Get all categories if filtering
        categories_set = set()

        for i in range(months, 0, -1):
            target_date = end_date - relativedelta(months=i)
            month_start = target_date.replace(day=1)
            month_end = month_start + relativedelta(months=1) - timedelta(days=1)

            filters = {
                'start_date': month_start.strftime('%Y-%m-%d'),
                'end_date': month_end.strftime('%Y-%m-%d')
            }
            transactions = db.get_transactions(filters=filters)

            # Calculate spending by category for this month with currency conversion
            month_data = {
                "month": month_start.strftime('%B %Y'),
                "date": month_start.strftime('%Y-%m'),
                "categories": {}
            }

            total_expenses = 0
            total_income = 0
            for t in transactions:
                account_currency = t.get('account_currency', 'EUR')
                # Calculate expenses (exclude transfers)
                if t['amount'] < 0 and t.get('category') != 'transfer':
                    cat = t.get('type_name', 'Uncategorized')
                    categories_set.add(cat)

                    # If filtering by category, only include that category
                    if category and cat != category:
                        continue

                    converted_amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)
                    if cat not in month_data["categories"]:
                        month_data["categories"][cat] = 0
                    month_data["categories"][cat] += converted_amount
                    total_expenses += converted_amount

                # Calculate income (exclude transfers)
                elif t['amount'] > 0 and t.get('category') != 'transfer':
                    converted_amount = db.convert_currency(t['amount'], account_currency, display_currency)
                    total_income += converted_amount

            month_data["total_expenses"] = total_expenses
            month_data["total_income"] = total_income
            trends.append(month_data)

        # Include current month
        current_month_start = end_date.replace(day=1)
        filters = {
            'start_date': current_month_start.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d')
        }
        transactions = db.get_transactions(filters=filters)

        month_data = {
            "month": current_month_start.strftime('%B %Y'),
            "date": current_month_start.strftime('%Y-%m'),
            "categories": {}
        }

        total_expenses = 0
        total_income = 0
        for t in transactions:
            account_currency = t.get('account_currency', 'EUR')
            # Calculate expenses (exclude transfers)
            if t['amount'] < 0 and t.get('category') != 'transfer':
                cat = t.get('type_name', 'Uncategorized')
                categories_set.add(cat)

                if category and cat != category:
                    continue

                converted_amount = db.convert_currency(abs(t['amount']), account_currency, display_currency)
                if cat not in month_data["categories"]:
                    month_data["categories"][cat] = 0
                month_data["categories"][cat] += converted_amount
                total_expenses += converted_amount

            # Calculate income (exclude transfers)
            elif t['amount'] > 0 and t.get('category') != 'transfer':
                converted_amount = db.convert_currency(t['amount'], account_currency, display_currency)
                total_income += converted_amount

        month_data["total_expenses"] = total_expenses
        month_data["total_income"] = total_income
        trends.append(month_data)

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
            "category_filter": category,
            "trends": trends,
            "all_categories": sorted(list(categories_set)),
            "trend_analysis": trend_analysis,
            "currency": display_currency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spending trends failed: {str(e)}")

@router.get("/year-by-year")
async def year_by_year_stats(
    year: int,
    month: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get year-by-year income/expense breakdown by category, entity (destinataire), and tag.

    Args:
        year: The year to get stats for
        month: Optional month (1-12) to filter to a specific month
    """
    try:
        display_currency = db.get_preference('display_currency', 'EUR')

        # Get date range for the year or specific month
        if month:
            # Specific month selected
            start_date = f"{year}-{month:02d}-01"
            if month == 12:
                end_date = f"{year}-12-31"
            else:
                # Last day of the selected month
                next_month = datetime(year, month + 1, 1)
                last_day = (next_month - timedelta(days=1)).day
                end_date = f"{year}-{month:02d}-{last_day:02d}"
        else:
            # Full year
            start_date = f"{year}-01-01"
            end_date = f"{year}-12-31"

        # Fetch all transactions for the year
        transactions = db.get_transactions({
            'start_date': start_date,
            'end_date': end_date
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Year-by-year stats failed: {str(e)}")
