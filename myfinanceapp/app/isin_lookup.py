"""
ISIN Lookup Utility for Finance Tracker

Fetches security information from ISIN codes using OpenFIGI API (Bloomberg)
with yfinance fallback for price data.
"""

import requests
import logging
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Suppress yfinance error logging for 404s (symbol not found)
# These are expected errors when symbols don't exist and are handled gracefully
yf_logger = logging.getLogger('yfinance')
yf_logger.setLevel(logging.CRITICAL)


class ISINLookupError(Exception):
    """Custom exception for ISIN lookup failures."""
    pass


class ISINLookup:
    """
    Handle ISIN to security information lookups.

    Uses OpenFIGI API (Bloomberg) as primary source for:
    - Symbol/Ticker
    - Security Name
    - Investment Type (security type)
    - Exchange information

    Falls back to yfinance for price data.
    """

    OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
    REQUEST_TIMEOUT = 10  # seconds

    # Mapping from OpenFIGI securityType to our investment_type
    SECURITY_TYPE_MAP = {
        'Common Stock': 'stock',
        'Preferred Stock': 'stock',
        'ETF': 'etf',
        'ETP': 'etf',  # Exchange Traded Product
        'Mutual Fund': 'mutual_fund',
        'FUND': 'mutual_fund',
        'Corporate Bond': 'bond',
        'Government Bond': 'bond',
        'Municipal Bond': 'bond',
        'BOND': 'bond',
        'Crypto': 'crypto',
        'Cryptocurrency': 'crypto'
    }

    @staticmethod
    def validate_isin(isin: str) -> bool:
        """
        Validate ISIN format (12 alphanumeric characters).

        Args:
            isin: ISIN code to validate

        Returns:
            True if valid format, False otherwise
        """
        if not isin:
            return False

        cleaned = isin.strip().upper()

        # ISIN format: 2 letter country code + 9 alphanumeric + 1 check digit
        if len(cleaned) != 12:
            return False

        if not cleaned.isalnum():
            return False

        # First two characters should be letters (country code)
        if not cleaned[:2].isalpha():
            return False

        return True

    @staticmethod
    def lookup_from_openfigi(isin: str, api_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch security information from OpenFIGI API.

        Args:
            isin: International Securities Identification Number
            api_key: Optional OpenFIGI API key (increases rate limits)

        Returns:
            Dictionary with keys: symbol, name, investment_type, exchange, raw_data

        Raises:
            ISINLookupError: If lookup fails or ISIN not found
        """
        if not ISINLookup.validate_isin(isin):
            raise ISINLookupError(f"Invalid ISIN format: {isin}")

        isin_clean = isin.strip().upper()

        # Prepare request
        headers = {'Content-Type': 'application/json'}
        if api_key:
            headers['X-OPENFIGI-APIKEY'] = api_key

        payload = [{"idType": "ID_ISIN", "idValue": isin_clean}]

        try:
            logger.info(f"Querying OpenFIGI for ISIN: {isin_clean}")
            response = requests.post(
                ISINLookup.OPENFIGI_URL,
                json=payload,
                headers=headers,
                timeout=ISINLookup.REQUEST_TIMEOUT
            )

            # Check for rate limiting
            if response.status_code == 429:
                raise ISINLookupError(
                    "OpenFIGI rate limit exceeded. Try again in a few minutes or add an API key."
                )

            response.raise_for_status()

            result = response.json()

            # OpenFIGI returns a list (one entry per input ISIN)
            if not result or len(result) == 0:
                raise ISINLookupError(f"No response from OpenFIGI for ISIN: {isin_clean}")

            first_result = result[0]

            # Check for errors in response
            if 'error' in first_result:
                error_msg = first_result['error']
                raise ISINLookupError(f"OpenFIGI error: {error_msg}")

            # Check for data
            if 'data' not in first_result or len(first_result['data']) == 0:
                raise ISINLookupError(f"ISIN not found in OpenFIGI: {isin_clean}")

            # Get the first match (usually there's only one, but some ISINs map to multiple exchanges)
            security_data = first_result['data'][0]

            # Extract fields
            ticker = security_data.get('ticker', '')
            name = security_data.get('name', '')
            security_type = security_data.get('securityType', '')
            security_type2 = security_data.get('securityType2', '')
            exchange_code = security_data.get('exchCode', '')
            market_sector = security_data.get('marketSector', '')

            # Map security type to our investment_type
            investment_type = ISINLookup._map_security_type(security_type, security_type2, market_sector)

            # Build symbol with exchange suffix if available
            # For European securities: VWCE.DE, EQQQ.L, etc.
            symbol = ISINLookup._build_symbol(ticker, exchange_code)

            logger.info(f"OpenFIGI lookup successful: {isin_clean}")
            logger.info(f"  Raw ticker: {ticker}")
            logger.info(f"  Exchange code: {exchange_code}")
            logger.info(f"  Symbol with suffix: {symbol}")
            logger.info(f"  Name: {name}")

            return {
                'symbol': symbol,
                'name': name,
                'investment_type': investment_type,
                'exchange': exchange_code,
                'market_sector': market_sector,
                'raw_data': security_data
            }

        except requests.exceptions.Timeout:
            raise ISINLookupError("OpenFIGI API timeout. Check your internet connection.")
        except requests.exceptions.ConnectionError:
            raise ISINLookupError("Cannot connect to OpenFIGI API. Check your internet connection.")
        except requests.exceptions.HTTPError as e:
            raise ISINLookupError(f"OpenFIGI API error: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in OpenFIGI lookup: {e}")
            raise ISINLookupError(f"Unexpected error: {str(e)}")

    @staticmethod
    def _map_security_type(security_type: str, security_type2: str, market_sector: str) -> str:
        """
        Map OpenFIGI security types to our investment_type enum.

        Args:
            security_type: Primary security type from OpenFIGI
            security_type2: Secondary security type
            market_sector: Market sector (Equity, Corp, Govt, etc.)

        Returns:
            One of: stock, etf, mutual_fund, bond, crypto
        """
        # Try exact match first
        for figi_type, our_type in ISINLookup.SECURITY_TYPE_MAP.items():
            if figi_type.lower() in security_type.lower():
                return our_type
            if security_type2 and figi_type.lower() in security_type2.lower():
                return our_type

        # Fallback based on market sector
        if 'equity' in market_sector.lower():
            # Could be stock or ETF - default to stock
            return 'stock'
        elif 'bond' in market_sector.lower() or market_sector in ['Corp', 'Govt', 'Muni']:
            return 'bond'

        # Default to stock if uncertain
        logger.warning(f"Unknown security type: {security_type} / {security_type2} / {market_sector}, defaulting to stock")
        return 'stock'

    @staticmethod
    def _build_symbol(ticker: str, exchange_code: str) -> str:
        """
        Build proper symbol with exchange suffix for Yahoo Finance compatibility.

        Exchange code mapping (common European exchanges):
        - GY (XETRA Germany) → .DE
        - GR (Boerse Frankfurt) → .F
        - US (United States) → no suffix
        - LN (London) → .L
        - PA (Paris) → .PA
        - AS (Amsterdam) → .AS

        Args:
            ticker: Base ticker symbol
            exchange_code: OpenFIGI exchange code

        Returns:
            Formatted symbol (e.g., "VWCE.DE")
        """
        if not ticker:
            return ""

        # Exchange code mapping to Yahoo Finance suffixes
        # Expanded to include more European and international exchanges
        exchange_map = {
            # Germany
            'GY': '.DE',   # XETRA
            'GR': '.F',    # Frankfurt
            'GF': '.F',    # Frankfurt (alternative)
            'GZ': '.SG',   # Stuttgart
            'GH': '.HM',   # Hamburg
            'GM': '.MU',   # Munich
            'GB': '.BE',   # Berlin
            'GD': '.DU',   # Dusseldorf

            # France
            'PA': '.PA',   # Paris Euronext
            'FP': '.PA',   # Paris (alternative)

            # Netherlands
            'AS': '.AS',   # Amsterdam
            'NA': '.AS',   # Amsterdam (alternative)

            # Italy
            'MI': '.MI',   # Milan
            'IM': '.MI',   # Milan (alternative)

            # Spain
            'SM': '.MC',   # Madrid

            # Switzerland
            'SW': '.SW',   # SIX Swiss Exchange
            'SE': '.SW',   # Swiss (alternative)
            'VX': '.SW',   # Virt-X (Swiss)

            # UK
            'LN': '.L',    # London Stock Exchange

            # Belgium
            'BB': '.BR',   # Brussels

            # Austria
            'AV': '.VI',   # Vienna

            # Denmark
            'DC': '.CO',   # Copenhagen

            # Sweden
            'SS': '.ST',   # Stockholm

            # Norway
            'NO': '.OL',   # Oslo

            # Finland
            'FH': '.HE',   # Helsinki

            # Portugal
            'PL': '.LS',   # Lisbon

            # Ireland
            'ID': '.IR',   # Irish Stock Exchange

            # United States
            'US': '',      # NYSE/NASDAQ (no suffix)
            'UN': '',      # NYSE (alternative)
            'UW': '',      # NASDAQ (alternative)
            'UR': '',      # NASDAQ (alternative)
            'UA': '',      # AMEX (alternative)

            # Canada
            'CT': '.TO',   # Toronto

            # Australia
            'AT': '.AX',   # ASX

            # Japan
            'JP': '.T',    # Tokyo

            # Hong Kong
            'HK': '.HK',   # Hong Kong
        }

        suffix = exchange_map.get(exchange_code, '')

        # Log warning if exchange code not recognized
        if not suffix and exchange_code:
            logger.warning(f"Unknown exchange code '{exchange_code}' for ticker '{ticker}'. Using bare ticker without suffix.")

        return f"{ticker}{suffix}"

    @staticmethod
    def get_current_price_yfinance(symbol: str) -> Optional[float]:
        """
        Fetch current price from Yahoo Finance.

        Args:
            symbol: Ticker symbol (with exchange suffix if needed)

        Returns:
            Current price as float, or None if unavailable
        """
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            info = ticker.info

            # Try multiple price fields (different securities use different fields)
            # European securities often use different fields than US stocks
            price = (
                info.get('currentPrice') or
                info.get('regularMarketPrice') or
                info.get('previousClose') or
                info.get('navPrice')
            )

            if price and price > 0:
                logger.info(f"Fetched price for {symbol}: {price}")
                return float(price)

            logger.warning(f"No valid price found for {symbol}")
            return None

        except Exception as e:
            logger.warning(f"Failed to fetch price for {symbol}: {e}")
            return None

    @staticmethod
    def lookup_complete(isin: str, api_key: Optional[str] = None, fetch_price: bool = True) -> Dict[str, Any]:
        """
        Complete ISIN lookup with all available data.

        Fetches security info from OpenFIGI and optionally fetches current price from yfinance.

        Args:
            isin: International Securities Identification Number
            api_key: Optional OpenFIGI API key
            fetch_price: Whether to fetch current price (requires additional API call)

        Returns:
            Dictionary with keys:
                - symbol: Ticker with exchange suffix
                - name: Full security name
                - investment_type: One of stock/etf/mutual_fund/bond/crypto
                - exchange: Exchange code
                - market_sector: Market sector
                - current_price: Current price (if fetch_price=True and available)
                - currency: Currency code (if available from price fetch)

        Raises:
            ISINLookupError: If lookup fails
        """
        # Get basic security info from OpenFIGI
        result = ISINLookup.lookup_from_openfigi(isin, api_key)

        # Optionally fetch price
        if fetch_price and result['symbol']:
            price = ISINLookup.get_current_price_yfinance(result['symbol'])
            result['current_price'] = price

            # Try to get currency from yfinance
            try:
                import yfinance as yf
                ticker = yf.Ticker(result['symbol'])
                currency = ticker.info.get('currency', 'EUR')
                result['currency'] = currency
            except Exception:
                result['currency'] = 'EUR'  # Default to EUR for European securities
        else:
            result['current_price'] = None
            result['currency'] = 'EUR'

        return result


# Convenience function for direct use
def lookup_isin(isin: str, api_key: Optional[str] = None, fetch_price: bool = True) -> Dict[str, Any]:
    """
    Convenience function to lookup ISIN.

    Usage:
        data = lookup_isin("IE00BK5BQT80")
        print(data['symbol'])  # VWCE.DE
        print(data['name'])    # VANGUARD FTSE ALL-WORLD UCITS ETF USD ACC
    """
    return ISINLookup.lookup_complete(isin, api_key, fetch_price)
