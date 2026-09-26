"""
Spending Predictions Module

Forecasts a month's expenses in three parts:

- Recurring bills: a recipient paid about once a month for a similar amount
  (rent, subscriptions). Predicted at its usual amount, on its usual day.
- Periodic bills: a recipient paid every quarter or every year for a similar
  amount (insurance, car tax). Predicted only in the month it falls due,
  instead of being spread thinly over every month.
- Variable spending: everything else, per category, averaged over the last
  12 complete months. A month more than three times the category's typical
  month counts as three times typical, so a one-off purchase cannot make the
  next month look expensive. With two years of history, a mild same-month-
  last-year adjustment is applied.

Refunds count against spending: an expense-category amount is spending when
negative and a refund when positive.

The same forecast is replayed on each of the last months, predicted only from
what came before it, to measure how far off it usually is. That measured
error, not a formula, is what the dashboard shows.
"""
from calendar import monthrange
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


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
    """Forecast monthly expenses from past transactions (see module docstring)."""

    LOOKBACK_MONTHS = 12          # variable spending is averaged over this many months
    RECURRING_WINDOW = 6          # recent months examined for monthly bills
    RECURRING_MIN_MONTHS = 3      # a monthly bill must have been paid at least this often
    AMOUNT_TOLERANCE = 0.20       # a bill's amounts stay within ±20% of their median
    PERIODS = {3: 'quarterly', 12: 'yearly'}
    OUTLIER_CAP = 3.0             # a month counts at most this many times a typical month
    SEASONAL_RANGE = (0.8, 1.3)   # same-month-last-year adjustment stays within this
    BACKTEST_MONTHS = 6           # past months replayed to measure accuracy
    MIN_BACKTEST_HISTORY = 3      # months of history needed before a month can be replayed

    def __init__(self, transactions: List[Dict], pending_transactions: List[Dict] = None,
                 budgets: List[Dict] = None, today: Optional[date] = None):
        self.today = today or date.today()
        self.current_month = pd.Period(self.today, freq='M')
        self.pending = pending_transactions or []
        self.budgets = budgets or []

        # Kept for detect_anomalies(), which works on the raw rows.
        self.df = pd.DataFrame(transactions) if transactions else pd.DataFrame()
        if not self.df.empty:
            date_column = 'transaction_date' if 'transaction_date' in self.df.columns else 'date'
            self.df['date'] = pd.to_datetime(self.df[date_column])

        self.expenses = self._prepare_expenses()
        self.first_month = self.expenses['month'].min() if not self.expenses.empty else None

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def predict_monthly_spending(self, months_ahead: int = 1) -> Dict:
        """Forecast the month `months_ahead` after the current one."""
        if self.expenses.empty:
            return self._empty_result()

        target = self.current_month + months_ahead
        forecast = self._forecast(target)
        accuracy = self._backtest()
        this_month = self._this_month_projection()

        spread = accuracy['typical_error'] if accuracy else None
        total = forecast['total']

        return convert_numpy_types({
            'predicted': total,
            'target_month': str(target),
            'recurring_total': forecast['bills_total'],
            'non_recurring_total': forecast['variable_total'],
            'range': ({'low': max(0.0, total - spread), 'high': total + spread}
                      if spread is not None else None),
            'accuracy': accuracy,
            'upcoming_bills': forecast['bills'],
            'seasonal_factor': forecast['seasonal_factor'],
            'this_month': this_month,
            'method': 'bills_and_variable',
            **self._trend(),
            'budget_comparison': self._compare_with_budgets(
                target, forecast['by_category'], this_month['by_category']),
            'pending_amount': float(sum(
                abs(p['amount']) for p in self.pending if p.get('category') == 'expense')),
        })

    def predict_category_spending(self, months_ahead: int = 1) -> List[Dict]:
        """Per-category forecast, split into bills and variable spending."""
        if self.expenses.empty:
            return []
        rows = self._forecast(self.current_month + months_ahead)['by_category']
        return convert_numpy_types(sorted(rows, key=lambda r: r['predicted'], reverse=True))

    # ------------------------------------------------------------------
    # Forecast
    # ------------------------------------------------------------------

    def _prepare_expenses(self) -> pd.DataFrame:
        columns = ['month', 'day', 'spending', 'payee', 'category', 'owner']
        if self.df.empty or 'category' not in self.df.columns:
            return pd.DataFrame(columns=columns)
        rows = self.df[self.df['category'] == 'expense'].copy()
        if rows.empty:
            return pd.DataFrame(columns=columns)
        rows['month'] = rows['date'].dt.to_period('M')
        rows['day'] = rows['date'].dt.day
        # Expenses are stored negative; a refund is a positive amount.
        rows['spending'] = -rows['amount'].astype(float)
        rows['payee'] = (rows['destinataire'].fillna('').astype(str).str.strip()
                         if 'destinataire' in rows.columns else '')
        rows['payee'] = rows['payee'].replace('', '(unspecified)')
        rows['category'] = rows['type_name'].fillna('Other')
        # Transaction owner when set, else the account's; lets a budget set
        # for one person be compared with that person's spending only.
        rows['owner'] = rows['owner_id'] if 'owner_id' in rows.columns else None
        return rows[columns]

    def _forecast(self, target: pd.Period, expenses: Optional[pd.DataFrame] = None) -> Dict:
        """Predict `target` from complete months before it (and before today).

        `expenses` narrows the forecast to a subset, such as one owner's.
        """
        if expenses is None:
            expenses = self.expenses
        cutoff = min(target, self.current_month)
        history = expenses[expenses['month'] < cutoff]

        monthly, periodic = self._find_bills(history, cutoff)
        bills = list(monthly)
        for bill in periodic:
            if bill['due_month'] == target:
                bills.append(bill)
        bill_keys = {(b['payee'], b['category']) for b in monthly + periodic}

        variable = self._variable_by_category(history, cutoff, bill_keys)
        seasonal = self._seasonal_factor(history, target, cutoff, bill_keys)
        variable = {cat: amount * seasonal for cat, amount in variable.items()}

        by_category: Dict[str, Dict] = {}

        def entry(category):
            return by_category.setdefault(category, {
                'category': category, 'predicted': 0.0,
                'recurring_amount': 0.0, 'non_recurring_amount': 0.0, 'is_recurring': False})

        for bill in bills:
            row = entry(bill['category'])
            row['recurring_amount'] += bill['amount']
            row['predicted'] += bill['amount']
        for category, amount in variable.items():
            if amount > 0:
                row = entry(category)
                row['non_recurring_amount'] += amount
                row['predicted'] += amount
        for row in by_category.values():
            row['is_recurring'] = row['predicted'] > 0 and \
                row['recurring_amount'] / row['predicted'] >= 0.5

        bills_total = sum(b['amount'] for b in bills)
        variable_total = sum(v for v in variable.values() if v > 0)
        return {
            'total': bills_total + variable_total,
            'bills_total': bills_total,
            'variable_total': variable_total,
            'variable_by_category': variable,
            'bills': [
                {'payee': b['payee'], 'category': b['category'], 'amount': b['amount'],
                 'day': b['day'], 'kind': b['kind']}
                for b in sorted(bills, key=lambda b: (b['day'], b['payee']))
            ],
            'monthly_bills': monthly,
            'periodic_bills': periodic,
            'seasonal_factor': seasonal,
            'by_category': list(by_category.values()),
        }

    def _find_bills(self, history: pd.DataFrame, cutoff: pd.Period) -> Tuple[List[Dict], List[Dict]]:
        """Recipients paid on a rhythm: every month, or every quarter or year.

        A bill is paid once per period for a similar amount. A recipient paid
        several times a month (groceries) is variable spending, not a bill.
        """
        monthly: List[Dict] = []
        periodic: List[Dict] = []
        if history.empty:
            return monthly, periodic

        window = [cutoff - k for k in range(self.RECURRING_WINDOW, 0, -1)
                  if cutoff - k >= self.first_month]

        for (payee, category), group in history.groupby(['payee', 'category']):
            per_month = group.groupby('month').agg(
                spending=('spending', 'sum'), count=('spending', 'size'), day=('day', 'median'))
            per_month = per_month[per_month['spending'] > 0]
            if per_month.empty or per_month['count'].median() > 1:
                continue
            paid = list(per_month.index)

            # Monthly: nearly every recent month, still being paid.
            considered = [m for m in window if m >= paid[0]]
            present = [m for m in considered if m in per_month.index]
            if (len(present) >= self.RECURRING_MIN_MONTHS
                    and len(present) >= len(considered) - 1
                    and present[-1] >= cutoff - 2):
                recent = per_month.loc[present[-3:]]
                amount = float(recent['spending'].median())
                if self._steady(recent['spending'], amount):
                    monthly.append({'payee': payee, 'category': category, 'amount': amount,
                                    'day': int(round(recent['day'].median())), 'kind': 'monthly'})
                    continue

            # Periodic: a steady gap of about a quarter or a year.
            if len(paid) >= 2:
                gaps = [(later - earlier).n for earlier, later in zip(paid, paid[1:])]
                for period, kind in self.PERIODS.items():
                    if all(abs(gap - period) <= 1 for gap in gaps):
                        last = per_month.iloc[-1]
                        amount = float(last['spending'])
                        if self._steady(per_month['spending'], float(per_month['spending'].median())):
                            periodic.append({'payee': payee, 'category': category,
                                             'amount': amount, 'day': int(round(last['day'])),
                                             'kind': kind, 'due_month': paid[-1] + period})
                        break
        return monthly, periodic

    def _steady(self, amounts: pd.Series, reference: float) -> bool:
        return reference > 0 and all(
            abs(float(a) - reference) <= self.AMOUNT_TOLERANCE * reference for a in amounts)

    def _lookback(self, cutoff: pd.Period) -> List[pd.Period]:
        return [cutoff - k for k in range(self.LOOKBACK_MONTHS, 0, -1)
                if cutoff - k >= self.first_month]

    def _variable_by_category(self, history: pd.DataFrame, cutoff: pd.Period,
                              bill_keys: set) -> Dict[str, float]:
        """Average monthly spending per category, one-offs capped."""
        months = self._lookback(cutoff)
        if not months:
            return {}
        rows = self._without_bills(history[history['month'].isin(months)], bill_keys)
        result = {}
        for category, group in rows.groupby('category'):
            totals = group.groupby('month')['spending'].sum().clip(lower=0)
            result[category] = self._capped_total(totals) / len(months)
        return result

    def _capped_total(self, month_totals: pd.Series) -> float:
        spent = month_totals[month_totals > 0]
        if spent.empty:
            return 0.0
        cap = self.OUTLIER_CAP * float(spent.median())
        return float(spent.clip(upper=cap).sum())

    def _without_bills(self, rows: pd.DataFrame, bill_keys: set) -> pd.DataFrame:
        if rows.empty or not bill_keys:
            return rows
        keys = list(zip(rows['payee'], rows['category']))
        return rows[[key not in bill_keys for key in keys]]

    def _seasonal_factor(self, history: pd.DataFrame, target: pd.Period,
                         cutoff: pd.Period, bill_keys: set) -> float:
        """How the same month last year compared with the year before it.

        Needs that month and the twelve before it in the history; otherwise 1.
        Kept within SEASONAL_RANGE, since a single month is a noisy signal.
        """
        last_year = target - 12
        before = [last_year - k for k in range(12, 0, -1)]
        if self.first_month is None or before[0] < self.first_month or last_year >= cutoff:
            return 1.0
        rows = self._without_bills(history, bill_keys)
        per_month = rows.groupby('month')['spending'].sum().clip(lower=0)
        baseline = float(sum(per_month.get(m, 0.0) for m in before)) / 12
        if baseline <= 0:
            return 1.0
        ratio = float(per_month.get(last_year, 0.0)) / baseline
        low, high = self.SEASONAL_RANGE
        return min(high, max(low, ratio))

    # ------------------------------------------------------------------
    # Accuracy, trend, this month
    # ------------------------------------------------------------------

    def _actual(self, month: pd.Period) -> float:
        spent = self.expenses[self.expenses['month'] == month]['spending'].sum()
        return max(0.0, float(spent))

    def _backtest(self) -> Optional[Dict]:
        """Replay the forecast on recent months, each from the data before it."""
        if self.first_month is None:
            return None
        months = []
        for k in range(self.BACKTEST_MONTHS, 0, -1):
            month = self.current_month - k
            if (month - self.first_month).n < self.MIN_BACKTEST_HISTORY:
                continue
            months.append({'month': str(month), 'predicted': self._forecast(month)['total'],
                           'actual': self._actual(month)})
        if len(months) < 2:
            return None
        errors = [abs(m['predicted'] - m['actual']) for m in months]
        typical_error = float(np.mean(errors))
        mean_actual = float(np.mean([m['actual'] for m in months]))
        return {
            'typical_error': typical_error,
            'typical_error_pct': typical_error / mean_actual if mean_actual > 0 else None,
            'months': months,
        }

    def _trend(self) -> Dict:
        """Last three complete months against the three before them."""
        history = [{'month': str(self.current_month - k), 'amount': self._actual(self.current_month - k)}
                   for k in range(self.LOOKBACK_MONTHS, 0, -1)
                   if self.first_month is not None and self.current_month - k >= self.first_month]
        trend, change = 'stable', 0.0
        if len(history) >= 6:
            recent = np.mean([h['amount'] for h in history[-3:]])
            earlier = np.mean([h['amount'] for h in history[-6:-3]])
            if earlier > 0:
                change = float(recent / earlier - 1)
                trend = 'increasing' if change > 0.05 else 'decreasing' if change < -0.05 else 'stable'
        return {'trend': trend, 'trend_change': change, 'history': history}

    def _this_month_projection(self, expenses: Optional[pd.DataFrame] = None) -> Dict:
        """Spent so far this month, plus what is still expected by its end.

        Also broken down by category, for the budgets.
        """
        if expenses is None:
            expenses = self.expenses
        month = self.current_month
        forecast = self._forecast(month, expenses)
        rows = expenses[expenses['month'] == month]
        rows = rows[rows['day'] <= self.today.day]
        paid = set(zip(rows['payee'], rows['category']))

        bills_left = [b for b in forecast['bills'] if (b['payee'], b['category']) not in paid]
        days_in_month = monthrange(self.today.year, self.today.month)[1]
        days_left = days_in_month - self.today.day
        share_left = days_left / days_in_month

        spent_by_category = rows.groupby('category')['spending'].sum().clip(lower=0).to_dict()
        by_category: Dict[str, Dict] = {}
        for category in set(spent_by_category) | set(forecast['variable_by_category']) \
                | {b['category'] for b in bills_left}:
            spent = float(spent_by_category.get(category, 0.0))
            left = (sum(b['amount'] for b in bills_left if b['category'] == category)
                    + max(0.0, forecast['variable_by_category'].get(category, 0.0)) * share_left)
            by_category[category] = {'spent': spent, 'projected': spent + left}

        spent = max(0.0, float(rows['spending'].sum()))
        expected_left = (sum(b['amount'] for b in bills_left)
                         + forecast['variable_total'] * share_left)
        return {
            'month': str(month),
            'spent': spent,
            'expected_remaining': expected_left,
            'projected': spent + expected_left,
            'bills_remaining': bills_left,
            'days_left': days_left,
            'by_category': by_category,
        }

    # ------------------------------------------------------------------
    # Budget comparison
    # ------------------------------------------------------------------

    def _compare_with_budgets(self, target: pd.Period, by_category: List[Dict],
                              this_month_by_category: Dict[str, Dict]) -> Dict:
        """Compare each budget with the forecast for `target`, and with the
        month in progress, under the same rules as the budget card.

        Only categories that have a budget take part: set a budget for Food
        alone and the rest of the forecast has nothing to be over. A budget set
        for one owner is compared with that owner's spending only, and a budget
        is left out of a month outside its start and end dates.
        """
        month_start = target.start_time.date().isoformat()
        month_end = target.end_time.date().isoformat()
        active = [b for b in self.budgets
                  if b.get('type_name') and b.get('amount', 0) > 0
                  and not (b.get('start_date') and b['start_date'] > month_end)
                  and not (b.get('end_date') and b['end_date'] < month_start)]
        if not active:
            return {'has_budget': False, 'total_budget': 0, 'over_budget': False,
                    'difference': 0, 'percentage': None, 'categories': [],
                    'target_month': str(target), 'this_month': str(self.current_month)}

        household = ({row['category']: row['predicted'] for row in by_category},
                     this_month_by_category)
        per_owner: Dict[Any, Tuple[Dict, Dict]] = {}

        def figures(owner):
            if owner is None:
                return household
            if owner not in per_owner:
                rows = self.expenses[self.expenses['owner'] == owner]
                per_owner[owner] = (
                    {r['category']: r['predicted'] for r in self._forecast(target, rows)['by_category']},
                    self._this_month_projection(rows)['by_category'])
            return per_owner[owner]

        categories = []
        for b in sorted(active, key=lambda b: (b['type_name'], b.get('owner_name') or '')):
            budget = float(b['amount'] if b.get('period', 'monthly') == 'monthly' else b['amount'] / 12)
            owner = b.get('owner_id')
            predicted, this_month = figures(owner)
            forecast = float(predicted.get(b['type_name'], 0.0))
            now = this_month.get(b['type_name'], {'spent': 0.0, 'projected': 0.0})
            label = b['type_name'] + (f" ({b['owner_name']})" if owner and b.get('owner_name') else '')
            categories.append({
                'category': b['type_name'], 'label': label,
                'owner_id': owner, 'owner_name': b.get('owner_name') if owner else None,
                'budget': budget, 'predicted': forecast,
                'difference': forecast - budget, 'over': forecast > budget,
                'this_month_spent': float(now['spent']),
                'this_month_projected': float(now['projected']),
                'this_month_over': float(now['projected']) > budget,
            })

        total_budget = sum(c['budget'] for c in categories)
        total_forecast = sum(c['predicted'] for c in categories)
        over = total_forecast > total_budget
        return {
            'has_budget': True,
            'target_month': str(target),
            'this_month': str(self.current_month),
            'total_budget': total_budget,
            'predicted_budgeted': total_forecast,
            'over_budget': over,
            'difference': total_forecast - total_budget,
            'percentage': total_forecast / total_budget * 100,
            'status': 'over' if over else 'under',
            'categories': categories,
            'over_categories': [c['label'] for c in categories if c['over']],
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
            'target_month': str(self.current_month + 1),
            'recurring_total': 0,
            'non_recurring_total': 0,
            'range': None,
            'accuracy': None,
            'upcoming_bills': [],
            'seasonal_factor': 1.0,
            'this_month': None,
            'method': 'none',
            'trend': 'stable',
            'trend_change': 0.0,
            'history': [],
            'pending_amount': 0,
            'budget_comparison': {'has_budget': False, 'total_budget': 0,
                                  'over_budget': False, 'difference': 0,
                                  'percentage': None, 'categories': []},
        }
