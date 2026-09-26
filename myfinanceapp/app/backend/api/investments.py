"""
Investments API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal, Tuple
from datetime import datetime
import sys, os
import threading
import time
import logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from deps import lazy_db
from api.auth import get_current_user, User
from isin_lookup import ISINLookup
import yfinance as yf

router = APIRouter()

# Resolved centrally so every module reads and writes the same database.
# These used to recompute it from __file__ + DATABASE_PATH, which ignored
# DATA_DIR and could point auth at a different file from everything else.
from deps import DB_PATH
db = lazy_db   # built on first use; see backend/deps.py
isin_lookup = ISINLookup()

#: Markets Yahoo quotes in a subunit: the price is divided into the main unit.
_QUOTE_SUBUNITS = {"GBp": ("GBP", 100), "GBX": ("GBP", 100), "ZAc": ("ZAR", 100), "ILA": ("ILS", 100)}


def _in_main_unit(price: float, currency: Optional[str]) -> Tuple[float, Optional[str]]:
    if currency in _QUOTE_SUBUNITS:
        main, factor = _QUOTE_SUBUNITS[currency]
        return price / factor, main
    return price, currency


def _price_in_holding_currency(price: float, quote_currency: Optional[str],
                               holding: dict, rates: dict) -> float:
    """A quote converted to the currency the holding is kept in.

    Raises ValueError when there is no rate for the quote currency, rather than
    storing a price in the wrong currency: the old code stored the raw quote,
    so a USD price was read as EUR.
    """
    holding_currency = holding.get("holding_currency") or holding.get("account_currency") or "EUR"
    if not quote_currency or quote_currency == holding_currency:
        return price
    if quote_currency not in rates or holding_currency not in rates:
        raise ValueError(f"no exchange rate for {quote_currency}: quoted in {quote_currency}, "
                         f"held in {holding_currency}")
    return db.convert_with_rates(price, quote_currency, holding_currency, rates)


def _get_quote(symbol: str) -> Tuple[Optional[float], Optional[str]]:
    """Get the latest price for a symbol, and the currency it is quoted in.

    The currency is None when the source does not say. Prices quoted in a
    subunit (London in pence) come back in the main unit.

    The Yahoo chart endpoint (fetched via an HTTP proxy) is tried first because
    direct Yahoo calls are commonly IP-blocked/rate-limited on server hosts,
    while the proxy reliably works. A definitive "no data" (HTTP 404) from the
    proxy means the symbol simply isn't priced on Yahoo (e.g. many French mutual
    funds), so we stop immediately instead of falling back to the direct
    `ticker.info` call that just returns 429 noise. Direct yfinance access is
    kept as a fallback for environments where the proxy isn't configured.
    """
    import logging
    logger = logging.getLogger("uvicorn")

    symbol = symbol.strip()

    # Defaults to empty: routing every ticker through a third party should be
    # an explicit choice, not what happens when nothing is configured.
    proxy_prefix = os.getenv("YAHOO_PROXY_PREFIX", "").strip()
    if proxy_prefix:
        import json
        import time
        import requests
        from urllib.parse import quote

        encoded_symbol = quote(symbol, safe="")
        url = (
            f"{proxy_prefix}query2.finance.yahoo.com/v8/finance/chart/"
            f"{encoded_symbol}?interval=1d&range=5d"
        )
        # Retry with backoff: the proxy itself can return 429 under load.
        for attempt in range(3):
            try:
                response = requests.get(url, timeout=15)
                if response.status_code == 429:
                    wait = 2 * (attempt + 1)
                    logger.warning(f"Proxy rate-limited for {symbol} (429), retrying in {wait}s...")
                    time.sleep(wait)
                    continue

                text = response.text
                start_idx = text.find("{")
                if start_idx == -1:
                    logger.warning(f"Proxy returned no JSON for {symbol}")
                    break

                chart = (json.loads(text[start_idx:]) or {}).get("chart") or {}

                # Definitive "symbol not on Yahoo" -> no point trying anything else.
                error = chart.get("error")
                if error:
                    logger.info(
                        f"No Yahoo data for {symbol}: {error.get('description', error)} "
                        f"- manual price entry required"
                    )
                    return None, None

                result = chart.get("result") or []
                if result:
                    meta = result[0].get("meta") or {}
                    currency = meta.get("currency")
                    closes = (
                        (result[0].get("indicators") or {})
                        .get("quote", [{}])[0]
                        .get("close", [])
                    )
                    for price in reversed(closes):
                        if price is not None:
                            return _in_main_unit(float(price), currency)
                    # No history rows, but the meta block sometimes carries a price.
                    meta_price = meta.get("regularMarketPrice")
                    if meta_price is not None:
                        return _in_main_unit(float(meta_price), currency)
                    logger.info(f"Yahoo has no price for {symbol} - manual price entry required")
                    return None, None
                break  # valid response but empty result; stop retrying
            except Exception as e:
                logger.warning(f"Proxy price fetch failed for {symbol} (attempt {attempt + 1}): {e}")
                time.sleep(1 * (attempt + 1))

    # Fallback: direct yfinance (only reaches data where the host isn't blocked).
    ticker = yf.Ticker(symbol)
    yf_currency = None

    try:
        fast_info = ticker.fast_info
        yf_currency = (fast_info.get("currency") if hasattr(fast_info, "get")
                       else getattr(fast_info, "currency", None))
        for key in ("last_price", "regular_market_price", "previous_close"):
            if hasattr(fast_info, "get"):
                price = fast_info.get(key)
            else:
                price = getattr(fast_info, key, None)
            if price:
                return _in_main_unit(float(price), yf_currency)
    except Exception as e:
        logger.warning(f"Failed to fetch fast info for {symbol}: {e}")

    for period, interval in (("5d", "1d"), ("1mo", "1d"), ("1d", "1m")):
        try:
            history = ticker.history(period=period, interval=interval, auto_adjust=False)
        except Exception as e:
            logger.warning(f"Failed history fetch for {symbol} ({period}/{interval}): {e}")
            continue

        if history is None or history.empty:
            continue

        if "Close" in history.columns:
            closes = history["Close"].dropna()
        elif "Adj Close" in history.columns:
            closes = history["Adj Close"].dropna()
        else:
            continue

        if closes.empty:
            continue

        return _in_main_unit(float(closes.iloc[-1]), yf_currency)

    try:
        info = ticker.info
        price = (
            info.get("regularMarketPrice")
            or info.get("currentPrice")
            or info.get("regularMarketPreviousClose")
            or info.get("previousClose")
        )
        if price is not None:
            return _in_main_unit(float(price), info.get("currency") or yf_currency)
    except Exception as e:
        logger.warning(f"Failed to fetch info for {symbol}: {e}")

    return None, None

class SecurityCreate(BaseModel):
    symbol: str
    name: str
    investment_type: Literal['stock', 'etf', 'mutual_fund', 'bond', 'crypto'] = 'stock'
    isin: Optional[str] = None
    exchange: Optional[str] = None
    currency: str = 'EUR'
    sector: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = ''

class SecurityUpdate(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    investment_type: Optional[Literal['stock', 'etf', 'mutual_fund', 'bond', 'crypto']] = None
    isin: Optional[str] = None
    exchange: Optional[str] = None
    currency: Optional[str] = None
    sector: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None

class InvestmentHoldingCreate(BaseModel):
    security_id: int
    account_id: int
    quantity: float
    purchase_price: float
    purchase_date: str
    notes: str = ''

class InvestmentHoldingUpdate(BaseModel):
    security_id: Optional[int] = None
    account_id: Optional[int] = None
    quantity: Optional[float] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    current_price: Optional[float] = None
    notes: Optional[str] = None

class InvestmentTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # buy, sell, dividend
    quantity: float
    price: float
    transaction_date: str
    fees: float = 0.0
    tax: float = 0.0
    notes: str = ''

@router.get("/securities")
def get_securities(
    search: str = None,
    limit: int = None,
    current_user: User = Depends(get_current_user)
):
    """Get securities from master list"""
    securities = db.get_securities(search=search, limit=limit)
    return {"securities": securities}

@router.post("/securities")
def create_security(
    security: SecurityCreate,
    current_user: User = Depends(get_current_user)
):
    """Add a new security to the master list"""
    security_data = {
        'symbol': security.symbol.upper(),
        'name': security.name,
        'investment_type': security.investment_type,
        'isin': security.isin.upper() if security.isin else None,
        'exchange': security.exchange,
        'currency': security.currency,
        'sector': security.sector,
        'country': security.country,
        'notes': security.notes or ''
    }
    
    security_id = db.add_security(security_data)
    return {"message": "Security created", "security_id": security_id}

@router.put("/securities/{security_id}")
def update_security(
    security_id: int,
    security: SecurityUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update security information"""
    update_data = security.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    success = db.update_security(security_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Security not found")
    
    return {"message": "Security updated successfully"}

@router.delete("/securities/{security_id}")
def delete_security(
    security_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a security from master list"""
    try:
        success = db.delete_security(security_id)
        if not success:
            raise HTTPException(status_code=404, detail="Security not found")
        return {"message": "Security deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/holdings")
def get_holdings(current_user: User = Depends(get_current_user)):
    """All holdings, with value, cost and gain in the holding's currency and,
    as *_display, in the display currency.

    The page used to add up holdings kept in different currencies as if they
    were one, under the display currency's symbol.
    """
    display_currency = db.get_preference('display_currency', 'EUR')
    rates = db.get_exchange_rates_map()
    holdings = db.get_investment_holdings()
    for h in holdings:
        currency = h.get('holding_currency') or h.get('account_currency') or 'EUR'
        quantity = h.get('quantity') or 0
        average_cost = h.get('average_cost') or 0
        price = h.get('current_price') or average_cost
        value, cost = quantity * price, quantity * average_cost

        def display(amount):
            return (amount if currency == display_currency
                    else db.convert_with_rates(amount, currency, display_currency, rates))

        h.update({
            'currency': currency,
            'current_value': value,
            'cost_basis': cost,
            'gain_loss': value - cost,
            'gain_loss_percent': (value - cost) / cost * 100 if cost > 0 else 0,
            'current_value_display': display(value),
            'cost_basis_display': display(cost),
            'gain_loss_display': display(value - cost),
        })
    return {"holdings": holdings, "display_currency": display_currency}

@router.post("/holdings")
def create_holding(holding: InvestmentHoldingCreate, current_user: User = Depends(get_current_user)):
    """
    Create new investment holding.
    Note: You need to create a transaction separately to record the initial purchase.
    """
    # Validate that the provided account_id exists and is an investment account
    with db.db_connection(commit=False) as conn:
        account = conn.execute("""
            SELECT id, currency FROM accounts
            WHERE id = ? AND account_type = 'investment'
        """, (holding.account_id,)).fetchone()

    if not account:
        raise HTTPException(status_code=400, detail="Invalid investment account ID or account is not an investment account")

    account_id = account['id']
    account_currency = account['currency']

    # Get security details to determine currency
    security = db.get_security(holding.security_id)
    if not security:
        raise HTTPException(status_code=404, detail="Security not found")

    # Use the account's currency, falling back to security currency
    holding_currency = account_currency or security['currency']

    holding_data = {
        'account_id': account_id,
        'security_id': holding.security_id,
        'currency': holding_currency,
        'current_price': 0
    }

    holding_id = db.add_investment_holding(holding_data)

    # Create initial buy transaction if quantity and price provided
    if holding.quantity > 0 and holding.purchase_price > 0:
        transaction_data = {
            'holding_id': holding_id,
            'transaction_type': 'buy',
            'transaction_date': holding.purchase_date,
            'shares': holding.quantity,
            'price_per_share': holding.purchase_price,
            'total_amount': holding.quantity * holding.purchase_price,
            'fees': 0,
            'tax': 0,
            'currency': account_currency,
            'notes': holding.notes or 'Initial purchase'
        }

        try:
            db.add_investment_transaction(transaction_data)
        except ValueError as e:
            # If linked account issue, log the error but still create the holding
            # User can add transactions manually later
            import logging
            logger = logging.getLogger("uvicorn")
            logger.warning(f"Could not create initial transaction for holding {holding_id}: {str(e)}")

    return {"message": "Holding created", "holding_id": holding_id}

@router.put("/holdings/{holding_id}")
def update_holding(
    holding_id: int,
    holding: InvestmentHoldingUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update investment holding"""
    update_data = holding.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate security_id if provided
    if 'security_id' in update_data:
        with db.db_connection(commit=False) as conn:
            security = conn.execute(
                "SELECT id FROM securities WHERE id = ?",
                (update_data['security_id'],)).fetchone()

        if not security:
            raise HTTPException(status_code=400, detail="Invalid security ID")

    # Validate account_id if provided
    if 'account_id' in update_data:
        with db.db_connection(commit=False) as conn:
            account = conn.execute("""
                SELECT id FROM accounts
                WHERE id = ? AND account_type = 'investment'
            """, (update_data['account_id'],)).fetchone()

        if not account:
            raise HTTPException(status_code=400, detail="Invalid investment account ID or account is not an investment account")

    success = db.update_investment_holding(holding_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Holding not found")

    return {"message": "Holding updated successfully"}

@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: int, current_user: User = Depends(get_current_user)):
    """Delete investment holding and all its transactions"""
    success = db.delete_investment_holding(holding_id)
    if not success:
        raise HTTPException(status_code=404, detail="Holding not found")

    return {"message": "Holding deleted successfully"}

@router.get("/lookup/isin/{isin_code}")
def lookup_isin(isin_code: str, current_user: User = Depends(get_current_user)):
    """Look up security information by ISIN code"""
    try:
        security_info = isin_lookup.lookup_complete(isin_code, fetch_price=False)
        return {
            "isin": isin_code,
            "symbol": security_info.get('symbol'),
            "name": security_info.get('name'),
            "investment_type": security_info.get('investment_type'),
            "exchange": security_info.get('exchange'),
            "currency": security_info.get('currency'),
            "success": True
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ISIN lookup failed: {str(e)}")

@router.get("/transactions")
def get_transactions(
    holding_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get investment transactions, optionally filtered by holding"""
    transactions = db.get_investment_transactions(holding_id)

    # Map database fields to API fields for consistency
    mapped_transactions = []
    for trans in transactions:
        mapped_trans = {
            'id': trans.get('id'),
            'holding_id': trans.get('holding_id'),
            'transaction_type': trans.get('transaction_type'),
            'transaction_date': trans.get('transaction_date'),
            'quantity': trans.get('shares'),  # Map shares -> quantity
            'price': trans.get('price_per_share'),  # Map price_per_share -> price
            'total_amount': trans.get('total_amount'),
            'fees': trans.get('fees'),
            'tax': trans.get('tax'),
            'currency': trans.get('currency'),
            'notes': trans.get('notes'),
            'symbol': trans.get('symbol'),
            'name': trans.get('name'),
            'created_at': trans.get('created_at'),
            'linked_transaction_id': trans.get('linked_transaction_id')
        }
        mapped_transactions.append(mapped_trans)

    return {"transactions": mapped_transactions}

@router.post("/transactions")
def create_transaction(
    transaction: InvestmentTransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Add investment transaction (buy/sell/dividend)"""
    # Get the holding to find the account and its currency.
    # db_connection() closes on every path; the previous conn.close() sat after
    # the query, so any failure in between leaked the connection and its lock.
    with db.db_connection(commit=False) as conn:
        result = conn.execute("""
            SELECT a.currency
            FROM investment_holdings h
            JOIN accounts a ON h.account_id = a.id
            WHERE h.id = ?
        """, (transaction.holding_id,)).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Holding not found")

    account_currency = result['currency'] or 'EUR'

    # For dividend transactions, total_amount is just the price (dividend amount)
    # For buy/sell transactions, total_amount is quantity * price
    if transaction.transaction_type == 'dividend':
        total_amount = transaction.price
    else:
        total_amount = transaction.quantity * transaction.price

    transaction_data = {
        'holding_id': transaction.holding_id,
        'transaction_type': transaction.transaction_type,
        'transaction_date': transaction.transaction_date,
        'shares': transaction.quantity,
        'price_per_share': transaction.price,
        'total_amount': total_amount,
        'fees': transaction.fees,
        'tax': transaction.tax,
        'currency': account_currency,
        'notes': transaction.notes
    }

    try:
        trans_id = db.add_investment_transaction(transaction_data)
        return {"message": "Transaction added successfully", "transaction_id": trans_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/transactions/{transaction_id}")
def update_transaction(
    transaction_id: int,
    transaction: InvestmentTransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Update an existing investment transaction"""
    # Get the holding to find the account and its currency.
    # db_connection() closes on every path; the previous conn.close() sat after
    # the query, so any failure in between leaked the connection and its lock.
    with db.db_connection(commit=False) as conn:
        result = conn.execute("""
            SELECT a.currency
            FROM investment_holdings h
            JOIN accounts a ON h.account_id = a.id
            WHERE h.id = ?
        """, (transaction.holding_id,)).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Holding not found")

    account_currency = result['currency'] or 'EUR'

    # For dividend transactions, total_amount is just the price (dividend amount)
    # For buy/sell transactions, total_amount is quantity * price
    if transaction.transaction_type == 'dividend':
        total_amount = transaction.price
    else:
        total_amount = transaction.quantity * transaction.price

    transaction_data = {
        'holding_id': transaction.holding_id,
        'transaction_type': transaction.transaction_type,
        'transaction_date': transaction.transaction_date,
        'shares': transaction.quantity,
        'price_per_share': transaction.price,
        'total_amount': total_amount,
        'fees': transaction.fees,
        'tax': transaction.tax,
        'currency': account_currency,
        'notes': transaction.notes
    }

    try:
        success = db.update_investment_transaction(transaction_id, transaction_data)
        if not success:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"message": "Transaction updated successfully", "transaction_id": transaction_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete an investment transaction"""
    try:
        success = db.delete_investment_transaction(transaction_id)
        if not success:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"message": "Transaction deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/monthly")
def get_monthly_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get investment activity summary for a date range.

    Returns total amount invested, received from sales, dividends earned, and
    net cash flow for the period. Useful for the dashboard monthly KPI card.

    Invested is the buys recorded on the Investments page plus transfers into
    investment accounts that hold nothing to record buys against, such as a
    gold account (the `invested` flow in database.py).
    """
    display_currency = db.get_preference('display_currency', 'EUR')
    exchange_rates = db.get_exchange_rates_map()
    transactions = db.get_investment_transactions()

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
        "buy_count": buy_count,
        "unlinked_buy_count": unlinked_buy_count,
        "sell_count": sell_count,
        "dividend_count": dividend_count,
        "start_date": start_date,
        "end_date": end_date,
        "currency": display_currency,
    }


@router.get("/summary")
def get_summary(current_user: User = Depends(get_current_user)):
    """Get investment portfolio summary with all amounts converted to the user's display currency"""
    display_currency = db.get_preference('display_currency', 'EUR')
    exchange_rates = db.get_exchange_rates_map()
    holdings = db.get_investment_holdings()

    total_value = 0
    total_cost = 0
    total_dividends = 0
    total_fees = 0
    total_tax = 0
    allocation_by_type = {}

    # Get all transactions to calculate dividends, fees, and tax
    all_transactions = db.get_investment_transactions()

    for holding in holdings:
        quantity = holding.get('quantity', 0) or 0
        average_cost = holding.get('average_cost', 0) or 0
        current_price = holding.get('current_price', 0) or average_cost
        holding_currency = holding.get('holding_currency') or holding.get('account_currency') or 'EUR'

        cost_basis = quantity * average_cost
        current_value = quantity * current_price

        # Convert to display currency
        if holding_currency != display_currency:
            cost_basis = db.convert_with_rates(cost_basis, holding_currency, display_currency, exchange_rates)
            current_value = db.convert_with_rates(current_value, holding_currency, display_currency, exchange_rates)

        total_cost += cost_basis
        total_value += current_value

        # Asset allocation by type (in display currency)
        inv_type = holding.get('investment_type', 'Other')
        if inv_type not in allocation_by_type:
            allocation_by_type[inv_type] = 0
        allocation_by_type[inv_type] += current_value

    # Calculate total dividends, fees, and tax — converting each to display currency
    from datetime import datetime, timedelta
    one_year_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    recent_dividends = 0
    dividend_tax_withheld = 0  # dividends are entered net; the tax is for the record

    for trans in all_transactions:
        trans_currency = trans.get('currency', 'EUR')
        amount = trans.get('total_amount', 0) or 0
        fees = trans.get('fees', 0) or 0
        tax = trans.get('tax', 0) or 0

        if trans_currency != display_currency:
            amount = db.convert_with_rates(amount, trans_currency, display_currency, exchange_rates)
            fees = db.convert_with_rates(fees, trans_currency, display_currency, exchange_rates)
            tax = db.convert_with_rates(tax, trans_currency, display_currency, exchange_rates)

        if trans.get('transaction_type') == 'dividend':
            total_dividends += amount
            dividend_tax_withheld += tax
            if trans.get('transaction_date', '') >= one_year_ago:
                recent_dividends += amount
        total_fees += fees
        total_tax += tax

    dividend_yield = (recent_dividends / total_value * 100) if total_value > 0 else 0

    # Format allocation by type for charts
    allocation_data = [
        {"type": type_name, "value": value, "percentage": (value / total_value * 100) if total_value > 0 else 0}
        for type_name, value in sorted(allocation_by_type.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "total_value": total_value,
        "total_cost": total_cost,
        "total_gain_loss": total_value - total_cost,
        "total_return_percent": ((total_value - total_cost) / total_cost * 100) if total_cost > 0 else 0,
        "total_dividends": total_dividends,
        "recent_dividends_12m": recent_dividends,
        "dividend_yield": dividend_yield,
        "total_fees": total_fees,
        "total_tax": total_tax,
        "dividend_tax_withheld": dividend_tax_withheld,
        "holdings_count": len(holdings),
        "allocation_by_type": allocation_data,
        "display_currency": display_currency
    }

@router.post("/holdings/{holding_id}/update-price")
def update_holding_price(
    holding_id: int,
    current_user: User = Depends(get_current_user)
):
    """Update price for a single holding using Yahoo Finance"""
    import logging
    logger = logging.getLogger("uvicorn")

    try:
        # Get holding details
        holdings = db.get_investment_holdings()
        holding = next((h for h in holdings if h.get('id') == holding_id), None)

        if not holding:
            raise HTTPException(status_code=404, detail="Holding not found")

        symbol = holding.get('symbol')
        logger.info(f"Updating price for {symbol}...")

        quote, quote_currency = _get_quote(symbol)

        if quote is None:
            logger.warning(f"No price data available for {symbol}")
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {symbol}")

        try:
            current_price = _price_in_holding_currency(
                quote, quote_currency, holding, db.get_exchange_rates_map())
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Price for {symbol} not stored: {e}")

        # Through update_holding_price: it also re-values the investment
        # account, which a plain UPDATE left on the old price.
        db.update_holding_price(holding_id, current_price)

        logger.info(f"Price updated for {symbol}: {current_price}")

        from datetime import datetime
        return {
            "message": "Price updated successfully",
            "symbol": symbol,
            "current_price": current_price,
            "quote": quote,
            "quote_currency": quote_currency,
            "updated_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update price: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update price: {str(e)}")

# ── bulk price update ────────────────────────────────────────────────────────
#
# Fetching prices means one blocking HTTP call per holding plus a delay between
# them, so a portfolio of thirty lines takes minutes. Running that inside the
# request meant nginx needed proxy_read_timeout raised to 300s and the browser
# sat on an open connection throughout. It now runs on a worker thread and the
# client polls for progress.

_price_update_lock = threading.Lock()
_price_update_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "total": 0,
    "processed": 0,
    "updated_count": 0,
    "failed": [],
    "skipped": [],
    "error": None,
}


def _run_price_update(holdings, request_delay):
    """Worker body. Opens its own connection: sqlite3 forbids sharing one
    across threads, and db_connection() hands out a fresh one per call."""
    logger = logging.getLogger("uvicorn")
    updated_count, failed, skipped = 0, [], []
    fetched_any = False

    def publish():
        """Copy counters into the shared state the status endpoint reads."""
        with _price_update_lock:
            _price_update_state["updated_count"] = updated_count
            _price_update_state["failed"] = list(failed)
            _price_update_state["skipped"] = list(skipped)

    try:
        for holding in holdings:
            symbol = holding.get("symbol")
            holding_id = holding.get("id")
            investment_type = holding.get("investment_type", "")

            with _price_update_lock:
                _price_update_state["processed"] += 1

            # Bonds and crypto are priced manually.
            if investment_type in ["bond", "crypto"]:
                skipped.append({"symbol": symbol, "type": investment_type,
                                "reason": "Manual price entry required"})
                publish()
                continue

            # Space out network requests to stay under Yahoo's rate limit.
            if fetched_any and request_delay > 0:
                time.sleep(request_delay)
            fetched_any = True

            try:
                quote, quote_currency = _get_quote(symbol)
                if quote is None:
                    failed.append({"symbol": symbol, "error": "No price data available"})
                    publish()
                    continue

                try:
                    current_price = _price_in_holding_currency(
                        quote, quote_currency, holding, db.get_exchange_rates_map())
                except ValueError as e:
                    failed.append({"symbol": symbol, "error": str(e)})
                    publish()
                    continue

                # Re-values the investment account too; see update_holding_price.
                db.update_holding_price(holding_id, current_price)

                logger.info(f"{symbol}: {current_price}")
                updated_count += 1

            except Exception as e:
                logger.error(f"{symbol}: {e}")
                failed.append({"symbol": symbol, "error": str(e)})

            publish()

        publish()
        logger.info(f"Bulk update complete: {updated_count}/{len(holdings)} succeeded, "
                    f"{len(failed)} failed, {len(skipped)} skipped")
    except Exception as e:
        logger.error(f"Bulk price update aborted: {e}")
        with _price_update_lock:
            _price_update_state["error"] = str(e)
    finally:
        with _price_update_lock:
            _price_update_state["running"] = False
            _price_update_state["finished_at"] = datetime.now().isoformat()


@router.post("/holdings/update-all-prices", status_code=202)
def update_all_prices(current_user: User = Depends(get_current_user)):
    """Start a bulk price refresh and return immediately.

    Poll /holdings/price-update-status for progress and the final counts.
    """
    holdings = db.get_investment_holdings()
    if not holdings:
        return {"status": "idle", "message": "No holdings to update",
                "updated_count": 0, "failed": [], "skipped": [], "total": 0,
                "processed": 0, "running": False}

    with _price_update_lock:
        if _price_update_state["running"]:
            return {**_price_update_state, "status": "already_running",
                    "message": "A price update is already in progress"}

        _price_update_state.update({
            "running": True,
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "total": len(holdings),
            "processed": 0,
            "updated_count": 0,
            "failed": [],
            "skipped": [],
            "error": None,
        })

    request_delay = float(os.getenv("PRICE_UPDATE_DELAY_SECONDS", "0.3"))
    threading.Thread(target=_run_price_update, args=(holdings, request_delay),
                     daemon=True).start()

    return {**_price_update_state, "status": "started",
            "message": f"Updating {len(holdings)} holdings in the background"}


@router.get("/holdings/price-update-status")
def get_price_update_status(current_user: User = Depends(get_current_user)):
    """Progress of the running (or last) bulk price update."""
    with _price_update_lock:
        state = dict(_price_update_state)
    state["status"] = "running" if state["running"] else (
        "error" if state["error"] else "finished" if state["finished_at"] else "idle")
    return state
