"""
Spending Predictions Module
Analyzes historical data to predict future spending using recurring/non-recurring classification.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
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
    """
    Predict future spending by classifying (payee, category) pairs as recurring
    or non-recurring, then summing their individual predictions.

    Recurring  = appears in ≥2 of the last 3 complete months AND monthly amounts
                 are within 10% of each other.
    Non-recurring = everything else, predicted by averaging monthly totals since
                    the first month that pair appeared (zero months count).
    """

    RECURRING_MIN_MONTHS = 2       # must appear in at least this many of last 3
    RECURRING_WINDOW = 3           # number of recent months to examine
    RECURRING_VARIATION_MAX = 0.10 # max (max-min)/mean allowed

    def __init__(self, transactions: List[Dict], pending_transactions: List[Dict] = None,
                 budgets: List[Dict] = None):
        self.df = pd.DataFrame(transactions) if transactions else pd.DataFrame()
        if not self.df.empty:
            if 'transaction_date' in self.df.columns:
                self.df['date'] = pd.to_datetime(self.df['transaction_date'])
            elif 'date' in self.df.columns:
                self.df['date'] = pd.to_datetime(self.df['date'])

        self.pending = pending_transactions or []
        self.budgets = budgets or []

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def predict_monthly_spending(self, months_ahead: int = 1) -> Dict:
        if self.df.empty or 'date' not in self.df.columns:
            return self._empty_result()

        expenses = self.df[self.df['category'] == 'expense']
        if expenses.empty:
            return self._empty_result()

        recurring, non_recurring = self._classify_spending()

        recurring_total = sum(item['predicted'] for item in recurring)
        non_recurring_total = sum(item['predicted'] for item in non_recurring)
        total_prediction = recurring_total + non_recurring_total

        # Confidence: scales with the share of spending that is predictable (recurring)
        if total_prediction > 0:
            recurring_ratio = recurring_total / total_prediction
            confidence = min(0.95, 0.40 + recurring_ratio * 0.55)
        else:
            confidence = 0.3

        # Linear regression on monthly totals — used only for the trend indicator
        trend_data = self._compute_trend()

        budget_info = self._compare_with_budgets(total_prediction)

        pending_amount = sum(
            abs(p['amount']) for p in self.pending
            if p.get('category') == 'expense'
        )

        return {
            'predicted': float(total_prediction),
            'recurring_total': float(recurring_total),
            'non_recurring_total': float(non_recurring_total),
            'base_prediction': trend_data['base_prediction'],
            'confidence': float(confidence),
            'trend': trend_data['trend'],
            'slope': trend_data['slope'],
            'method': 'recurring_classification',
            'history': trend_data['history'],
            'pending_amount': float(pending_amount),
            'budget_comparison': budget_info,
        }

    def predict_category_spending(self) -> List[Dict]:
        """
        Return per-category predictions aggregated from the recurring classification.
        Each entry includes a split into recurring vs non-recurring portions.
        """
        recurring, non_recurring = self._classify_spending()

        by_category: Dict[str, Dict] = {}

        for item in recurring + non_recurring:
            cat = item['category']
            if cat not in by_category:
                by_category[cat] = {
                    'category': cat,
                    'predicted': 0.0,
                    'recurring_amount': 0.0,
                    'non_recurring_amount': 0.0,
                    'is_recurring': False,
                }
            by_category[cat]['predicted'] += item['predicted']
            if item['is_recurring']:
                by_category[cat]['recurring_amount'] += item['predicted']
            else:
                by_category[cat]['non_recurring_amount'] += item['predicted']

        # Mark a category as "recurring" if the majority of its predicted spend is recurring
        for entry in by_category.values():
            if entry['predicted'] > 0:
                entry['is_recurring'] = (
                    entry['recurring_amount'] / entry['predicted'] >= 0.5
                )

        result = sorted(by_category.values(), key=lambda x: x['predicted'], reverse=True)
        return convert_numpy_types(result)

    # ------------------------------------------------------------------
    # Core classification
    # ------------------------------------------------------------------

    def _classify_spending(self) -> Tuple[List[Dict], List[Dict]]:
        """
        Split every (destinataire, category) group into recurring or non-recurring.

        Returns:
            (recurring_items, non_recurring_items)
            Each item: { category, destinataire, predicted, months_seen, is_recurring }
        """
        expenses = self.df[self.df['category'] == 'expense'].copy()
        if expenses.empty:
            return [], []

        expenses['spending'] = expenses['amount'].abs()
        expenses['month'] = expenses['date'].dt.to_period('M')

        # Only train on complete months
        current_month = pd.Period(datetime.now(), freq='M')
        complete = expenses[expenses['month'] < current_month].copy()
        if complete.empty:
            complete = expenses.copy()

        all_months = sorted(complete['month'].unique())
        last_n = all_months[-self.RECURRING_WINDOW:]

        # Normalise destinataire: treat null/empty as empty string
        complete['destinataire'] = complete['destinataire'].fillna('').str.strip()

        recurring_items: List[Dict] = []
        non_recurring_items: List[Dict] = []

        for (destinataire, type_name), group in complete.groupby(['destinataire', 'type_name']):
            monthly_totals = group.groupby('month')['spending'].sum()

            # --- Recurring check ---
            months_in_window = [m for m in last_n if m in monthly_totals.index]
            if len(months_in_window) >= self.RECURRING_MIN_MONTHS:
                recent_amounts = [float(monthly_totals[m]) for m in months_in_window]
                mean_amt = float(np.mean(recent_amounts))

                if mean_amt > 0:
                    variation = (max(recent_amounts) - min(recent_amounts)) / mean_amt
                    if variation <= self.RECURRING_VARIATION_MAX:
                        recurring_items.append({
                            'category': type_name,
                            'destinataire': destinataire or '(unspecified)',
                            'predicted': mean_amt,
                            'months_seen': len(months_in_window),
                            'is_recurring': True,
                        })
                        continue

            # --- Non-recurring: average over months since first appearance ---
            first_month = monthly_totals.index.min()
            months_since_first = [m for m in all_months if m >= first_month]
            total_months = len(months_since_first)

            total_spending = float(monthly_totals.sum())
            avg = total_spending / total_months if total_months > 0 else 0.0

            if avg > 0:
                non_recurring_items.append({
                    'category': type_name,
                    'destinataire': destinataire or '(unspecified)',
                    'predicted': avg,
                    'months_seen': len(monthly_totals),
                    'is_recurring': False,
                })

        return recurring_items, non_recurring_items

    # ------------------------------------------------------------------
    # Trend (linear regression on monthly totals — for display only)
    # ------------------------------------------------------------------

    def _compute_trend(self) -> Dict:
        """Run linear regression on complete-month totals to get the spend trend."""
        default = {'trend': 'stable', 'slope': 0.0, 'base_prediction': 0.0,
                   'history': [], 'method': 'none'}

        if self.df.empty or 'date' not in self.df.columns:
            return default

        expenses = self.df[self.df['category'] == 'expense'].copy()
        if expenses.empty:
            return default

        expenses['spending'] = expenses['amount'].abs()
        expenses['month'] = expenses['date'].dt.to_period('M')
        current_month = pd.Period(datetime.now(), freq='M')

        training = expenses[expenses['month'] < current_month]
        if training.empty:
            training = expenses

        monthly = training.groupby('month')['spending'].sum().reset_index()
        monthly.rename(columns={'spending': 'amount'}, inplace=True)
        monthly['month'] = monthly['month'].astype(str)

        n = len(monthly)
        slope = 0.0
        base_prediction = float(monthly['amount'].mean()) if n > 0 else 0.0
        trend = 'stable'
        method = 'average'

        if n >= 3:
            monthly['month_num'] = range(n)
            x = monthly['month_num'].values
            y = monthly['amount'].values

            sum_x = np.sum(x)
            sum_y = np.sum(y)
            sum_xy = np.sum(x * y)
            sum_x2 = np.sum(x ** 2)
            denom = n * sum_x2 - sum_x ** 2

            if denom != 0:
                slope = float((n * sum_xy - sum_x * sum_y) / denom)
                intercept = (float(sum_y) - slope * float(sum_x)) / n
                base_prediction = max(0.0, slope * n + intercept)
                mean_monthly = float(np.mean(y))
                if mean_monthly > 0:
                    rel = slope / mean_monthly
                    trend = 'increasing' if rel > 0.02 else 'decreasing' if rel < -0.02 else 'stable'
                method = 'linear_regression'

        history = convert_numpy_types(monthly[['month', 'amount']].to_dict('records'))
        return {
            'trend': trend,
            'slope': float(slope),
            'base_prediction': float(base_prediction),
            'history': history,
            'method': method,
        }

    # ------------------------------------------------------------------
    # Budget comparison
    # ------------------------------------------------------------------

    def _compare_with_budgets(self, predicted_total: float) -> Dict:
        if not self.budgets:
            return {'has_budget': False, 'total_budget': 0, 'over_budget': False, 'difference': 0}

        total_budget = sum(
            b['amount'] if b.get('period') == 'monthly' else b['amount'] / 12
            for b in self.budgets
        )

        if total_budget <= 0:
            return {'has_budget': False, 'total_budget': 0, 'over_budget': False,
                    'difference': 0, 'percentage': None}

        over_budget = predicted_total > total_budget
        difference = predicted_total - total_budget
        percentage = predicted_total / total_budget * 100

        return {
            'has_budget': True,
            'total_budget': float(total_budget),
            'over_budget': bool(over_budget),
            'difference': float(difference),
            'percentage': float(percentage),
            'status': 'over' if over_budget else 'under',
        }

    # ------------------------------------------------------------------
    # Anomaly detection (unchanged)
    # ------------------------------------------------------------------

    def detect_anomalies(self, threshold: float = 2.0) -> List[Dict]:
        if self.df.empty or 'date' not in self.df.columns:
            return []

        expenses = self.df[self.df['category'] == 'expense'].copy()
        if len(expenses) < 10:
            return []

        anomalies = []
        expenses['spending'] = expenses['amount'].abs()

        for type_name in expenses['type_name'].unique():
            type_txns = expenses[expenses['type_name'] == type_name]
            if len(type_txns) < 3:
                continue

            mean_amt = type_txns['spending'].mean()
            std_amt = type_txns['spending'].std()

            if std_amt > 0:
                for _, txn in type_txns.iterrows():
                    z_score = (txn['spending'] - mean_amt) / std_amt
                    if z_score > threshold:
                        anomalies.append({
                            'date': txn['date'].strftime('%Y-%m-%d'),
                            'type': type_name,
                            'amount': float(txn['spending']),
                            'average': float(mean_amt),
                            'deviation': float(z_score),
                            'description': txn.get('description', '')
                        })

        return convert_numpy_types(sorted(anomalies, key=lambda x: x['deviation'], reverse=True))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _empty_result(self) -> Dict:
        return {
            'predicted': 0,
            'recurring_total': 0,
            'non_recurring_total': 0,
            'base_prediction': 0,
            'confidence': 0,
            'trend': 'stable',
            'slope': 0.0,
            'method': 'none',
            'history': [],
            'pending_amount': 0,
            'budget_comparison': {'has_budget': False, 'total_budget': 0,
                                   'over_budget': False, 'difference': 0},
        }
