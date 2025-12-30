"""
Investments API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User
from isin_lookup import ISINLookup
import yfinance as yf

router = APIRouter()

# Get database path from environment or use default
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "finance.db")
DB_PATH = os.getenv("DATABASE_PATH", DEFAULT_DB_PATH)
db = FinanceDatabase(db_path=DB_PATH)
isin_lookup = ISINLookup()

def _get_latest_price(symbol: str) -> Optional[float]:
    """Get latest price with minimal rate-limit risk."""
    import logging
    logger = logging.getLogger("uvicorn")

    symbol = symbol.strip()
    ticker = yf.Ticker(symbol)

    try:
        fast_info = ticker.fast_info
        for key in ("last_price", "regular_market_price", "previous_close"):
            if hasattr(fast_info, "get"):
                price = fast_info.get(key)
            else:
                price = getattr(fast_info, key, None)
            if price:
                return float(price)
    except Exception as e:
        logger.warning(f"Failed to fetch fast info for {symbol}: {e}")

    for period, interval in (("5d", "1d"), ("1mo", "1d"), ("1d", "1m")):
        try:
            history = ticker.history(period=period, interval=interval, auto_adjust=False)
        except Exception as e:
            logger.warning(f"Failed history fetch for {symbol} ({period}/{interval}): {e}")
            continue

        if history is None or history.empty:
            logger.warning(f"History is empty for {symbol} ({period}/{interval})")
            continue

        if "Close" in history.columns:
            closes = history["Close"].dropna()
        elif "Adj Close" in history.columns:
            closes = history["Adj Close"].dropna()
        else:
            logger.warning(f"No Close or Adj Close column for {symbol} ({period}/{interval})")
            continue

        if closes.empty:
            logger.warning(f"No close prices available for {symbol} ({period}/{interval})")
            continue

        return float(closes.iloc[-1])

    try:
        proxy_prefix = os.getenv("YAHOO_PROXY_PREFIX", "https://r.jina.ai/http://").strip()
        if proxy_prefix:
            import json
            import requests
            from urllib.parse import quote

            encoded_symbol = quote(symbol, safe="")
            url = (
                f"{proxy_prefix}query2.finance.yahoo.com/v8/finance/chart/"
                f"{encoded_symbol}?interval=1d&range=5d"
            )
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            text = response.text
            start_idx = text.find("{")
            if start_idx != -1:
                data = json.loads(text[start_idx:])
                result = (data.get("chart") or {}).get("result") or []
                if result:
                    closes = (
                        (result[0].get("indicators") or {})
                        .get("quote", [{}])[0]
                        .get("close", [])
                    )
                    for price in reversed(closes):
                        if price is not None:
                            return float(price)
    except Exception as e:
        logger.warning(f"Proxy price fetch failed for {symbol}: {e}")

    try:
        info = ticker.info
        price = (
            info.get("regularMarketPrice")
            or info.get("currentPrice")
            or info.get("regularMarketPreviousClose")
            or info.get("previousClose")
        )
        if price is not None:
            return float(price)
    except Exception as e:
        logger.warning(f"Failed to fetch info for {symbol}: {e}")

    return None

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
async def get_securities(
    search: str = None,
    limit: int = None,
    current_user: User = Depends(get_current_user)
):
    """Get securities from master list"""
    securities = db.get_securities(search=search, limit=limit)
    return {"securities": securities}

@router.post("/securities")
async def create_security(
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
async def update_security(
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
async def delete_security(
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
async def get_holdings(current_user: User = Depends(get_current_user)):
    """Get all investment holdings with calculated values"""
    holdings = db.get_investment_holdings()
    return {"holdings": holdings}

@router.post("/holdings")
async def create_holding(holding: InvestmentHoldingCreate, current_user: User = Depends(get_current_user)):
    """
    Create new investment holding.
    Note: You need to create a transaction separately to record the initial purchase.
    """
    # Validate that the provided account_id exists and is an investment account
    conn = db._get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, currency FROM accounts
        WHERE id = ? AND account_type = 'investment'
    """, (holding.account_id,))
    account = cursor.fetchone()

    if not account:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid investment account ID or account is not an investment account")

    account_id = account['id']
    account_currency = account['currency']
    conn.close()

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
async def update_holding(
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
        conn = db._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM securities WHERE id = ?", (update_data['security_id'],))
        security = cursor.fetchone()
        conn.close()

        if not security:
            raise HTTPException(status_code=400, detail="Invalid security ID")

    # Validate account_id if provided
    if 'account_id' in update_data:
        conn = db._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id FROM accounts
            WHERE id = ? AND account_type = 'investment'
        """, (update_data['account_id'],))
        account = cursor.fetchone()
        conn.close()

        if not account:
            raise HTTPException(status_code=400, detail="Invalid investment account ID or account is not an investment account")

    success = db.update_investment_holding(holding_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Holding not found")

    return {"message": "Holding updated successfully"}

@router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: int, current_user: User = Depends(get_current_user)):
    """Delete investment holding and all its transactions"""
    success = db.delete_investment_holding(holding_id)
    if not success:
        raise HTTPException(status_code=404, detail="Holding not found")

    return {"message": "Holding deleted successfully"}

@router.get("/holdings/{holding_id}/current-price")
async def get_current_price(holding_id: int, current_user: User = Depends(get_current_user)):
    """Get current price for holding using yfinance"""
    holding = db.get_investment_holding(holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    try:
        current_price = _get_latest_price(holding['symbol'])
        if current_price is None:
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {holding['symbol']}")
        return {
            "symbol": holding['symbol'],
            "current_price": current_price,
            "currency": holding.get('currency') or 'USD'
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch price: {str(e)}")

@router.get("/test-price/{symbol}")
async def test_price(symbol: str, current_user: User = Depends(get_current_user)):
    """Test price fetching for debugging - shows detailed info"""
    import logging
    logger = logging.getLogger("uvicorn")

    try:
        ticker = yf.Ticker(symbol)

        # Test 1: Try getting info
        try:
            info = ticker.info
            logger.info(f"Successfully got info for {symbol}")
            logger.info(f"Info keys: {list(info.keys())[:20]}")  # First 20 keys

            price_data = {
                'regularMarketPrice': info.get('regularMarketPrice'),
                'currentPrice': info.get('currentPrice'),
                'regularMarketPreviousClose': info.get('regularMarketPreviousClose'),
                'previousClose': info.get('previousClose')
            }
        except Exception as e:
            logger.error(f"Failed to get info: {str(e)}")
            price_data = {"error": str(e)}
            info = {}

        # Test 2: Try getting history
        try:
            history = ticker.history(period="5d", interval="1d", auto_adjust=False)
            logger.info(f"History shape: {history.shape if not history.empty else 'empty'}")
            history_data = {
                'empty': history.empty,
                'columns': list(history.columns) if not history.empty else [],
                'last_close': float(history['Close'].iloc[-1]) if not history.empty and 'Close' in history.columns else None
            }
        except Exception as e:
            logger.error(f"Failed to get history: {str(e)}")
            history_data = {"error": str(e)}

        return {
            "symbol": symbol,
            "price_from_info": price_data,
            "history": history_data,
            "final_price": _get_latest_price(symbol)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lookup/isin/{isin_code}")
async def lookup_isin(isin_code: str, current_user: User = Depends(get_current_user)):
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
async def get_transactions(
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
async def create_transaction(
    transaction: InvestmentTransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Add investment transaction (buy/sell/dividend)"""
    # Get the holding to find the account and its currency
    conn = db._get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.currency
        FROM investment_holdings h
        JOIN accounts a ON h.account_id = a.id
        WHERE h.id = ?
    """, (transaction.holding_id,))
    result = cursor.fetchone()
    conn.close()

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
async def update_transaction(
    transaction_id: int,
    transaction: InvestmentTransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Update an existing investment transaction"""
    # Get the holding to find the account and its currency
    conn = db._get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.currency
        FROM investment_holdings h
        JOIN accounts a ON h.account_id = a.id
        WHERE h.id = ?
    """, (transaction.holding_id,))
    result = cursor.fetchone()
    conn.close()

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
async def delete_transaction(
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

@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_user)):
    """Get investment portfolio summary with detailed metrics"""
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

        cost_basis = quantity * average_cost
        current_value = quantity * current_price

        total_cost += cost_basis
        total_value += current_value

        # Calculate asset allocation by type
        inv_type = holding.get('investment_type', 'Other')
        if inv_type not in allocation_by_type:
            allocation_by_type[inv_type] = 0
        allocation_by_type[inv_type] += current_value

    # Calculate total dividends, fees, and tax
    for trans in all_transactions:
        if trans.get('transaction_type') == 'dividend':
            total_dividends += trans.get('total_amount', 0)
        total_fees += trans.get('fees', 0) or 0
        total_tax += trans.get('tax', 0) or 0

    # Calculate dividend yield (annual dividends / current value)
    from datetime import datetime, timedelta
    one_year_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    recent_dividends = sum(t.get('total_amount', 0) for t in all_transactions
                          if t.get('transaction_type') == 'dividend'
                          and t.get('transaction_date', '') >= one_year_ago)
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
        "holdings_count": len(holdings),
        "allocation_by_type": allocation_data
    }

@router.post("/holdings/{holding_id}/update-price")
async def update_holding_price(
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

        current_price = _get_latest_price(symbol)

        if current_price is None:
            logger.warning(f"No price data available for {symbol}")
            raise HTTPException(status_code=400, detail=f"Could not fetch price for {symbol}")

        # Update in database
        from datetime import datetime
        conn = db._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE investment_holdings
            SET current_price = ?, last_price_update = ?
            WHERE id = ?
        """, (current_price, datetime.now().isoformat(), holding_id))
        conn.commit()
        conn.close()

        logger.info(f"Price updated for {symbol}: {current_price}")

        return {
            "message": "Price updated successfully",
            "symbol": symbol,
            "current_price": current_price,
            "updated_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update price: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update price: {str(e)}")

@router.post("/holdings/update-all-prices")
async def update_all_prices(current_user: User = Depends(get_current_user)):
    """Update prices for all holdings using Yahoo Finance"""
    import logging
    logger = logging.getLogger("uvicorn")

    holdings = db.get_investment_holdings()

    if not holdings:
        return {"message": "No holdings to update", "updated_count": 0, "failed": []}

    logger.info(f"Starting bulk price update for {len(holdings)} holdings...")
    updated_count = 0
    failed = []
    skipped = []

    from datetime import datetime
    conn = db._get_connection()
    cursor = conn.cursor()

    for holding in holdings:
        symbol = holding.get('symbol')
        holding_id = holding.get('id')
        investment_type = holding.get('investment_type', '')

        # Skip bonds and crypto - they require manual price updates
        if investment_type in ['bond', 'crypto']:
            logger.info(f"Skipping {symbol} ({investment_type}) - requires manual price entry")
            skipped.append({"symbol": symbol, "type": investment_type, "reason": "Manual price entry required"})
            continue

        try:
            logger.info(f"Fetching price for {symbol}...")

            current_price = _get_latest_price(symbol)

            if current_price is None:
                logger.warning(f"No price data available for {symbol}")
                failed.append({"symbol": symbol, "error": "No price data available"})
                continue

            # Update in database
            cursor.execute("""
                UPDATE investment_holdings
                SET current_price = ?, last_price_update = ?
                WHERE id = ?
            """, (current_price, datetime.now().isoformat(), holding_id))

            logger.info(f"✓ {symbol}: {current_price}")
            updated_count += 1

        except Exception as e:
            logger.error(f"✗ {symbol}: {str(e)}")
            failed.append({"symbol": symbol, "error": str(e)})

    conn.commit()
    conn.close()

    logger.info(f"Bulk update complete: {updated_count}/{len(holdings)} succeeded, {len(failed)} failed, {len(skipped)} skipped")

    return {
        "message": f"Updated {updated_count} of {len(holdings)} holdings ({len(skipped)} skipped)",
        "updated_count": updated_count,
        "total_holdings": len(holdings),
        "skipped_count": len(skipped),
        "failed": failed,
        "skipped": skipped
    }

@router.post("/fix-dividend-totals")
async def fix_dividend_totals(current_user: User = Depends(get_current_user)):
    """
    Fix existing dividend transactions that have total_amount = 0.
    This is a one-time utility endpoint to fix data from before the dividend fix.
    """
    import logging
    logger = logging.getLogger("uvicorn")

    conn = db._get_connection()
    cursor = conn.cursor()

    # Check current state
    cursor.execute('SELECT COUNT(*) as count FROM investment_transactions WHERE transaction_type = "dividend" AND total_amount = 0')
    count_before = cursor.fetchone()['count']

    logger.info(f"Found {count_before} dividend transactions with total_amount = 0")

    # Fix them
    cursor.execute('UPDATE investment_transactions SET total_amount = price_per_share WHERE transaction_type = "dividend" AND total_amount = 0')
    rows_updated = cursor.rowcount
    conn.commit()

    # Check after
    cursor.execute('SELECT COUNT(*) as count FROM investment_transactions WHERE transaction_type = "dividend" AND total_amount = 0')
    count_after = cursor.fetchone()['count']

    conn.close()

    logger.info(f"Fixed {rows_updated} dividend transactions. Remaining with 0 total: {count_after}")

    return {
        "message": f"Fixed {rows_updated} dividend transactions",
        "fixed_count": rows_updated,
        "before": count_before,
        "after": count_after
    }
