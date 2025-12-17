"""
Investments API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from database import FinanceDatabase
from api.auth import get_current_user, User
from isin_lookup import ISINLookup
import yfinance as yf

router = APIRouter()

# Get database path from environment or use default
DB_PATH = os.getenv("DATABASE_PATH", "/data/myfinanceapp/data/finance.db")
db = FinanceDatabase(db_path=DB_PATH)
isin_lookup = ISINLookup()

class SecurityCreate(BaseModel):
    symbol: str
    name: str
    investment_type: str = 'stock'
    isin: Optional[str] = None
    exchange: Optional[str] = None
    currency: str = 'EUR'
    sector: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = ''

class SecurityUpdate(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None
    investment_type: Optional[str] = None
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
    account_id: Optional[int] = None
    symbol: Optional[str] = None
    name: Optional[str] = None
    investment_type: Optional[str] = None
    isin: Optional[str] = None
    notes: Optional[str] = None

class InvestmentTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # buy, sell, dividend
    quantity: float
    price: float
    transaction_date: str
    fees: float = 0.0
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
            'currency': security['currency'],
            'notes': holding.notes or 'Initial purchase'
        }

        try:
            db.add_investment_transaction(transaction_data)
        except ValueError as e:
            # If linked account issue, just create holding without transaction
            pass

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
        ticker = yf.Ticker(holding['symbol'])
        info = ticker.info
        current_price = info.get('currentPrice') or info.get('regularMarketPrice', 0)
        return {"symbol": holding['symbol'], "current_price": current_price, "currency": info.get('currency', 'USD')}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch price: {str(e)}")

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
    return {"transactions": transactions}

@router.post("/transactions")
async def create_transaction(
    transaction: InvestmentTransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """Add investment transaction (buy/sell/dividend)"""
    transaction_data = {
        'holding_id': transaction.holding_id,
        'transaction_type': transaction.transaction_type,
        'transaction_date': transaction.transaction_date,
        'shares': transaction.quantity,
        'price_per_share': transaction.price,
        'total_amount': transaction.quantity * transaction.price,
        'fees': transaction.fees,
        'currency': 'EUR',
        'notes': transaction.notes
    }

    try:
        trans_id = db.add_investment_transaction(transaction_data)
        return {"message": "Transaction added successfully", "transaction_id": trans_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/summary")
async def get_summary(current_user: User = Depends(get_current_user)):
    """Get investment portfolio summary with detailed metrics"""
    holdings = db.get_investment_holdings()

    total_value = 0
    total_cost = 0
    total_dividends = 0
    allocation_by_type = {}

    # Get all transactions to calculate dividends
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

    # Calculate total dividends
    for trans in all_transactions:
        if trans.get('transaction_type') == 'dividend':
            total_dividends += trans.get('total_amount', 0)

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
        "holdings_count": len(holdings),
        "allocation_by_type": allocation_data
    }

@router.post("/holdings/{holding_id}/update-price")
async def update_holding_price(
    holding_id: int,
    current_user: User = Depends(get_current_user)
):
    """Update price for a single holding using Yahoo Finance"""
    try:
        # Get holding details
        holdings = db.get_investment_holdings()
        holding = next((h for h in holdings if h.get('id') == holding_id), None)

        if not holding:
            raise HTTPException(status_code=404, detail="Holding not found")

        symbol = holding.get('symbol')

        # Fetch current price from Yahoo Finance
        ticker = yf.Ticker(symbol)
        info = ticker.info

        # Try different price fields
        current_price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')

        if current_price is None:
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

        return {
            "message": "Price updated successfully",
            "symbol": symbol,
            "current_price": current_price,
            "updated_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update price: {str(e)}")

@router.post("/holdings/update-all-prices")
async def update_all_prices(current_user: User = Depends(get_current_user)):
    """Update prices for all holdings using Yahoo Finance"""
    holdings = db.get_investment_holdings()

    if not holdings:
        return {"message": "No holdings to update", "updated_count": 0, "failed": []}

    updated_count = 0
    failed = []

    from datetime import datetime
    conn = db._get_connection()
    cursor = conn.cursor()

    for holding in holdings:
        try:
            symbol = holding.get('symbol')
            holding_id = holding.get('id')

            # Fetch current price from Yahoo Finance
            ticker = yf.Ticker(symbol)
            info = ticker.info

            # Try different price fields
            current_price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')

            if current_price is None:
                failed.append({"symbol": symbol, "error": "No price data available"})
                continue

            # Update in database
            cursor.execute("""
                UPDATE investment_holdings
                SET current_price = ?, last_price_update = ?
                WHERE id = ?
            """, (current_price, datetime.now().isoformat(), holding_id))

            updated_count += 1

        except Exception as e:
            failed.append({"symbol": holding.get('symbol'), "error": str(e)})

    conn.commit()
    conn.close()

    return {
        "message": f"Updated {updated_count} of {len(holdings)} holdings",
        "updated_count": updated_count,
        "total_holdings": len(holdings),
        "failed": failed
    }
