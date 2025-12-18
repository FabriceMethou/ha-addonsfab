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
DB_PATH = os.getenv("DATABASE_PATH", "/app/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)

@router.get("/net-worth")
async def net_worth(current_user: User = Depends(get_current_user)):
    """Calculate total net worth"""
    accounts = db.get_accounts()
    debts = db.get_debts()

    total_assets = sum(a['balance'] for a in accounts)
    total_debts = sum(d['current_balance'] for d in debts)

    return {
        "total_assets": total_assets,
        "total_debts": total_debts,
        "net_worth": total_assets - total_debts,
        "account_count": len(accounts),
        "debt_count": len(debts)
    }

@router.get("/spending-by-category")
async def spending_by_category(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get spending breakdown by category"""
    filters = {}
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date
    transactions = db.get_transactions(filters=filters if filters else None)

    # Group by category
    category_spending = {}
    for t in transactions:
        if t['amount'] < 0:  # Only expenses
            category = t.get('type_name', 'Uncategorized')
            if category not in category_spending:
                category_spending[category] = 0
            category_spending[category] += abs(t['amount'])

    return {
        "categories": [
            {"category": cat, "amount": amt}
            for cat, amt in category_spending.items()
        ],
        "total": sum(category_spending.values())
    }

@router.get("/income-vs-expenses")
async def income_vs_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get income vs expenses comparison"""
    filters = {}
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date
    transactions = db.get_transactions(filters=filters if filters else None)

    income = sum(t['amount'] for t in transactions if t['amount'] > 0)
    expenses = sum(abs(t['amount']) for t in transactions if t['amount'] < 0)

    return {
        "income": income,
        "expenses": expenses,
        "net": income - expenses,
        "start_date": start_date,
        "end_date": end_date
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
    """Get net worth trend over time"""
    try:
        # Calculate net worth for each month
        end_date = datetime.now()
        trends = []

        for i in range(months, 0, -1):
            target_date = end_date - relativedelta(months=i)
            month_end = target_date.replace(day=1) + relativedelta(months=1) - timedelta(days=1)

            # Get transactions up to this month
            filters = {'end_date': month_end.strftime('%Y-%m-%d')}
            transactions = db.get_transactions(filters=filters)

            # Calculate balances
            accounts = db.get_accounts()
            debts = db.get_debts()

            # Simple calculation - in production would need proper historical balance tracking
            total_assets = sum(a['balance'] for a in accounts)
            total_debts = sum(d['current_balance'] for d in debts if d.get('is_active', True))
            net_worth = total_assets - total_debts

            trends.append({
                "date": month_end.strftime('%Y-%m-%d'),
                "month": month_end.strftime('%B %Y'),
                "assets": total_assets,
                "debts": total_debts,
                "net_worth": net_worth
            })

        # Add current month
        current_accounts = db.get_accounts()
        current_debts = db.get_debts()
        current_assets = sum(a['balance'] for a in current_accounts)
        current_debt_total = sum(d['current_balance'] for d in current_debts if d.get('is_active', True))

        trends.append({
            "date": end_date.strftime('%Y-%m-%d'),
            "month": end_date.strftime('%B %Y'),
            "assets": current_assets,
            "debts": current_debt_total,
            "net_worth": current_assets - current_debt_total
        })

        return {
            "months": months,
            "trend": trends,
            "current_net_worth": current_assets - current_debt_total
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trend calculation failed: {str(e)}")

@router.get("/monthly-summary")
async def monthly_summary(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive monthly summary with budgets"""
    try:
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

        # Calculate totals
        income = sum(t['amount'] for t in transactions if t['amount'] > 0)
        expenses = sum(abs(t['amount']) for t in transactions if t['amount'] < 0)

        # Get budget vs actual
        budget_data = db.get_budget_vs_actual(year, month)

        # Spending by category
        category_spending = {}
        for t in transactions:
            if t['amount'] < 0:  # Only expenses
                category = t.get('type_name', 'Uncategorized')
                if category not in category_spending:
                    category_spending[category] = 0
                category_spending[category] += abs(t['amount'])

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
            ]
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
    """Get detailed report for a specific tag"""
    try:
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
                "monthly_trend": []
            }

        # Calculate summary metrics
        total_income = sum(t['amount'] for t in tagged_transactions if t['amount'] > 0)
        total_expenses = sum(abs(t['amount']) for t in tagged_transactions if t['amount'] < 0)

        # Spending by category
        category_spending = {}
        for t in tagged_transactions:
            if t['amount'] < 0:  # Only expenses
                category = t.get('type_name', 'Uncategorized')
                if category not in category_spending:
                    category_spending[category] = 0
                category_spending[category] += abs(t['amount'])

        # Distribution by account
        account_distribution = {}
        for t in tagged_transactions:
            account = t.get('account_name', 'Unknown')
            if account not in account_distribution:
                account_distribution[account] = 0
            account_distribution[account] += abs(t['amount'])

        # Monthly trend
        from collections import defaultdict
        monthly_data = defaultdict(lambda: {'income': 0, 'expenses': 0})
        for t in tagged_transactions:
            month_key = t['transaction_date'][:7]  # YYYY-MM
            if t['amount'] > 0:
                monthly_data[month_key]['income'] += t['amount']
            else:
                monthly_data[month_key]['expenses'] += abs(t['amount'])

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
            "monthly_trend": monthly_trend
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tag report failed: {str(e)}")

@router.get("/spending-trends")
async def spending_trends(
    months: int = 6,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get spending trends by category over time"""
    try:
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

            # Calculate spending by category for this month
            month_data = {
                "month": month_start.strftime('%B %Y'),
                "date": month_start.strftime('%Y-%m'),
                "categories": {}
            }

            total_expenses = 0
            for t in transactions:
                if t['amount'] < 0:  # Only expenses
                    cat = t.get('type_name', 'Uncategorized')
                    categories_set.add(cat)

                    # If filtering by category, only include that category
                    if category and cat != category:
                        continue

                    if cat not in month_data["categories"]:
                        month_data["categories"][cat] = 0
                    month_data["categories"][cat] += abs(t['amount'])
                    total_expenses += abs(t['amount'])

            month_data["total"] = total_expenses
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
        for t in transactions:
            if t['amount'] < 0:
                cat = t.get('type_name', 'Uncategorized')
                categories_set.add(cat)

                if category and cat != category:
                    continue

                if cat not in month_data["categories"]:
                    month_data["categories"][cat] = 0
                month_data["categories"][cat] += abs(t['amount'])
                total_expenses += abs(t['amount'])

        month_data["total"] = total_expenses
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
            "trend_analysis": trend_analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spending trends failed: {str(e)}")
