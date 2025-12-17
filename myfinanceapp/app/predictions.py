"""
Spending Predictions Module
Analyzes historical data to predict future spending
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pandas as pd
import numpy as np


def convert_numpy_types(obj: Any) -> Any:
    """Convert numpy types to Python native types for JSON serialization."""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    return obj


class SpendingPredictor:
    """Predict future spending based on historical patterns."""

    def __init__(self, transactions: List[Dict], pending_transactions: List[Dict] = None,
                 future_recurring: List[Dict] = None, budgets: List[Dict] = None):
        """Initialize with transaction history and optional future data.

        Args:
            transactions: Historical transaction records
            pending_transactions: Pending recurring transactions awaiting confirmation
            future_recurring: Expected future recurring transactions
            budgets: Active budget limits for spending categories
        """
        self.df = pd.DataFrame(transactions) if transactions else pd.DataFrame()
        if not self.df.empty:
            # Handle both 'date' and 'transaction_date' field names
            if 'transaction_date' in self.df.columns:
                self.df['date'] = pd.to_datetime(self.df['transaction_date'])
            elif 'date' in self.df.columns:
                self.df['date'] = pd.to_datetime(self.df['date'])

        self.pending = pending_transactions or []
        self.future_recurring = future_recurring or []
        self.budgets = budgets or []

    def predict_monthly_spending(self, months_ahead: int = 1) -> Dict:
        """Predict spending for upcoming months, including future recurring transactions."""
        if self.df.empty:
            return {'predicted': 0, 'confidence': 0, 'base_prediction': 0, 'recurring_amount': 0, 'pending_amount': 0}

        # Check if date column exists
        if 'date' not in self.df.columns:
            return {'predicted': 0, 'confidence': 0, 'base_prediction': 0, 'recurring_amount': 0, 'pending_amount': 0}

        # Filter to expenses only
        expenses = self.df[self.df['category'] == 'expense'].copy()
        if expenses.empty:
            return {'predicted': 0, 'confidence': 0, 'base_prediction': 0, 'recurring_amount': 0, 'pending_amount': 0}

        # Group by month
        expenses['month'] = expenses['date'].dt.to_period('M')
        monthly = expenses.groupby('month')['amount'].sum().reset_index()
        monthly['month'] = monthly['month'].astype(str)

        base_prediction = 0
        confidence = 0.3
        method = 'simple_average'
        trend = 'stable'
        slope = 0

        if len(monthly) < 3:
            # Not enough data, use simple average
            base_prediction = float(monthly['amount'].mean())
        else:
            # Calculate trend using linear regression
            monthly['month_num'] = range(len(monthly))
            x = monthly['month_num'].values
            y = monthly['amount'].values

            # Simple linear regression
            n = len(x)
            sum_x = np.sum(x)
            sum_y = np.sum(y)
            sum_xy = np.sum(x * y)
            sum_x2 = np.sum(x ** 2)

            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x ** 2)
            intercept = (sum_y - slope * sum_x) / n

            # Predict next month
            next_month_num = len(monthly) + months_ahead - 1
            base_prediction = slope * next_month_num + intercept

            # Calculate R-squared for confidence
            y_pred = slope * x + intercept
            ss_res = np.sum((y - y_pred) ** 2)
            ss_tot = np.sum((y - np.mean(y)) ** 2)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

            # Confidence based on R-squared and data amount
            confidence = min(0.9, max(0.3, r_squared * (1 - 1/len(monthly))))
            method = 'linear_regression'
            trend = 'increasing' if slope > 0 else 'decreasing'

        # Calculate pending transactions amount (expenses only)
        pending_amount = sum(
            p['amount'] for p in self.pending
            if p.get('category') == 'expense' or
               (p.get('type_name') and 'expense' in str(p.get('category', '')).lower())
        )

        # Calculate future recurring transactions amount (expenses only)
        recurring_amount = sum(
            r['amount'] for r in self.future_recurring
            if r.get('category') == 'expense'
        )

        # Total prediction = base + future recurring (don't double count pending as they're already in future)
        total_prediction = max(0, base_prediction) + recurring_amount

        # Get budget comparison
        budget_info = self._compare_with_budgets(total_prediction)

        # Convert history to dict and ensure all numpy types are converted
        history_records = monthly[['month', 'amount']].to_dict('records') if len(monthly) >= 3 else monthly.to_dict('records')
        history_records = convert_numpy_types(history_records)

        return {
            'predicted': float(total_prediction),
            'base_prediction': max(0, float(base_prediction)),
            'recurring_amount': float(recurring_amount),
            'pending_amount': float(pending_amount),
            'confidence': float(confidence),
            'trend': trend,
            'slope': float(slope),
            'method': method,
            'history': history_records,
            'budget_comparison': budget_info
        }

    def _compare_with_budgets(self, predicted_total: float) -> Dict:
        """Compare predicted spending with budgets.

        Args:
            predicted_total: Total predicted spending amount

        Returns:
            Dictionary with budget comparison info
        """
        if not self.budgets:
            return {'has_budget': False, 'total_budget': 0, 'over_budget': False, 'difference': 0}

        # Calculate total monthly budget
        total_budget = 0
        for budget in self.budgets:
            if budget.get('period') == 'monthly':
                total_budget += budget['amount']
            elif budget.get('period') == 'yearly':
                total_budget += budget['amount'] / 12

        over_budget = predicted_total > total_budget
        difference = predicted_total - total_budget
        percentage = (predicted_total / total_budget * 100) if total_budget > 0 else 0

        return {
            'has_budget': True,
            'total_budget': float(total_budget),
            'over_budget': bool(over_budget),
            'difference': float(difference),
            'percentage': float(percentage),
            'status': 'over' if over_budget else 'under'
        }

    def predict_category_spending(self) -> List[Dict]:
        """Predict spending by category for next month."""
        if self.df.empty:
            return []

        # Check if date column exists
        if 'date' not in self.df.columns:
            return []

        expenses = self.df[self.df['category'] == 'expense'].copy()
        if expenses.empty:
            return []

        # Get last 3 months
        recent_date = expenses['date'].max()
        three_months_ago = recent_date - timedelta(days=90)
        recent = expenses[expenses['date'] >= three_months_ago]

        # Average by type
        by_type = recent.groupby('type_name')['amount'].agg(['mean', 'std', 'count'])
        by_type = by_type.reset_index()

        predictions = []
        for _, row in by_type.iterrows():
            confidence = min(0.9, row['count'] / 30)  # More data = higher confidence
            predictions.append({
                'category': row['type_name'],
                'predicted': float(row['mean']),
                'std': float(row['std']) if pd.notna(row['std']) else 0,
                'confidence': float(confidence),
                'sample_size': int(row['count'])
            })

        return convert_numpy_types(sorted(predictions, key=lambda x: x['predicted'], reverse=True))

    def detect_anomalies(self, threshold: float = 2.0) -> List[Dict]:
        """Detect unusual spending patterns."""
        if self.df.empty:
            return []

        # Check if date column exists
        if 'date' not in self.df.columns:
            return []

        expenses = self.df[self.df['category'] == 'expense'].copy()
        if len(expenses) < 10:
            return []

        anomalies = []

        # Check for transactions significantly above average
        for type_name in expenses['type_name'].unique():
            type_txns = expenses[expenses['type_name'] == type_name]
            if len(type_txns) < 3:
                continue

            mean_amt = type_txns['amount'].mean()
            std_amt = type_txns['amount'].std()

            if std_amt > 0:
                for _, txn in type_txns.iterrows():
                    z_score = (txn['amount'] - mean_amt) / std_amt
                    if z_score > threshold:
                        anomalies.append({
                            'date': txn['date'].strftime('%Y-%m-%d'),
                            'type': type_name,
                            'amount': float(txn['amount']),
                            'average': float(mean_amt),
                            'deviation': float(z_score),
                            'description': txn.get('description', '')
                        })

        return convert_numpy_types(sorted(anomalies, key=lambda x: x['deviation'], reverse=True))

    def get_spending_forecast(self, days: int = 30) -> pd.DataFrame:
        """Generate daily spending forecast."""
        if self.df.empty:
            return pd.DataFrame()

        # Check if date column exists
        if 'date' not in self.df.columns:
            return pd.DataFrame()

        expenses = self.df[self.df['category'] == 'expense'].copy()
        if expenses.empty:
            return pd.DataFrame()

        # Group by day of week
        expenses['day_of_week'] = expenses['date'].dt.dayofweek

        # Average spending by day
        daily_avg = expenses.groupby('day_of_week')['amount'].mean()

        # Generate forecast
        forecast_dates = []
        forecast_amounts = []

        start_date = datetime.now()
        for i in range(days):
            forecast_date = start_date + timedelta(days=i)
            day_of_week = forecast_date.weekday()
            forecast_dates.append(forecast_date)
            forecast_amounts.append(daily_avg.get(day_of_week, 0))

        return pd.DataFrame({
            'date': forecast_dates,
            'predicted_spending': forecast_amounts
        })