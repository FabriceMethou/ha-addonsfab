"""
What investments did and are worth. One calculation for the Investments page, the
dashboard and Reports, so the three cannot disagree. Every function takes the
database it reads from.
"""
import calendar
from datetime import date, timedelta
from typing import Any, Dict, List, Optional


def _rows_total(db, where: str, params: list, start_date: Optional[str], end_date: Optional[str],
                owner_id: Optional[int], display_currency: str) -> float:
    """Confirmed ledger rows `t` matching a condition, in the display currency."""
    query = f"""
        SELECT t.amount, a.currency FROM transactions t
          JOIN accounts a ON a.id = t.account_id
         WHERE t.confirmed = 1 AND {where}"""
    params = list(params)
    if start_date:
        query += " AND t.transaction_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND t.transaction_date <= ?"
        params.append(end_date)
    if owner_id:
        query += " AND COALESCE(t.owner_id, a.owner_id) = ?"
        params.append(owner_id)
    with db.db_connection(commit=False) as conn:
        rows = conn.execute(query, params).fetchall()
    rates = db.get_exchange_rates_map()
    return sum(db.convert_with_rates(row['amount'], row['currency'] or 'EUR', display_currency, rates)
               for row in rows)


def realised_gains(db, start_date, end_date, owner_id, display_currency,
                   holding_id: Optional[int] = None) -> float:
    only_holding = " AND holding_id = ?" if holding_id else ""
    return _rows_total(
        db,
        "t.id IN (SELECT gain_transaction_id FROM investment_transactions "
        f"WHERE gain_transaction_id IS NOT NULL{only_holding})",
        [holding_id] if holding_id else [], start_date, end_date, owner_id, display_currency)


def investment_activity(db, start_date: Optional[str] = None, end_date: Optional[str] = None,
                        owner_id: Optional[int] = None) -> dict:
    """Investment activity for a date range, for the dashboard and Money Flow.

    Returns total amount invested, received from sales, dividends earned, and
    net cash flow for the period. Useful for the dashboard monthly KPI card.

    Invested is the buys recorded on the Investments page plus transfers into
    investment accounts that hold nothing to record buys against, such as a
    gold account (the `invested` flow in database.py).
    """
    display_currency = db.get_preference('display_currency', 'EUR')
    exchange_rates = db.get_exchange_rates_map()
    transactions = db.get_investment_transactions()
    if owner_id:
        with db.db_connection(commit=False) as conn:
            owned = {row[0] for row in conn.execute("""
                SELECT h.id FROM investment_holdings h
                  JOIN accounts a ON a.id = h.account_id WHERE a.owner_id = ?
            """, (owner_id,)).fetchall()}
        transactions = [t for t in transactions if t.get('holding_id') in owned]

    total_invested = 0.0   # sum of buy total_amount (including fees + tax)
    total_sold = 0.0       # sum of sell proceeds (net of fees + tax)
    total_dividends = 0.0  # sum of dividend amounts
    buy_count = 0
    unlinked_buy_count = 0  # buys with no cash transaction to list on the Transactions page
    sale_legs = []          # first ledger row of each sale: the capital returned
    sell_count = 0
    dividend_count = 0

    for t in transactions:
        t_date = t.get('transaction_date', '')
        if start_date and t_date < start_date:
            continue
        if end_date and t_date > end_date:
            continue

        t_type = t.get('transaction_type')
        t_currency = t.get('currency', 'EUR')
        amount = db.convert_with_rates(t.get('total_amount', 0) or 0, t_currency, display_currency, exchange_rates)
        fees   = db.convert_with_rates(t.get('fees', 0) or 0,         t_currency, display_currency, exchange_rates)
        tax    = db.convert_with_rates(t.get('tax', 0) or 0,          t_currency, display_currency, exchange_rates)

        if t_type == 'buy':
            total_invested += amount + fees + tax
            buy_count += 1
            if not t.get('linked_transaction_id'):
                unlinked_buy_count += 1
        elif t_type == 'sell':
            total_sold += amount - fees - tax
            sell_count += 1
            if t.get('linked_transaction_id'):
                sale_legs.append(t['linked_transaction_id'])
        elif t_type == 'dividend':
            total_dividends += amount
            dividend_count += 1

    # Transfers into investment accounts without holdings. The `invested`
    # flow also holds the buys' cash legs, already counted above from the
    # trades; those carry no transfer account.
    transfer_filters = {'flow': 'invested'}
    if start_date:
        transfer_filters['start_date'] = start_date
    if end_date:
        transfer_filters['end_date'] = end_date
    if owner_id:
        transfer_filters['owner_id'] = owner_id
    invested_transfers = [t for t in db.get_transactions(transfer_filters)
                          if t.get('transfer_account_id')]
    total_transferred = sum(
        db.convert_with_rates(abs(t['amount']), t.get('account_currency', 'EUR'),
                              display_currency, exchange_rates)
        for t in invested_transfers)
    total_invested += total_transferred

    # The capital a sale returned, not its proceeds: a sale writes the capital
    # as a transfer and the gain as income, and the gain is already in the
    # month's savings. Older sales booked whole as income return nothing here,
    # being in savings in full.
    capital_returned = 0.0
    if sale_legs:
        with db.db_connection(commit=False) as conn:
            legs = conn.execute(f"""
                SELECT t.amount, a.currency
                  FROM transactions t
                  JOIN accounts a ON a.id = t.account_id
                  JOIN transaction_types tt ON tt.id = t.type_id
                 WHERE t.id IN ({','.join('?' * len(sale_legs))})
                   AND tt.category = 'transfer'
            """, sale_legs).fetchall()
        capital_returned = sum(
            db.convert_with_rates(abs(leg['amount']), leg['currency'] or 'EUR',
                                  display_currency, exchange_rates)
            for leg in legs)

    # Money taken back out of those accounts. With the capital returned by
    # sales, it turns investing into net investing: what the savings
    # breakdown compares with savings, so selling one fund to buy another is
    # not counted as new money.
    divested_filters = {**transfer_filters, 'flow': 'divested'}
    divested = db.get_transactions(divested_filters)
    total_withdrawn = sum(
        db.convert_with_rates(abs(t['amount']), t.get('account_currency', 'EUR'),
                              display_currency, exchange_rates)
        for t in divested)

    return {
        "total_invested": total_invested,
        "total_transferred": total_transferred,
        "transfer_count": len(invested_transfers),
        "total_withdrawn": total_withdrawn,
        "capital_returned": capital_returned,
        "net_invested": total_invested - capital_returned - total_withdrawn,
        "total_sold": total_sold,
        "total_dividends": total_dividends,
        "net_cash_flow": total_sold + total_dividends - total_invested,
        # The capital rows of loan payments. Interest is already an expense; this
        # is cash that left without being spent or invested.
        "loan_capital_repaid": -_rows_total(
            db, "t.type_id IN (SELECT id FROM transaction_types WHERE name = 'Debt Principal')",
            [], start_date, end_date, owner_id, display_currency),
        "realised_gains": realised_gains(db, start_date, end_date, owner_id, display_currency),
        "buy_count": buy_count,
        "unlinked_buy_count": unlinked_buy_count,
        "sell_count": sell_count,
        "dividend_count": dividend_count,
        "start_date": start_date,
        "end_date": end_date,
        "currency": display_currency,
    }


def _month_end_dates(start: date, end: date) -> List[date]:
    """The day before the period, then each month end in it, then its last day."""
    dates = [start - timedelta(days=1)]
    year, month = start.year, start.month
    while True:
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        if month_end >= end:
            break
        dates.append(month_end)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    dates.append(end)
    return dates


class _Position:
    """A holding with its trades and prices, able to value itself on any date."""

    def __init__(self, row: Dict[str, Any], trades: List[Dict[str, Any]], prices: List[Dict[str, Any]]):
        self.row = row
        self.trades = trades
        self.prices = prices

    def value_on(self, on: str) -> float:
        """Same rule as _net_worth_on: the latest price known on that date. A holding
        with no market price at all is worth what it cost."""
        buys = [t for t in self.trades if t['transaction_type'] == 'buy' and t['transaction_date'] <= on]
        sold = sum(t['shares'] or 0 for t in self.trades
                   if t['transaction_type'] == 'sell' and t['transaction_date'] <= on)
        quantity = sum(t['shares'] or 0 for t in buys) - sold
        if quantity <= 0:
            return 0.0

        current_price = self.row['current_price'] or 0
        if current_price > 0 and on >= date.today().isoformat():
            return quantity * current_price
        known = [p['price'] for p in self.prices if p['price_date'] <= on]
        if current_price > 0 and known:
            return quantity * known[-1]
        shares_bought = sum(t['shares'] or 0 for t in buys)
        cost = sum(t['total_amount'] or 0 for t in buys)
        return quantity * (cost / shares_bought) if shares_bought else 0.0


class _LedgerAccount(_Position):
    """An investment account with no holdings, such as a gold account fed by
    transfers: worth its ledger, and each row in or out is what was contributed."""

    def __init__(self, account: Dict[str, Any], rows: List[Dict[str, Any]]):
        trades = [{
            'transaction_type': 'buy' if row['amount'] > 0 else 'sell',
            'transaction_date': row['transaction_date'],
            'total_amount': abs(row['amount']),
            'shares': None, 'fees': 0, 'tax': 0, 'gain': None, 'gain_currency': None,
            'currency': account['currency'],
        } for row in rows]
        super().__init__({
            'id': None, 'current_price': 0, 'symbol': account['name'], 'name': account['name'],
            'investment_type': 'other', 'currency': account['currency'],
        }, trades, [])
        self.opening_balance = account['opening_balance'] or 0
        self.opening_date = account['opening_date']
        self.rows = rows

    def value_on(self, on: str) -> float:
        if self.opening_date and on < self.opening_date:
            return 0.0
        return self.opening_balance + sum(r['amount'] for r in self.rows if r['transaction_date'] <= on)


def _load_positions(db, owner_id: Optional[int], account_id: Optional[int]) -> List[_Position]:
    query = """
        SELECT h.id, h.current_price, s.symbol, s.name, s.investment_type,
               COALESCE(h.currency, s.currency) AS currency
          FROM investment_holdings h
          JOIN securities s ON s.id = h.security_id
          JOIN accounts a ON a.id = h.account_id
         WHERE 1 = 1"""
    params: List[Any] = []
    if owner_id:
        query += " AND a.owner_id = ?"
        params.append(owner_id)
    if account_id:
        query += " AND a.id = ?"
        params.append(account_id)
    with db.db_connection(commit=False) as conn:
        positions = []
        for row in conn.execute(query, params).fetchall():
            trades = conn.execute("""
                SELECT it.*, g.amount AS gain, a.currency AS gain_currency
                  FROM investment_transactions it
                  LEFT JOIN transactions g ON g.id = it.gain_transaction_id
                  LEFT JOIN accounts a ON a.id = g.account_id
                 WHERE it.holding_id = ? ORDER BY it.transaction_date, it.id
            """, (row['id'],)).fetchall()
            prices = conn.execute("""
                SELECT price_date, price FROM price_history
                 WHERE holding_id = ? ORDER BY price_date
            """, (row['id'],)).fetchall()
            positions.append(_Position(dict(row), [dict(t) for t in trades], [dict(p) for p in prices]))

        ledger_query = """
            SELECT a.id, a.name, a.currency, a.opening_balance, a.opening_date FROM accounts a
             WHERE a.account_type = 'investment'
               AND NOT EXISTS (SELECT 1 FROM investment_holdings h WHERE h.account_id = a.id)"""
        ledger_params: List[Any] = []
        if owner_id:
            ledger_query += " AND a.owner_id = ?"
            ledger_params.append(owner_id)
        if account_id:
            ledger_query += " AND a.id = ?"
            ledger_params.append(account_id)
        for account in conn.execute(ledger_query, ledger_params).fetchall():
            rows = conn.execute("""
                SELECT transaction_date, amount FROM transactions
                 WHERE account_id = ? AND confirmed = 1
                   AND (? IS NULL OR transaction_date >= ?)
                 ORDER BY transaction_date, id
            """, (account['id'], account['opening_date'], account['opening_date'])).fetchall()
            positions.append(_LedgerAccount(dict(account), [dict(r) for r in rows]))
    return positions


def investment_report(db, start_date: str, end_date: str, owner_id: Optional[int] = None,
                      account_id: Optional[int] = None) -> Dict[str, Any]:
    """What a portfolio did in a period, in the display currency.

    The figures add up: end value = start value + net contributed + market gain.
    """
    display_currency = db.get_preference('display_currency', 'EUR')
    rates = db.get_exchange_rates_map()

    def to_display(amount: float, currency: Optional[str]) -> float:
        return db.convert_with_rates(amount or 0, currency or display_currency, display_currency, rates)

    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    points = _month_end_dates(start, end)
    day_before = points[0].isoformat()
    positions = _load_positions(db, owner_id, account_id)

    rows: List[Dict[str, Any]] = []
    series = [{'date': point.isoformat(), 'value': 0.0, 'contributed': 0.0} for point in points]
    dividends_by_month: Dict[str, float] = {}
    allocation: Dict[str, Dict[str, Any]] = {}
    fees_and_tax = realised = 0.0

    for position in positions:
        info = position.row
        currency = info['currency']
        start_value = to_display(position.value_on(day_before), currency)
        end_value = to_display(position.value_on(end_date), currency)
        bought = sold = income = 0.0

        for trade in position.trades:
            when = trade['transaction_date']
            if not start_date <= when <= end_date:
                continue
            total = to_display(trade['total_amount'], trade['currency'])
            costs = to_display((trade['fees'] or 0) + (trade['tax'] or 0), trade['currency'])
            fees_and_tax += costs
            if trade['transaction_type'] == 'buy':
                bought += total + costs
            elif trade['transaction_type'] == 'sell':
                sold += total - costs
                realised += to_display(trade['gain'], trade['gain_currency'])
            elif trade['transaction_type'] == 'dividend':
                income += total
                month = when[:7]
                dividends_by_month[month] = dividends_by_month.get(month, 0.0) + total

        for point in series:
            point['value'] += to_display(position.value_on(point['date']), currency)
            contributed = start_value
            for trade in position.trades:
                if start_date <= trade['transaction_date'] <= point['date']:
                    total = to_display(trade['total_amount'], trade['currency'])
                    costs = to_display((trade['fees'] or 0) + (trade['tax'] or 0), trade['currency'])
                    if trade['transaction_type'] == 'buy':
                        contributed += total + costs
                    elif trade['transaction_type'] == 'sell':
                        contributed -= total - costs
            point['contributed'] += contributed

        if not (start_value or end_value or bought or sold or income):
            continue

        rows.append({
            'holding_id': info['id'],
            'symbol': info['symbol'] or info['name'],
            'name': info['name'],
            'investment_type': info['investment_type'],
            'start_value': round(start_value, 2),
            'bought': round(bought, 2),
            'sold': round(sold, 2),
            'income': round(income, 2),
            'end_value': round(end_value, 2),
            # Adding 0.0 turns a rounded -0.0 into 0.0, which would read "-€0.00".
            'gain': round(end_value - start_value - bought + sold + income, 2) + 0.0,
        })

        if end_value > 0:
            kind = allocation.setdefault(info['investment_type'] or 'other',
                                         {'category': info['investment_type'] or 'other',
                                          'total': 0.0, 'subcategories': []})
            kind['total'] += end_value
            kind['subcategories'].append({'category': info['symbol'] or info['name'],
                                           'total': round(end_value, 2)})

    rows.sort(key=lambda row: row['end_value'], reverse=True)
    start_total = sum(row['start_value'] for row in rows)
    end_total = sum(row['end_value'] for row in rows)
    net_contributed = sum(row['bought'] - row['sold'] for row in rows)
    for kind in allocation.values():
        kind['total'] = round(kind['total'], 2)
        kind['subcategories'].sort(key=lambda sub: sub['total'], reverse=True)

    return {
        'start_date': start_date,
        'end_date': end_date,
        'currency': display_currency,
        'summary': {
            'start_value': round(start_total, 2),
            'end_value': round(end_total, 2),
            'net_contributed': round(net_contributed, 2),
            'market_gain': round(end_total - start_total - net_contributed, 2),
            'dividends': round(sum(dividends_by_month.values()), 2),
            'realised_gains': round(realised, 2),
            'fees_and_tax': round(fees_and_tax, 2),
        },
        'holdings': rows,
        'series': [{**point, 'value': round(point['value'], 2),
                    'contributed': round(point['contributed'], 2)} for point in series],
        'dividends_by_month': [{'month': month, 'amount': round(amount, 2)}
                               for month, amount in sorted(dividends_by_month.items())],
        'allocation': sorted(allocation.values(), key=lambda kind: kind['total'], reverse=True),
    }
