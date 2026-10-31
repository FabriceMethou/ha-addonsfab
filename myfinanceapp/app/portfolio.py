"""
What investments did and are worth. One calculation for the Investments page, the
dashboard and Reports, so the three cannot disagree. Every function takes the
database it reads from.
"""
from typing import Optional


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


def realised_gains(db, start_date, end_date, owner_id, display_currency) -> float:
    return _rows_total(
        db,
        "t.id IN (SELECT gain_transaction_id FROM investment_transactions "
        "WHERE gain_transaction_id IS NOT NULL)",
        [], start_date, end_date, owner_id, display_currency)


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
