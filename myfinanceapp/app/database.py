"""
Finance Tracker - Database Layer
Handles all database operations using SQLite
"""
import sqlite3
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
import json
from pathlib import Path
import time
import yfinance as yf
from contextlib import contextmanager
from functools import wraps

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Suppress yfinance error logging for 404s (symbol not found)
# These are expected errors when symbols don't exist and are handled gracefully
yf_logger = logging.getLogger('yfinance')
yf_logger.setLevel(logging.CRITICAL)


# ==================== CUSTOM EXCEPTIONS ====================
class DatabaseError(Exception):
    """Base exception for database operations."""
    pass


class DatabaseConnectionError(DatabaseError):
    """Connection to database failed."""
    pass


class DatabaseIntegrityError(DatabaseError):
    """Database integrity constraint violated."""
    pass


# ==================== GENERIC CRUD CLASS ====================
class SimpleCRUD:
    """
    Generic CRUD operations for simple name-based tables.

    This class eliminates code duplication for tables that follow the pattern:
    - Single name column
    - Simple get/add/delete operations
    - Foreign key checks before deletion

    Usage:
        bank_crud = SimpleCRUD(db, 'banks', {'accounts': 'bank_id'})
        banks = bank_crud.get_all()
        bank_id = bank_crud.add('Deutsche Bank')
        success = bank_crud.delete(bank_id)
    """

    def __init__(self, db_instance, table_name: str, foreign_key_checks: Dict[str, str] = None):
        """
        Initialize CRUD helper for a specific table.

        Args:
            db_instance: Reference to FinanceDatabase instance
            table_name: Name of the database table
            foreign_key_checks: Dict of {table: column} to check before delete
                               e.g., {'accounts': 'bank_id'} checks if any accounts reference this bank
        """
        self.db = db_instance
        self.table = table_name
        self.fk_checks = foreign_key_checks or {}

    def get_all(self) -> List[Dict[str, Any]]:
        """Get all records from the table, ordered by name."""
        try:
            with self.db.db_connection(commit=False) as conn:
                cursor = conn.cursor()
                cursor.execute(f"SELECT * FROM {self.table} ORDER BY name")
                rows = cursor.fetchall()
                logger.debug(f"Retrieved {len(rows)} records from {self.table}")
                return [dict(row) for row in rows]
        except DatabaseError as e:
            logger.error(f"Failed to retrieve {self.table}: {e}")
            raise

    def add(self, name: str) -> int:
        """
        Add a new record.

        Args:
            name: Name of the new record

        Returns:
            The ID of the newly created record

        Raises:
            DatabaseIntegrityError: If name already exists
        """
        try:
            with self.db.db_connection(commit=True) as conn:
                cursor = conn.cursor()
                cursor.execute(f"INSERT INTO {self.table} (name) VALUES (?)", (name,))
                item_id = cursor.lastrowid
                logger.info(f"Added {self.table}: {name} (ID: {item_id})")
                return item_id
        except DatabaseIntegrityError as e:
            logger.error(f"{self.table.capitalize()} creation failed - duplicate name: {name}")
            raise DatabaseIntegrityError(f"{self.table.capitalize()} '{name}' already exists") from e
        except DatabaseError as e:
            logger.error(f"Failed to add {self.table}: {e}")
            raise

    def update(self, item_id: int, name: str) -> bool:
        """
        Update a record's name.

        Args:
            item_id: ID of the record to update
            name: New name for the record

        Returns:
            True if updated successfully, False if not found

        Raises:
            DatabaseIntegrityError: If name already exists
        """
        try:
            with self.db.db_connection(commit=True) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    f"UPDATE {self.table} SET name = ? WHERE id = ?",
                    (name, item_id)
                )
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Updated {self.table} {item_id}: {name}")
                else:
                    logger.warning(f"{self.table.capitalize()} {item_id} not found")
                return success
        except DatabaseIntegrityError as e:
            logger.error(f"{self.table.capitalize()} update failed - duplicate name: {name}")
            raise DatabaseIntegrityError(f"{self.table.capitalize()} '{name}' already exists") from e
        except DatabaseError as e:
            logger.error(f"Failed to update {self.table} {item_id}: {e}")
            raise

    def delete(self, item_id: int) -> bool:
        """
        Delete a record if not referenced by foreign keys.

        Args:
            item_id: ID of the record to delete

        Returns:
            True if deleted, False if record is in use or not found
        """
        try:
            with self.db.db_connection(commit=True) as conn:
                cursor = conn.cursor()

                # Check foreign key constraints
                for check_table, check_column in self.fk_checks.items():
                    cursor.execute(
                        f"SELECT COUNT(*) FROM {check_table} WHERE {check_column} = ?",
                        (item_id,)
                    )
                    if cursor.fetchone()[0] > 0:
                        logger.warning(
                            f"Cannot delete {self.table} {item_id} - "
                            f"has associated records in {check_table}"
                        )
                        return False

                cursor.execute(f"DELETE FROM {self.table} WHERE id = ?", (item_id,))
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Deleted {self.table} {item_id}")
                else:
                    logger.warning(f"{self.table.capitalize()} {item_id} not found")
                return success
        except DatabaseError as e:
            logger.error(f"Failed to delete {self.table} {item_id}: {e}")
            raise


class FinanceDatabase:
    """Handle all database operations for Finance Tracker."""

    def __init__(self, db_path: str = "data/finance.db"):
        """Initialize database connection."""
        # Ensure data directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        self.db_path = db_path
        self._init_database()

        # Initialize CRUD helpers for simple tables
        self._bank_crud = SimpleCRUD(self, 'banks', {'accounts': 'bank_id'})
        self._owner_crud = SimpleCRUD(self, 'owners', {'accounts': 'owner_id'})

        logger.info(f"Database initialized at {db_path}")

    def _check_table_exists(self, cursor, table_name: str) -> bool:
        """Check if a table exists."""
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        )
        return cursor.fetchone() is not None

    def _get_connection(self):
        """Get database connection."""
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def db_connection(self, commit: bool = True):
        """
        Context manager for database connections with automatic cleanup and error handling.

        Usage:
            with self.db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM accounts")
                return [dict(row) for row in cursor.fetchall()]

        Args:
            commit: Whether to commit changes on success (default True)

        Yields:
            sqlite3.Connection: Database connection

        Raises:
            DatabaseConnectionError: If connection fails
            DatabaseError: If query execution fails
        """
        conn = None
        try:
            conn = self._get_connection()
            yield conn
            if commit:
                conn.commit()
        except sqlite3.OperationalError as e:
            if conn:
                conn.rollback()
            logger.error(f"Database operational error: {e}")
            raise DatabaseConnectionError(f"Database connection failed: {e}") from e
        except sqlite3.IntegrityError as e:
            if conn:
                conn.rollback()
            logger.error(f"Database integrity error: {e}")
            raise DatabaseIntegrityError(f"Data integrity violation: {e}") from e
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise DatabaseError(f"Database operation failed: {e}") from e
        finally:
            if conn:
                conn.close()

    def _safe_update(
        self,
        table: str,
        item_id: int,
        updates: Dict[str, Any],
        allowed_columns: set,
        id_column: str = 'id'
    ) -> bool:
        """
        Perform a safe update with column whitelisting to prevent SQL injection.

        Args:
            table: Name of the table to update
            item_id: ID of the record to update
            updates: Dictionary of column names and new values
            allowed_columns: Set of allowed column names
            id_column: Name of the ID column (default: 'id')

        Returns:
            True if update succeeded, False otherwise

        Raises:
            ValueError: If invalid column names are provided
            DatabaseError: If update fails
        """
        # Validate all keys are allowed
        invalid_keys = set(updates.keys()) - allowed_columns
        if invalid_keys:
            raise ValueError(f"Invalid columns for {table} update: {invalid_keys}")

        if not updates:
            raise ValueError(f"No valid updates provided for {table}")

        try:
            with self.db_connection(commit=True) as conn:
                cursor = conn.cursor()
                set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
                values = list(updates.values()) + [item_id]

                cursor.execute(
                    f"UPDATE {table} SET {set_clause} WHERE {id_column} = ?",
                    values
                )

                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Updated {table} {item_id}: {list(updates.keys())}")
                else:
                    logger.warning(f"{table.capitalize()} {item_id} not found for update")
                return success
        except DatabaseError as e:
            logger.error(f"Failed to update {table} {item_id}: {e}")
            raise

    def _init_database(self):
        """Create database tables if they don't exist."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Banks table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS banks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Owners table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS owners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Currencies table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS currencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                symbol TEXT,
                exchange_rate_to_eur REAL NOT NULL DEFAULT 1.0,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Insert default currencies if table is empty
        cursor.execute("SELECT COUNT(*) as count FROM currencies")
        if cursor.fetchone()['count'] == 0:
            default_currencies = [
                ('EUR', 'Euro', '€', 1.0, 1),
                ('SEK', 'Swedish Krona', 'kr', 0.088, 1),  # ~11.4 SEK = 1 EUR
                ('DKK', 'Danish Krone', 'kr', 0.134, 1),  # ~7.5 DKK = 1 EUR
            ]
            cursor.executemany("""
                INSERT INTO currencies (code, name, symbol, exchange_rate_to_eur, is_active)
                VALUES (?, ?, ?, ?, ?)
            """, default_currencies)

        # Accounts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bank_id INTEGER,
                name TEXT NOT NULL,
                account_type TEXT NOT NULL CHECK(account_type IN ('cash', 'investment', 'savings', 'checking')),
                currency TEXT NOT NULL,
                owner_id INTEGER NOT NULL,
                opening_date DATE,
                balance REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (bank_id) REFERENCES banks(id),
                FOREIGN KEY (owner_id) REFERENCES owners(id),
                FOREIGN KEY (currency) REFERENCES currencies(code)
            )
        """)

        # Transaction types
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transaction_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL CHECK(category IN ('income', 'expense', 'transfer')),
                icon TEXT,
                color TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Transaction subtypes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transaction_subtypes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (type_id) REFERENCES transaction_types(id) ON DELETE CASCADE,
                UNIQUE(type_id, name)
            )
        """)

        # Transactions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                transaction_date DATE NOT NULL,
                due_date DATE,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                description TEXT,
                destinataire TEXT NOT NULL,
                type_id INTEGER NOT NULL,
                subtype_id INTEGER NOT NULL,
                tags TEXT,
                transfer_account_id INTEGER,
                is_transfer BOOLEAN DEFAULT 0,
                is_duplicate_flag BOOLEAN DEFAULT 0,
                recurring_template_id INTEGER,
                confirmed BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (type_id) REFERENCES transaction_types(id),
                FOREIGN KEY (subtype_id) REFERENCES transaction_subtypes(id),
                FOREIGN KEY (transfer_account_id) REFERENCES accounts(id)
            )
        """)


        # Envelopes (Savings Goals)
        cursor.execute("""   
            CREATE TABLE IF NOT EXISTS envelopes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0,
                deadline DATE,
                color TEXT DEFAULT '#4ECDC4',
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Envelope Transactions (Money Allocations)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS envelope_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                envelope_id INTEGER NOT NULL,
                transaction_date DATE NOT NULL,
                amount REAL NOT NULL,
                account_id INTEGER NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )
        """)

        # Recurring transaction templates
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recurring_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                account_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                description TEXT,
                destinataire TEXT NOT NULL,
                type_id INTEGER NOT NULL,
                subtype_id INTEGER NOT NULL,
                tags TEXT,
                recurrence_pattern TEXT NOT NULL CHECK(recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
                recurrence_interval INTEGER DEFAULT 1,
                day_of_month INTEGER,
                start_date DATE NOT NULL,
                end_date DATE,
                last_generated DATE,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (type_id) REFERENCES transaction_types(id),
                FOREIGN KEY (subtype_id) REFERENCES transaction_subtypes(id)
            )
        """)

        # Pending transactions (awaiting confirmation)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recurring_template_id INTEGER NOT NULL,
                transaction_date DATE NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                description TEXT,
                destinataire TEXT NOT NULL,
                account_id INTEGER NOT NULL,
                type_id INTEGER NOT NULL,
                subtype_id INTEGER NOT NULL,
                tags TEXT,
                notified BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recurring_template_id) REFERENCES recurring_templates(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (type_id) REFERENCES transaction_types(id),
                FOREIGN KEY (subtype_id) REFERENCES transaction_subtypes(id)
            )
        """)

        # Debt tracking table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS debts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                principal_amount REAL NOT NULL,
                current_balance REAL NOT NULL,
                interest_rate REAL NOT NULL,
                interest_type TEXT NOT NULL CHECK(interest_type IN ('simple', 'compound')),
                monthly_payment REAL NOT NULL,
                payment_day INTEGER NOT NULL,
                start_date DATE NOT NULL,
                linked_account_id INTEGER,
                is_active BOOLEAN DEFAULT 1,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (linked_account_id) REFERENCES accounts(id)
            )
        """)

        # Debt payments tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS debt_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debt_id INTEGER NOT NULL,
                transaction_id INTEGER NOT NULL,
                payment_date DATE NOT NULL,
                amount REAL NOT NULL,
                principal_paid REAL NOT NULL,
                interest_paid REAL NOT NULL,
                extra_payment REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id)
            )
        """)

        # Budget table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                period TEXT DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
                start_date DATE NOT NULL,
                end_date DATE,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (type_id) REFERENCES transaction_types(id)
            )
        """)

        # Securities master table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS securities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                investment_type TEXT NOT NULL CHECK(investment_type IN ('stock', 'etf', 'mutual_fund', 'bond', 'crypto')),
                isin TEXT UNIQUE,
                exchange TEXT,
                currency TEXT NOT NULL,
                sector TEXT,
                country TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Investment holdings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS investment_holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                security_id INTEGER NOT NULL,
                quantity REAL DEFAULT 0,
                average_cost REAL DEFAULT 0,
                currency TEXT NOT NULL,
                current_price REAL DEFAULT 0,
                last_price_update TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (security_id) REFERENCES securities(id),
                UNIQUE(account_id, security_id)
            )
        """)

        # Migration: Add notes column to investment_holdings if it doesn't exist
        cursor.execute("PRAGMA table_info(investment_holdings)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'notes' not in columns:
            cursor.execute("ALTER TABLE investment_holdings ADD COLUMN notes TEXT")
            logger.info("Added notes column to investment_holdings table")

        # Migration: Add linked_account_id column to accounts if it doesn't exist
        cursor.execute("PRAGMA table_info(accounts)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'linked_account_id' not in columns:
            cursor.execute("ALTER TABLE accounts ADD COLUMN linked_account_id INTEGER REFERENCES accounts(id)")
            logger.info("Added linked_account_id column to accounts table")

        # Migration: Add opening_balance column to accounts if it doesn't exist
        cursor.execute("PRAGMA table_info(accounts)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'opening_balance' not in columns:
            cursor.execute("ALTER TABLE accounts ADD COLUMN opening_balance REAL")
            # For existing accounts, set opening_balance to current balance
            cursor.execute("UPDATE accounts SET opening_balance = balance WHERE opening_balance IS NULL")
            conn.commit()
            logger.info("Added opening_balance column to accounts table and populated with current balances")

        # Migration: Add is_historical column to transactions if it doesn't exist
        cursor.execute("PRAGMA table_info(transactions)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'is_historical' not in columns:
            cursor.execute("ALTER TABLE transactions ADD COLUMN is_historical BOOLEAN DEFAULT 0")
            logger.info("Added is_historical column to transactions table")

        # Migration: Add ISIN column if it doesn't exist (for existing databases)
        cursor.execute("PRAGMA table_info(investment_holdings)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'isin' not in columns:
            cursor.execute("ALTER TABLE investment_holdings ADD COLUMN isin TEXT")
            logger.info("Added ISIN column to investment_holdings table")

        # Migration: Check if we need to migrate from old investment_holdings schema to new one with securities
        cursor.execute("PRAGMA table_info(investment_holdings)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # If the table has 'symbol' and 'name' columns but no 'security_id', we need to migrate
        if 'symbol' in columns and 'name' in columns and 'security_id' not in columns:
            logger.info("Migrating investment_holdings to use securities table...")
            
            # Create a backup of the old table
            cursor.execute("ALTER TABLE investment_holdings RENAME TO investment_holdings_old")
            
            # Create the new table structure
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS investment_holdings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    security_id INTEGER NOT NULL,
                    quantity REAL DEFAULT 0,
                    average_cost REAL DEFAULT 0,
                    currency TEXT NOT NULL,
                    current_price REAL DEFAULT 0,
                    last_price_update TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    FOREIGN KEY (security_id) REFERENCES securities(id),
                    UNIQUE(account_id, security_id)
                )
            """)
            
            # Migrate data from old table to new structure
            cursor.execute("SELECT * FROM investment_holdings_old")
            old_holdings = cursor.fetchall()
            
            for holding in old_holdings:
                # Create security entry
                cursor.execute("""
                    INSERT OR IGNORE INTO securities 
                    (symbol, name, investment_type, isin, currency, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    holding['symbol'],
                    holding['name'],
                    holding['investment_type'],
                    holding['isin'] if 'isin' in holding.keys() else None,
                    holding['currency'],
                    ''
                ))
                
                # Get the security ID
                cursor.execute("SELECT id FROM securities WHERE symbol = ?", (holding['symbol'],))
                security_row = cursor.fetchone()
                security_id = security_row['id']
                
                # Insert into new holdings table
                cursor.execute("""
                    INSERT INTO investment_holdings 
                    (id, account_id, security_id, quantity, average_cost, currency, current_price, last_price_update, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    holding['id'],
                    holding['account_id'],
                    security_id,
                    0,  # quantity will be calculated from transactions
                    0,  # average_cost will be calculated from transactions
                    holding['currency'],
                    holding['current_price'],
                    holding['last_price_update'],
                    holding['created_at']
                ))
            
            # Drop the old table
            cursor.execute("DROP TABLE investment_holdings_old")
            
            conn.commit()
            logger.info("Successfully migrated investment_holdings to use securities table")

        # Investment transactions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS investment_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                holding_id INTEGER NOT NULL,
                transaction_type TEXT NOT NULL CHECK(transaction_type IN ('buy', 'sell', 'dividend')),
                transaction_date DATE NOT NULL,
                shares REAL,
                price_per_share REAL,
                total_amount REAL NOT NULL,
                fees REAL DEFAULT 0,
                currency TEXT NOT NULL,
                notes TEXT,
                linked_transaction_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (holding_id) REFERENCES investment_holdings(id) ON DELETE CASCADE,
                FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id)
            )
        """)

        #User mode preference
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Balance validations table - for monthly account reconciliation
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS balance_validations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                validation_date DATE NOT NULL,
                system_balance REAL NOT NULL,
                actual_balance REAL NOT NULL,
                difference REAL NOT NULL,
                is_match BOOLEAN NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
        """)

        # Work profiles table - for work hours calculator
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS work_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL UNIQUE,
                monthly_salary REAL NOT NULL,
                working_hours_per_month REAL NOT NULL,
                hourly_rate REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'EUR',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
            )
        """)

        # Database migrations - add columns if they don't exist
        # Check if linked_debt_id column exists in recurring_templates
        cursor.execute("PRAGMA table_info(recurring_templates)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'linked_debt_id' not in columns:
            cursor.execute("ALTER TABLE recurring_templates ADD COLUMN linked_debt_id INTEGER")
            logger.info("Added linked_debt_id column to recurring_templates")
            # Note: SQLite doesn't support adding FOREIGN KEY constraints via ALTER TABLE
            # The constraint will be enforced at the application level

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_envelope_transactions_envelope ON envelope_transactions(envelope_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_envelope_transactions_date ON envelope_transactions(transaction_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_templates(is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recurring_templates_debt ON recurring_templates(linked_debt_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pending_transactions_date ON pending_transactions(transaction_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_debt_payments_date ON debt_payments(payment_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_budgets_type ON budgets(type_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_investment_holdings_account ON investment_holdings(account_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_investment_holdings_security ON investment_holdings(security_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_securities_symbol ON securities(symbol)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_securities_isin ON securities(isin)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_investment_transactions_holding ON investment_transactions(holding_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_investment_transactions_date ON investment_transactions(transaction_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_balance_validations_account ON balance_validations(account_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_balance_validations_date ON balance_validations(validation_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_work_profiles_owner ON work_profiles(owner_id)")

        # Schema migrations - Add tags column to envelopes if it doesn't exist
        cursor.execute("PRAGMA table_info(envelopes)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'tags' not in columns:
            cursor.execute("ALTER TABLE envelopes ADD COLUMN tags TEXT")
            logger.info("Added tags column to envelopes table")

        conn.commit()

        # Insert default data if tables are empty
        cursor.execute("SELECT COUNT(*) FROM owners")
        if cursor.fetchone()[0] == 0:
            self._insert_default_data(cursor)
            conn.commit()

        conn.close()

    def _insert_default_data(self, cursor):
        """Insert default owners and transaction types."""
        logger.info("Inserting default data...")
        
        # Default owners
        default_owners = ["Me", "Wife", "Investor"]
        for owner in default_owners:
            cursor.execute("INSERT OR IGNORE INTO owners (name) VALUES (?)", (owner,))

        # Default transaction types and subtypes (keeping existing structure)
        default_types = {
            "Food": {
                "category": "expense",
                "icon": "🍔",
                "color": "#FF6B6B",
                "subtypes": ["Groceries", "Restaurant", "Bar", "Fastfood", "Bakery"]
            },
            "Housing": {
                "category": "expense",
                "icon": "🏠",
                "color": "#4ECDC4",
                "subtypes": ["Rent", "Mortgage", "Utilities", "Maintenance", "Insurance"]
            },
            "Transport": {
                "category": "expense",
                "icon": "🚗",
                "color": "#45B7D1",
                "subtypes": ["Fuel", "Public Transport", "Car Maintenance", "Parking", "Taxi/Uber"]
            },
            "Entertainment": {
                "category": "expense",
                "icon": "🎮",
                "color": "#96CEB4",
                "subtypes": ["Movies", "Games", "Sports", "Hobbies", "Subscriptions"]
            },
            "Shopping": {
                "category": "expense",
                "icon": "🛍️",
                "color": "#FFEAA7",
                "subtypes": ["Clothing", "Electronics", "Home Goods", "Gifts", "Personal Care"]
            },
            "Health": {
                "category": "expense",
                "icon": "⚕️",
                "color": "#DFE6E9",
                "subtypes": ["Doctor", "Pharmacy", "Insurance", "Gym", "Wellness"]
            },
            "Education": {
                "category": "expense",
                "icon": "📚",
                "color": "#A29BFE",
                "subtypes": ["Tuition", "Books", "Courses", "Supplies"]
            },
            "Investments": {
                "category": "expense",
                "icon": "📊",
                "color": "#6C5CE7",
                "subtypes": ["Securities Purchase", "Investment Fees", "Trading Costs"]
            },
            "Salary": {
                "category": "income",
                "icon": "💰",
                "color": "#00B894",
                "subtypes": ["Monthly Salary", "Bonus", "Overtime"]
            },
            "Investment Income": {
                "category": "income",
                "icon": "📈",
                "color": "#6C5CE7",
                "subtypes": ["Dividends", "Interest", "Sale Proceeds", "Rental Income"]
            },
            "Other Income": {
                "category": "income",
                "icon": "💵",
                "color": "#FDCB6E",
                "subtypes": ["Gift", "Refund", "Side Hustle", "Miscellaneous"]
            },
            "Transfer": {
                "category": "transfer",
                "icon": "🔄",
                "color": "#636E72",
                "subtypes": ["Between Accounts", "To Savings", "From Savings"]
            },
            "Envelope": {
                "category": "expense",
                "icon": "🐷",
                "color": "#FD79A8",
                "subtypes": ["Savings Goal"]
            },
            "Debt": {
                "category": "expense",
                "icon": "💳",
                "color": "#E17055",
                "subtypes": ["Loan Payment", "Credit Card", "Mortgage"]
            }
        }

        for type_name, type_data in default_types.items():
            cursor.execute(
                "INSERT OR IGNORE INTO transaction_types (name, category, icon, color) VALUES (?, ?, ?, ?)",
                (type_name, type_data["category"], type_data["icon"], type_data["color"])
            )
            
            cursor.execute("SELECT id FROM transaction_types WHERE name = ?", (type_name,))
            result = cursor.fetchone()
            if result:
                type_id = result[0]
                for subtype_name in type_data["subtypes"]:
                    cursor.execute(
                        "INSERT OR IGNORE INTO transaction_subtypes (type_id, name) VALUES (?, ?)",
                        (type_id, subtype_name)
                    )
    # ==================== MODE PREFERENCES ====================
    def get_preference(self, key: str, default: str = "") -> str:
        """Get user preference value."""
        try:
            with self.db_connection(commit=False) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM user_preferences WHERE key = ?", (key,))
                result = cursor.fetchone()
                return result['value'] if result else default
        except DatabaseError as e:
            logger.warning(f"Failed to get preference '{key}': {e}")
            return default

    def set_preference(self, key: str, value: str):
        """Set user preference value."""
        try:
            with self.db_connection(commit=True) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO user_preferences (key, value, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
                """, (key, value, value))
                logger.info(f"Set preference '{key}' = '{value}'")
        except DatabaseError as e:
            logger.error(f"Failed to set preference '{key}': {e}")
            raise

    def convert_currency(self, amount: float, from_currency: str, to_currency: str) -> float:
        """Convert amount from one currency to another using stored exchange rates from currencies table."""
        if from_currency == to_currency:
            return amount

        try:
            with self.db_connection(commit=False) as conn:
                cursor = conn.cursor()

                # Get exchange rate for from_currency
                cursor.execute(
                    "SELECT exchange_rate_to_eur FROM currencies WHERE code = ? AND is_active = 1",
                    (from_currency,)
                )
                from_result = cursor.fetchone()
                from_rate = from_result['exchange_rate_to_eur'] if from_result else 1.0

                # Get exchange rate for to_currency
                cursor.execute(
                    "SELECT exchange_rate_to_eur FROM currencies WHERE code = ? AND is_active = 1",
                    (to_currency,)
                )
                to_result = cursor.fetchone()
                to_rate = to_result['exchange_rate_to_eur'] if to_result else 1.0

            # Convert: amount -> EUR -> target currency
            # If rate is 0.134, it means 1 currency_unit = 0.134 EUR
            # So to convert to EUR: amount * rate
            # And from EUR to target: amount_in_eur / target_rate
            amount_in_eur = amount * from_rate
            amount_in_target = amount_in_eur / to_rate

            return amount_in_target
        except Exception as e:
            logger.error(f"Failed to convert currency from {from_currency} to {to_currency}: {e}")
            return amount  # Return original amount if conversion fails

    # ==================== BANKS ====================

    def get_banks(self) -> List[Dict[str, Any]]:
        """Get all banks."""
        return self._bank_crud.get_all()

    def add_bank(self, name: str) -> int:
        """Add a new bank."""
        return self._bank_crud.add(name)

    def update_bank(self, bank_id: int, name: str) -> bool:
        """Update a bank's name."""
        return self._bank_crud.update(bank_id, name)

    def delete_bank(self, bank_id: int) -> bool:
        """Delete a bank if not used."""
        return self._bank_crud.delete(bank_id)

    # ==================== OWNERS ====================

    def get_owners(self) -> List[Dict[str, Any]]:
        """Get all owners."""
        return self._owner_crud.get_all()

    def add_owner(self, name: str) -> int:
        """Add a new owner."""
        return self._owner_crud.add(name)

    def update_owner(self, owner_id: int, name: str) -> bool:
        """Update an owner's name."""
        return self._owner_crud.update(owner_id, name)

    def delete_owner(self, owner_id: int) -> bool:
        """Delete an owner if not used."""
        return self._owner_crud.delete(owner_id)

    # ==================== CURRENCIES ====================
    
    def get_currencies(self) -> List[Dict[str, Any]]:
        """Get all currencies."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM currencies ORDER BY is_default DESC, code")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def add_currency(self, code: str, name: str) -> int:
        """Add a new currency."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO currencies (code, name, is_default) VALUES (?, ?, 0)", (code, name))
        curr_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added currency: {code}")
        return curr_id

    def delete_currency(self, currency_id: int) -> bool:
        """Delete a currency if not used."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if currency has accounts or transactions
        cursor.execute("SELECT COUNT(*) FROM accounts WHERE currency = (SELECT code FROM currencies WHERE id = ?)", (currency_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False
        
        cursor.execute("DELETE FROM currencies WHERE id = ? AND is_default = 0", (currency_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    # ==================== ACCOUNT TYPES ====================
    
    def get_account_types(self) -> List[Dict[str, Any]]:
        """Get all account types."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM account_types ORDER BY is_default DESC, name")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def add_account_type(self, name: str) -> int:
        """Add a new account type."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO account_types (name, is_default) VALUES (?, 0)", (name,))
        type_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added account type: {name}")
        return type_id

    def delete_account_type(self, type_id: int) -> bool:
        """Delete an account type if not used."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if type has accounts
        cursor.execute("SELECT COUNT(*) FROM accounts WHERE account_type = (SELECT name FROM account_types WHERE id = ?)", (type_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False
        
        cursor.execute("DELETE FROM account_types WHERE id = ? AND is_default = 0", (type_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    # ==================== CURRENCIES ====================

    def get_currencies(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all currencies, optionally filtered by active status."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if active_only:
            cursor.execute("""
                SELECT * FROM currencies
                WHERE is_active = 1
                ORDER BY code
            """)
        else:
            cursor.execute("""
                SELECT * FROM currencies
                ORDER BY code
            """)

        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_currency(self, code: str) -> Optional[Dict[str, Any]]:
        """Get a specific currency by code."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM currencies WHERE code = ?", (code,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def add_currency(self, currency_data: Dict[str, Any]) -> int:
        """Add a new currency."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO currencies (code, name, symbol, exchange_rate_to_eur, is_active)
            VALUES (?, ?, ?, ?, ?)
        """, (
            currency_data['code'].upper(),
            currency_data['name'],
            currency_data.get('symbol', ''),
            currency_data.get('exchange_rate_to_eur', 1.0),
            currency_data.get('is_active', 1)
        ))

        currency_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added currency: {currency_data['code']}")
        return currency_id

    def update_currency(self, code: str, **kwargs) -> bool:
        """Update currency details."""
        allowed_columns = {'name', 'symbol', 'exchange_rate_to_eur', 'is_active'}
        return self._safe_update('currencies', code, kwargs, allowed_columns, id_column='code')

    def delete_currency(self, code: str) -> bool:
        """Delete a currency (soft delete by setting is_active = 0)."""
        try:
            return self.update_currency(code, is_active=0)
        except Exception as e:
            logger.error(f"Failed to delete currency {code}: {e}")
            return False

    def get_account_types(self) -> List[str]:
        """Get list of valid account types."""
        return ['cash', 'investment', 'savings', 'checking']

    # ==================== ACCOUNTS ====================
    
    def get_accounts(self, owner_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get all accounts, optionally filtered by owner."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if owner_id:
            cursor.execute("""
                SELECT a.*, b.name as bank_name, o.name as owner_name
                FROM accounts a
                LEFT JOIN banks b ON a.bank_id = b.id
                JOIN owners o ON a.owner_id = o.id
                WHERE a.owner_id = ?
                ORDER BY a.name
            """, (owner_id,))
        else:
            cursor.execute("""
                SELECT a.*, b.name as bank_name, o.name as owner_name
                FROM accounts a
                LEFT JOIN banks b ON a.bank_id = b.id
                JOIN owners o ON a.owner_id = o.id
                ORDER BY a.name
            """)
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_account(self, account_id: int) -> Optional[Dict[str, Any]]:
        """Get a single account by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT a.*, b.name as bank_name, o.name as owner_name
            FROM accounts a
            LEFT JOIN banks b ON a.bank_id = b.id
            JOIN owners o ON a.owner_id = o.id
            WHERE a.id = ?
        """, (account_id,))

        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def add_account(self, account_data: Dict[str, Any]) -> int:
        """
        Add a new account.

        If opening_balance is provided and create_initial_validation is True,
        an initial balance validation checkpoint will be created automatically.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        account_name = (account_data.get('name') or '').strip()
        if not account_name:
            account_type_label = account_data.get('account_type', 'Account')
            account_name = f"{account_type_label.title()} Account"

        opening_balance = account_data.get('opening_balance', account_data.get('balance', 0))
        opening_date = account_data.get('opening_date')

        cursor.execute("""
            INSERT INTO accounts (bank_id, name, account_type, currency, owner_id, opening_date, balance, opening_balance, linked_account_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            account_data.get('bank_id'),
            account_name,
            account_data['account_type'],
            account_data['currency'],
            account_data['owner_id'],
            opening_date,
            opening_balance,
            opening_balance,  # opening_balance same as initial balance
            account_data.get('linked_account_id')
        ))

        account_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Create initial balance validation if requested (and not an investment account with 0 balance)
        create_validation = account_data.get('create_initial_validation', True)
        is_investment = account_data['account_type'] == 'investment'

        if create_validation and opening_date and not (is_investment and opening_balance == 0):
            validation_data = {
                'account_id': account_id,
                'validation_date': opening_date,
                'system_balance': opening_balance,
                'actual_balance': opening_balance,
                'notes': 'Initial opening balance checkpoint'
            }
            self.add_balance_validation(validation_data)
            logger.info(f"Created initial balance validation checkpoint for account {account_id}: {opening_balance}")

        logger.info(f"Added account: {account_name} with opening balance: {opening_balance}")
        return account_id

    def update_account(self, account_id: int, updates: Dict[str, Any]) -> bool:
        """
        Update an existing account.

        Args:
            account_id: ID of the account to update
            updates: Dictionary of column names and new values

        Returns:
            True if account was updated, False otherwise

        Raises:
            ValueError: If invalid column names are provided
            DatabaseError: If update fails
        """
        # Whitelist of allowed columns to prevent SQL injection
        ALLOWED_COLUMNS = {
            'name', 'account_type', 'currency', 'bank_id',
            'owner_id', 'opening_date', 'balance', 'opening_balance',
            'linked_account_id'
        }

        return self._safe_update('accounts', account_id, updates, ALLOWED_COLUMNS)

    def delete_account(self, account_id: int) -> bool:
        """Delete an account if it has no transactions."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if account has transactions
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE account_id = ?", (account_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False
        
        cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def recalculate_all_balances(self) -> Dict[str, int]:
        """
        Recalculate all account balances from scratch based on confirmed transactions.

        This method:
        1. Resets each account to its opening_balance
        2. Processes all non-historical confirmed transactions in chronological order
        3. Updates the current balance

        Historical transactions (before opening_date) are ignored.

        Returns:
            Dictionary with statistics: {'accounts_updated': int, 'transactions_processed': int, 'historical_skipped': int}
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get all accounts with their opening balances
        cursor.execute("SELECT id, opening_balance, opening_date FROM accounts")
        accounts = cursor.fetchall()

        # Reset all account balances to their opening_balance
        for acc in accounts:
            opening_bal = acc['opening_balance'] if acc['opening_balance'] is not None else 0
            cursor.execute("UPDATE accounts SET balance = ? WHERE id = ?", (opening_bal, acc['id']))
            logger.info(f"Reset account {acc['id']} to opening balance: {opening_bal}")

        logger.info(f"Reset {len(accounts)} account balances to their opening balances")

        # Get all confirmed NON-HISTORICAL transactions ordered by date
        cursor.execute("""
            SELECT t.id, t.account_id, t.amount, t.is_transfer, t.transfer_account_id, t.is_historical, tt.category
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.confirmed = 1
            ORDER BY t.transaction_date ASC, t.created_at ASC
        """)
        transactions = cursor.fetchall()

        transactions_processed = 0
        historical_skipped = 0
        processed_transfers = set()  # Track processed same-currency transfers

        for trans in transactions:
            trans_dict = dict(trans)

            # Skip historical transactions (they don't affect balance)
            if trans_dict.get('is_historical', False):
                historical_skipped += 1
                continue

            # Update primary account balance
            self._update_account_balance(
                cursor,
                trans_dict['account_id'],
                trans_dict['amount'],
                trans_dict['category']
            )

            # Handle same-currency transfers (update destination account too)
            if trans_dict['is_transfer'] and trans_dict['transfer_account_id'] and trans_dict['category'] == 'transfer':
                amount = trans_dict['amount']
                trans_id = trans_dict['id']

                # For same-currency transfers, check if it's already been processed
                # (to avoid double-counting when both source and dest transactions exist)
                if amount > 0 and trans_id not in processed_transfers:
                    self._update_account_balance(cursor, trans_dict['transfer_account_id'], amount, 'transfer')
                    processed_transfers.add(trans_id)

            transactions_processed += 1

        conn.commit()
        conn.close()

        logger.info(f"Recalculated balances for {len(accounts)} accounts")
        logger.info(f"Processed {transactions_processed} transactions, skipped {historical_skipped} historical transactions")

        return {
            'accounts_updated': len(accounts),
            'transactions_processed': transactions_processed,
            'historical_skipped': historical_skipped
        }

    def add_balance_validation(self, validation_data: Dict[str, Any]) -> int:
        """
        Record a balance validation/check for an account.

        Args:
            validation_data: Dict with keys:
                - account_id: int
                - validation_date: str (ISO format date)
                - system_balance: float (current balance in app)
                - actual_balance: float (real balance from bank)
                - notes: str (optional)

        Returns:
            validation_id: int
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        system_balance = validation_data['system_balance']
        actual_balance = validation_data['actual_balance']
        difference = actual_balance - system_balance
        is_match = abs(difference) < 0.01  # Match if difference is less than 1 cent

        cursor.execute("""
            INSERT INTO balance_validations
            (account_id, validation_date, system_balance, actual_balance, difference, is_match, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            validation_data['account_id'],
            validation_data['validation_date'],
            system_balance,
            actual_balance,
            difference,
            is_match,
            validation_data.get('notes', '')
        ))

        validation_id = cursor.lastrowid
        conn.commit()
        conn.close()

        if is_match:
            logger.info(f"Balance validation {validation_id}: Match! Account {validation_data['account_id']}")
        else:
            logger.warning(f"Balance validation {validation_id}: Mismatch! Account {validation_data['account_id']}, Difference: {difference}")

        return validation_id

    def get_balance_validations(self, account_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get balance validation history for an account.

        Args:
            account_id: Account ID
            limit: Maximum number of validations to return (default 10)

        Returns:
            List of validation records, most recent first
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT bv.*, a.name as account_name, a.currency
            FROM balance_validations bv
            JOIN accounts a ON bv.account_id = a.id
            WHERE bv.account_id = ?
            ORDER BY bv.validation_date DESC, bv.created_at DESC
            LIMIT ?
        """, (account_id, limit))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_latest_balance_validation(self, account_id: int) -> Optional[Dict[str, Any]]:
        """
        Get the most recent balance validation for an account.

        Args:
            account_id: Account ID

        Returns:
            Validation record dict or None if no validations exist
        """
        validations = self.get_balance_validations(account_id, limit=1)
        return validations[0] if validations else None

    def get_all_latest_validations(self) -> List[Dict[str, Any]]:
        """
        Get the most recent balance validation for each account.

        Returns:
            List of latest validation records for all accounts
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT bv.*, a.name as account_name, a.currency
            FROM balance_validations bv
            JOIN accounts a ON bv.account_id = a.id
            WHERE bv.id IN (
                SELECT MAX(id)
                FROM balance_validations
                GROUP BY account_id
            )
            ORDER BY bv.validation_date DESC
        """)

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def calculate_balance_between_validations(self, account_id: int, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculate expected balance between two validation checkpoints.

        This method is used to verify account balance by:
        1. Starting from the most recent validation checkpoint (or opening balance)
        2. Adding/subtracting all non-historical transactions since that checkpoint
        3. Returning the calculated balance to compare with actual bank balance

        Args:
            account_id: Account ID
            start_date: Start date (ISO format). If None, uses most recent validation date.
            end_date: End date (ISO format). If None, uses today.

        Returns:
            Dict with:
                - starting_balance: float
                - starting_date: str
                - ending_date: str
                - transaction_count: int
                - calculated_balance: float
                - transactions: List[Dict] (for debugging)
        """
        from datetime import date as dt_date

        conn = self._get_connection()
        cursor = conn.cursor()

        # Get account info
        cursor.execute("SELECT opening_date, opening_balance, balance FROM accounts WHERE id = ?", (account_id,))
        account = cursor.fetchone()
        if not account:
            conn.close()
            raise ValueError(f"Account {account_id} not found")

        # Determine start date and starting balance
        if start_date is None:
            # Use most recent validation
            latest_validation = self.get_latest_balance_validation(account_id)
            if latest_validation:
                start_date = latest_validation['validation_date']
                starting_balance = latest_validation['actual_balance']
                logger.info(f"Using last validation checkpoint: {start_date} with balance {starting_balance}")
            else:
                # No validation exists, use opening balance
                start_date = account['opening_date']
                starting_balance = account['opening_balance'] if account['opening_balance'] is not None else 0
                logger.info(f"No validation found, using opening balance: {starting_balance} from {start_date}")
        else:
            # Start date provided, find validation at or before that date
            cursor.execute("""
                SELECT actual_balance, validation_date
                FROM balance_validations
                WHERE account_id = ? AND validation_date <= ?
                ORDER BY validation_date DESC
                LIMIT 1
            """, (account_id, start_date))
            validation = cursor.fetchone()
            if validation:
                starting_balance = validation['actual_balance']
                start_date = validation['validation_date']
            else:
                starting_balance = account['opening_balance'] if account['opening_balance'] is not None else 0
                start_date = account['opening_date']

        # Determine end date
        if end_date is None:
            end_date = dt_date.today().isoformat()

        # Get all non-historical confirmed transactions between start and end date
        cursor.execute("""
            SELECT t.*, tt.category, tt.name as type_name, ts.name as subtype_name
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            LEFT JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            WHERE t.account_id = ?
              AND t.transaction_date > ?
              AND t.transaction_date <= ?
              AND t.confirmed = 1
              AND t.is_historical = 0
            ORDER BY t.transaction_date ASC, t.created_at ASC
        """, (account_id, start_date, end_date))

        transactions = cursor.fetchall()
        conn.close()

        # Calculate balance changes
        balance = starting_balance
        transaction_list = []

        for trans in transactions:
            trans_dict = dict(trans)
            category = trans_dict['category']
            amount = trans_dict['amount']

            # Calculate impact on balance
            if category == 'income':
                balance += amount
                impact = amount
            elif category == 'expense':
                balance -= amount
                impact = -amount
            elif category == 'transfer':
                balance += amount  # Transfers are already signed
                impact = amount
            else:
                impact = 0

            transaction_list.append({
                'id': trans_dict['id'],
                'date': trans_dict['transaction_date'],
                'type': trans_dict['type_name'],
                'subtype': trans_dict['subtype_name'],
                'amount': amount,
                'impact': impact,
                'balance_after': balance,
                'destinataire': trans_dict['destinataire']
            })

        return {
            'starting_balance': starting_balance,
            'starting_date': start_date,
            'ending_date': end_date,
            'transaction_count': len(transactions),
            'calculated_balance': balance,
            'transactions': transaction_list
        }

    # ==================== WORK PROFILES ====================

    def add_or_update_work_profile(self, profile_data: Dict[str, Any]) -> int:
        """
        Add or update a work profile for an owner.

        Args:
            profile_data: Dict with keys:
                - owner_id: int
                - monthly_salary: float (net salary after taxes)
                - working_hours_per_month: float
                - currency: str (optional, defaults to 'EUR')

        Returns:
            profile_id: int
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Calculate hourly rate
        monthly_salary = profile_data['monthly_salary']
        working_hours = profile_data['working_hours_per_month']
        hourly_rate = monthly_salary / working_hours if working_hours > 0 else 0

        # Check if profile exists
        cursor.execute("SELECT id FROM work_profiles WHERE owner_id = ?", (profile_data['owner_id'],))
        existing = cursor.fetchone()

        if existing:
            # Update existing profile
            cursor.execute("""
                UPDATE work_profiles
                SET monthly_salary = ?, working_hours_per_month = ?, hourly_rate = ?,
                    currency = ?, updated_at = CURRENT_TIMESTAMP
                WHERE owner_id = ?
            """, (
                monthly_salary,
                working_hours,
                hourly_rate,
                profile_data.get('currency', 'EUR'),
                profile_data['owner_id']
            ))
            profile_id = existing['id']
            logger.info(f"Updated work profile for owner {profile_data['owner_id']}")
        else:
            # Insert new profile
            cursor.execute("""
                INSERT INTO work_profiles
                (owner_id, monthly_salary, working_hours_per_month, hourly_rate, currency)
                VALUES (?, ?, ?, ?, ?)
            """, (
                profile_data['owner_id'],
                monthly_salary,
                working_hours,
                hourly_rate,
                profile_data.get('currency', 'EUR')
            ))
            profile_id = cursor.lastrowid
            logger.info(f"Created work profile for owner {profile_data['owner_id']}")

        conn.commit()
        conn.close()

        return profile_id

    def get_work_profile(self, owner_id: int) -> Optional[Dict[str, Any]]:
        """
        Get work profile for a specific owner.

        Args:
            owner_id: Owner ID

        Returns:
            Profile dict or None if not found
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT wp.*, o.name as owner_name
            FROM work_profiles wp
            JOIN owners o ON wp.owner_id = o.id
            WHERE wp.owner_id = ?
        """, (owner_id,))

        row = cursor.fetchone()
        conn.close()

        return dict(row) if row else None

    def get_all_work_profiles(self) -> List[Dict[str, Any]]:
        """
        Get all work profiles.

        Returns:
            List of profile dicts
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT wp.*, o.name as owner_name
            FROM work_profiles wp
            JOIN owners o ON wp.owner_id = o.id
            ORDER BY o.name
        """)

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def delete_work_profile(self, owner_id: int) -> bool:
        """
        Delete work profile for an owner.

        Args:
            owner_id: Owner ID

        Returns:
            True if deleted, False otherwise
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM work_profiles WHERE owner_id = ?", (owner_id,))
        success = cursor.rowcount > 0

        conn.commit()
        conn.close()

        if success:
            logger.info(f"Deleted work profile for owner {owner_id}")

        return success

    # ==================== TRANSACTION TYPES ====================

    def get_types(self) -> List[Dict[str, Any]]:
        """Get all transaction types."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transaction_types ORDER BY name")
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_subtypes(self, type_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get subtypes, optionally filtered by type."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if type_id:
            cursor.execute("""
                SELECT s.*, t.name as type_name 
                FROM transaction_subtypes s
                JOIN transaction_types t ON s.type_id = t.id
                WHERE s.type_id = ?
                ORDER BY s.name
            """, (type_id,))
        else:
            cursor.execute("""
                SELECT s.*, t.name as type_name 
                FROM transaction_subtypes s
                JOIN transaction_types t ON s.type_id = t.id
                ORDER BY t.name, s.name
            """)

        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_distinct_recipients(self, limit: int = 100) -> List[str]:
        """Get distinct recipients from transactions, ordered by most recent usage."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT DISTINCT destinataire
            FROM transactions
            WHERE destinataire IS NOT NULL AND destinataire != ''
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))

        rows = cursor.fetchall()
        conn.close()

        # Return unique recipients (removing duplicates while preserving order)
        recipients = []
        seen = set()
        for row in rows:
            recipient = row['destinataire']
            if recipient and recipient not in seen:
                recipients.append(recipient)
                seen.add(recipient)

        return sorted(recipients)  # Sort alphabetically for easier selection

    def get_distinct_tags(self, limit: int = 100) -> List[str]:
        """Get distinct tags from transactions and envelopes, ordered by most recent usage."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get tags from transactions
        cursor.execute("""
            SELECT DISTINCT tags
            FROM transactions
            WHERE tags IS NOT NULL AND tags != ''
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))

        transaction_rows = cursor.fetchall()

        # Get tags from envelopes
        cursor.execute("""
            SELECT DISTINCT tags
            FROM envelopes
            WHERE tags IS NOT NULL AND tags != ''
            ORDER BY id DESC
        """)

        envelope_rows = cursor.fetchall()
        conn.close()

        # Parse tags (they might be comma-separated) and return unique tags
        all_tags = []
        seen = set()

        # Process transaction tags
        for row in transaction_rows:
            tags_str = row['tags']
            if tags_str:
                # Split by comma and clean up whitespace
                tags_list = [tag.strip() for tag in tags_str.split(',') if tag.strip()]
                for tag in tags_list:
                    if tag and tag not in seen:
                        all_tags.append(tag)
                        seen.add(tag)

        # Process envelope tags
        for row in envelope_rows:
            tags_str = row['tags']
            if tags_str:
                # Split by comma and clean up whitespace
                tags_list = [tag.strip() for tag in tags_str.split(',') if tag.strip()]
                for tag in tags_list:
                    if tag and tag not in seen:
                        all_tags.append(tag)
                        seen.add(tag)

        return sorted(all_tags)  # Sort alphabetically for easier selection

    def get_tag_report(self, tag: str, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
        """Get detailed report for a specific tag.

        Args:
            tag: The tag to filter by
            start_date: Optional start date filter (ISO format)
            end_date: Optional end date filter (ISO format)

        Returns:
            Dictionary with tag statistics, transactions breakdown
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Build query
        query = """
            SELECT t.*,
                   tt.name as type_name, tt.category, tt.icon, tt.color,
                   ts.name as subtype_name,
                   a.name as account_name,
                   b.name as bank_name,
                   o.name as owner_name
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            JOIN accounts a ON t.account_id = a.id
            LEFT JOIN banks b ON a.bank_id = b.id
            JOIN owners o ON a.owner_id = o.id
            WHERE (t.tags LIKE ? OR t.tags = ?)
        """
        params = [f"%{tag}%", tag]

        if start_date:
            query += " AND t.transaction_date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND t.transaction_date <= ?"
            params.append(end_date)

        query += " ORDER BY t.transaction_date DESC"

        cursor.execute(query, params)
        transactions = [dict(row) for row in cursor.fetchall()]

        # Also get envelope transactions for envelopes with this tag
        env_query = """
            SELECT et.*, e.name as envelope_name, e.tags,
                   a.name as account_name,
                   'Envelope Allocation' as type_name,
                   'envelope' as category
            FROM envelope_transactions et
            JOIN envelopes e ON et.envelope_id = e.id
            JOIN accounts a ON et.account_id = a.id
            WHERE (e.tags LIKE ? OR e.tags = ?)
        """
        env_params = [f"%{tag}%", tag]

        if start_date:
            env_query += " AND et.transaction_date >= ?"
            env_params.append(start_date)
        if end_date:
            env_query += " AND et.transaction_date <= ?"
            env_params.append(end_date)

        env_query += " ORDER BY et.transaction_date DESC"

        cursor.execute(env_query, env_params)
        envelope_transactions = [dict(row) for row in cursor.fetchall()]

        # Get envelopes with this tag and calculate budget vs spending
        cursor.execute("""
            SELECT id, name, target_amount, current_amount, tags
            FROM envelopes
            WHERE (tags LIKE ? OR tags = ?)
            AND is_active = 1
        """, [f"%{tag}%", tag])
        envelopes_with_tag = [dict(row) for row in cursor.fetchall()]
        conn.close()

        # Calculate statistics
        total_transactions = len(transactions) + len(envelope_transactions)
        total_income = sum(t['amount'] for t in transactions if t['category'] == 'income')
        total_expenses = sum(t['amount'] for t in transactions if t['category'] == 'expense')

        # Envelope allocations are treated as expenses (money moved to savings)
        envelope_allocations = sum(et['amount'] for et in envelope_transactions)
        total_expenses += envelope_allocations

        net = total_income - total_expenses

        # Breakdown by category
        by_category = {}
        by_account = {}
        by_month = {}
        by_envelope = {}

        for t in transactions:
            # By category
            cat = t['type_name']
            by_category[cat] = by_category.get(cat, 0) + t['amount']

            # By account
            acc = t['account_name']
            by_account[acc] = by_account.get(acc, 0) + abs(t['amount'])

            # By month
            from datetime import datetime
            trans_date = datetime.fromisoformat(t['transaction_date'])
            month_key = f"{trans_date.year}-{trans_date.month:02d}"
            if month_key not in by_month:
                by_month[month_key] = {'income': 0, 'expenses': 0, 'envelopes': 0}

            if t['category'] == 'income':
                by_month[month_key]['income'] += t['amount']
            elif t['category'] == 'expense':
                by_month[month_key]['expenses'] += t['amount']

        # Process envelope transactions
        for et in envelope_transactions:
            # By category (add to "Envelope Allocation" category)
            by_category['Envelope Allocation'] = by_category.get('Envelope Allocation', 0) + et['amount']

            # By account
            acc = et['account_name']
            by_account[acc] = by_account.get(acc, 0) + abs(et['amount'])

            # By envelope
            env = et['envelope_name']
            by_envelope[env] = by_envelope.get(env, 0) + et['amount']

            # By month
            from datetime import datetime
            trans_date = datetime.fromisoformat(et['transaction_date'])
            month_key = f"{trans_date.year}-{trans_date.month:02d}"
            if month_key not in by_month:
                by_month[month_key] = {'income': 0, 'expenses': 0, 'envelopes': 0}

            by_month[month_key]['envelopes'] += et['amount']

        # Combine all transactions for display
        all_transactions = transactions + envelope_transactions

        # Build envelope budget data
        envelope_budget_data = []

        total_envelope_budget = 0
        for env in envelopes_with_tag:
            envelope_budget_data.append({
                'name': env['name'],
                'budget': env['current_amount'],  # Money available in envelope
                'target': env['target_amount']
            })
            total_envelope_budget += env['current_amount']

        return {
            'tag': tag,
            'start_date': start_date,
            'end_date': end_date,
            'total_transactions': total_transactions,
            'total_income': total_income,
            'total_expenses': total_expenses,
            'envelope_allocations': envelope_allocations,
            'net': net,
            'by_category': by_category,
            'by_account': by_account,
            'by_envelope': by_envelope,
            'by_month': by_month,
            'transactions': all_transactions,
            'envelope_budget_data': envelope_budget_data,
            'total_envelope_budget': total_envelope_budget
        }

    def add_type(self, name: str, category: str, icon: str = None, color: str = None) -> int:
        """Add a new transaction type."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO transaction_types (name, category, icon, color) VALUES (?, ?, ?, ?)",
            (name, category, icon, color)
        )
        type_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added type: {name}")
        return type_id

    def add_subtype(self, type_id: int, name: str) -> int:
        """Add a new transaction subtype."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO transaction_subtypes (type_id, name) VALUES (?, ?)",
            (type_id, name)
        )
        subtype_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added subtype: {name}")
        return subtype_id

    def update_type(self, type_id: int, updates: Dict[str, Any]) -> bool:
        """Update an existing transaction type."""
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [type_id]

        cursor.execute(f"UPDATE transaction_types SET {set_clause} WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def delete_type(self, type_id: int) -> bool:
        """Delete a type if not used."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if type has transactions
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE type_id = ?", (type_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False
        
        cursor.execute("DELETE FROM transaction_types WHERE id = ?", (type_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def update_subtype(self, subtype_id: int, updates: Dict[str, Any]) -> bool:
        """Update an existing subtype."""
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [subtype_id]

        cursor.execute(f"UPDATE transaction_subtypes SET {set_clause} WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def delete_subtype(self, subtype_id: int) -> bool:
        """Delete a subtype if not used."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if subtype has transactions
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE subtype_id = ?", (subtype_id,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False
        
        cursor.execute("DELETE FROM transaction_subtypes WHERE id = ?", (subtype_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    # ==================== TRANSACTIONS ====================

    def _update_account_balance(self, cursor, account_id: int, amount: float, transaction_category: str) -> None:
        """
        Helper method to update account balance based on transaction.

        Args:
            cursor: Database cursor
            account_id: Account to update
            amount: Transaction amount
            transaction_category: 'income', 'expense', or 'transfer'
        """
        if transaction_category == 'income':
            # Income increases balance
            cursor.execute("""
                UPDATE accounts
                SET balance = balance + ?
                WHERE id = ?
            """, (amount, account_id))
        elif transaction_category == 'expense':
            # Expense decreases balance
            cursor.execute("""
                UPDATE accounts
                SET balance = balance - ?
                WHERE id = ?
            """, (amount, account_id))
        elif transaction_category == 'transfer':
            # Transfer: amount is already signed (negative for source, positive for dest in currency conversion)
            # For same-currency transfers, we handle both accounts
            cursor.execute("""
                UPDATE accounts
                SET balance = balance + ?
                WHERE id = ?
            """, (amount, account_id))

        logger.debug(f"Updated balance for account {account_id}: {transaction_category} {amount}")

    def add_transaction(self, transaction_data: Dict[str, Any]) -> int:
        """
        Add a new transaction.

        Transactions dated before the account's opening_date are marked as historical
        and do not affect the account balance.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Check if transaction is historical (before account opening date)
        cursor.execute("SELECT opening_date FROM accounts WHERE id = ?", (transaction_data['account_id'],))
        account = cursor.fetchone()

        is_historical = False
        if account and account['opening_date']:
            transaction_date = transaction_data['transaction_date']
            opening_date = account['opening_date']
            is_historical = transaction_date < opening_date
            if is_historical:
                logger.info(f"Transaction dated {transaction_date} is before account opening {opening_date} - marking as historical")

        # Check for potential duplicates
        cursor.execute("""
            SELECT id FROM transactions
            WHERE account_id = ? AND transaction_date = ? AND amount = ? AND destinataire = ?
            AND created_at > datetime('now', '-5 minutes')
        """, (
            transaction_data['account_id'],
            transaction_data['transaction_date'],
            transaction_data['amount'],
            transaction_data['destinataire']
        ))

        duplicate = cursor.fetchone()
        is_duplicate = bool(duplicate)

        cursor.execute("""
            INSERT INTO transactions
            (account_id, transaction_date, due_date, amount, currency, description,
             destinataire, type_id, subtype_id, tags, transfer_account_id,
             is_transfer, is_duplicate_flag, recurring_template_id, confirmed, is_historical)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            transaction_data['account_id'],
            transaction_data['transaction_date'],
            transaction_data.get('due_date'),
            transaction_data['amount'],
            transaction_data['currency'],
            transaction_data.get('description', ''),
            transaction_data['destinataire'],
            transaction_data['type_id'],
            transaction_data['subtype_id'],
            transaction_data.get('tags', ''),
            transaction_data.get('transfer_account_id'),
            transaction_data.get('is_transfer', False),
            is_duplicate,
            transaction_data.get('recurring_template_id'),
            transaction_data.get('confirmed', True),
            is_historical
        ))

        transaction_id = cursor.lastrowid

        # Update account balance if transaction is confirmed AND not historical
        confirmed = transaction_data.get('confirmed', True)
        if confirmed and not is_historical:
            # Get transaction category
            cursor.execute("SELECT category FROM transaction_types WHERE id = ?", (transaction_data['type_id'],))
            category_row = cursor.fetchone()
            if category_row:
                category = category_row['category']

                # Update primary account balance
                self._update_account_balance(
                    cursor,
                    transaction_data['account_id'],
                    transaction_data['amount'],
                    category
                )

                # Handle same-currency transfers (update destination account too)
                is_transfer = transaction_data.get('is_transfer', False)
                transfer_account_id = transaction_data.get('transfer_account_id')

                if is_transfer and transfer_account_id and category == 'transfer':
                    # For same-currency transfers, the amount is positive
                    # Source account gets negative, destination gets positive
                    amount = transaction_data['amount']

                    # If amount is already negative, this is a currency conversion source transaction
                    # If amount is positive and we have transfer_account_id, this is same-currency transfer
                    if amount > 0:
                        # Same-currency transfer: subtract from source, add to destination
                        self._update_account_balance(cursor, transfer_account_id, amount, 'transfer')
                        logger.info(f"Transfer: Updated destination account {transfer_account_id} with +{amount}")

        conn.commit()
        conn.close()

        if is_duplicate:
            logger.warning(f"Transaction {transaction_id} flagged as potential duplicate")
        else:
            logger.info(f"Added transaction {transaction_id}")

        return transaction_id

    def get_transactions(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get transactions with optional filters."""
        conn = self._get_connection()
        cursor = conn.cursor()

        query = """
            SELECT t.*,
                   tt.name as type_name, tt.category, tt.icon, tt.color,
                   ts.name as subtype_name,
                   a.name as account_name, a.account_type, a.currency as account_currency,
                   b.name as bank_name,
                   o.name as owner_name,
                   ta.name as transfer_account_name, ta.account_type as transfer_account_type,
                   tb.name as transfer_bank_name
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            JOIN accounts a ON t.account_id = a.id
            LEFT JOIN banks b ON a.bank_id = b.id
            JOIN owners o ON a.owner_id = o.id
            LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
            LEFT JOIN banks tb ON ta.bank_id = tb.id
            WHERE 1=1
        """
        params = []

        if filters:
            if 'account_id' in filters:
                query += " AND t.account_id = ?"
                params.append(filters['account_id'])
            if 'start_date' in filters:
                query += " AND t.transaction_date >= ?"
                params.append(filters['start_date'])
            if 'end_date' in filters:
                query += " AND t.transaction_date <= ?"
                params.append(filters['end_date'])
            if 'type_id' in filters:
                query += " AND t.type_id = ?"
                params.append(filters['type_id'])
            if 'destinataire' in filters:
                query += " AND t.destinataire = ?"
                params.append(filters['destinataire'])
            if 'tags' in filters:
                query += " AND t.tags LIKE ?"
                params.append(f"%{filters['tags']}%")

        query += " ORDER BY t.transaction_date DESC, t.created_at DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_transaction(self, transaction_id: int) -> Optional[Dict[str, Any]]:
        """Get a single transaction by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()

        query = """
            SELECT t.*,
                   tt.name as type_name, tt.category, tt.icon, tt.color,
                   ts.name as subtype_name,
                   a.name as account_name, a.account_type, a.currency as account_currency,
                   b.name as bank_name,
                   o.name as owner_name,
                   ta.name as transfer_account_name, ta.account_type as transfer_account_type,
                   tb.name as transfer_bank_name
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            JOIN accounts a ON t.account_id = a.id
            LEFT JOIN banks b ON a.bank_id = b.id
            JOIN owners o ON a.owner_id = o.id
            LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
            LEFT JOIN banks tb ON ta.bank_id = tb.id
            WHERE t.id = ?
        """

        cursor.execute(query, (transaction_id,))
        row = cursor.fetchone()
        conn.close()

        return dict(row) if row else None

    def update_transaction(self, transaction_id: int, updates: Dict[str, Any]) -> bool:
        """Update an existing transaction."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get old transaction data including category
        cursor.execute("""
            SELECT t.*, tt.category
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.id = ?
        """, (transaction_id,))
        old_transaction = cursor.fetchone()

        if not old_transaction:
            conn.close()
            return False

        old_transaction = dict(old_transaction)

        # Reverse old balance if transaction was confirmed
        if old_transaction['confirmed']:
            # Reverse the balance change (negate the amount)
            self._update_account_balance(
                cursor,
                old_transaction['account_id'],
                -old_transaction['amount'],  # Reverse the amount
                old_transaction['category']
            )

            # Reverse transfer destination if applicable
            if old_transaction['is_transfer'] and old_transaction['transfer_account_id'] and old_transaction['category'] == 'transfer':
                if old_transaction['amount'] > 0:  # Same-currency transfer
                    self._update_account_balance(cursor, old_transaction['transfer_account_id'], -old_transaction['amount'], 'transfer')

        # Apply updates
        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [transaction_id]

        cursor.execute(f"UPDATE transactions SET {set_clause} WHERE id = ?", values)
        success = cursor.rowcount > 0

        if success:
            # Get updated transaction data including category
            cursor.execute("""
                SELECT t.*, tt.category
                FROM transactions t
                JOIN transaction_types tt ON t.type_id = tt.id
                WHERE t.id = ?
            """, (transaction_id,))
            new_transaction = dict(cursor.fetchone())

            # Apply new balance if transaction is confirmed
            if new_transaction['confirmed']:
                self._update_account_balance(
                    cursor,
                    new_transaction['account_id'],
                    new_transaction['amount'],
                    new_transaction['category']
                )

                # Apply transfer destination if applicable
                if new_transaction['is_transfer'] and new_transaction['transfer_account_id'] and new_transaction['category'] == 'transfer':
                    if new_transaction['amount'] > 0:  # Same-currency transfer
                        self._update_account_balance(cursor, new_transaction['transfer_account_id'], new_transaction['amount'], 'transfer')

        conn.commit()
        conn.close()

        if success:
            logger.info(f"Updated transaction {transaction_id}")
        return success

    def delete_transaction(self, transaction_id: int) -> bool:
        """Delete a transaction."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get transaction data before deletion to reverse balance
        cursor.execute("""
            SELECT t.*, tt.category
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.id = ?
        """, (transaction_id,))
        transaction = cursor.fetchone()

        if not transaction:
            conn.close()
            return False

        transaction = dict(transaction)

        # Reverse balance if transaction was confirmed
        if transaction['confirmed']:
            # Reverse the balance change (negate the amount)
            self._update_account_balance(
                cursor,
                transaction['account_id'],
                -transaction['amount'],  # Reverse the amount
                transaction['category']
            )

            # Reverse transfer destination if applicable
            if transaction['is_transfer'] and transaction['transfer_account_id'] and transaction['category'] == 'transfer':
                if transaction['amount'] > 0:  # Same-currency transfer
                    self._update_account_balance(cursor, transaction['transfer_account_id'], -transaction['amount'], 'transfer')

        # Delete the transaction
        cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))

        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            logger.info(f"Deleted transaction {transaction_id}")
        return success

    # ==================== EXPORT ====================

    def export_to_json(self, start_date: str = None, end_date: str = None) -> str:
        """Export transactions to JSON."""
        filters = {}
        if start_date:
            filters['start_date'] = start_date
        if end_date:
            filters['end_date'] = end_date

        transactions = self.get_transactions(filters)
        
        export_data = {
            "export_date": datetime.now().isoformat(),
            "start_date": start_date,
            "end_date": end_date,
            "transaction_count": len(transactions),
            "transactions": transactions
        }

        return json.dumps(export_data, indent=2, default=str)

    # ==================== ENVELOPES ====================

    def get_envelopes(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all envelopes."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if include_inactive:
            cursor.execute("SELECT * FROM envelopes ORDER BY is_active DESC, name")
        else:
            cursor.execute("SELECT * FROM envelopes WHERE is_active = 1 ORDER BY name")
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_envelope(self, envelope_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific envelope."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM envelopes WHERE id = ?", (envelope_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def add_envelope(self, envelope_data: Dict[str, Any]) -> int:
        """Add a new envelope."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO envelopes
            (name, description, target_amount, current_amount, deadline, color, is_active, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            envelope_data['name'],
            envelope_data.get('description', ''),
            envelope_data['target_amount'],
            envelope_data.get('current_amount', 0),
            envelope_data.get('deadline'),
            envelope_data.get('color', '#4ECDC4'),
            envelope_data.get('is_active', 1),
            envelope_data.get('tags', '')
        ))

        envelope_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added envelope: {envelope_data['name']}")
        return envelope_id

    def update_envelope(self, envelope_id: int, updates: Dict[str, Any]) -> bool:
        """Update an existing envelope."""
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [envelope_id]

        cursor.execute(f"UPDATE envelopes SET {set_clause} WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            logger.info(f"Updated envelope {envelope_id}")
        return success

    def delete_envelope(self, envelope_id: int) -> bool:
        """Delete an envelope (soft delete - mark as inactive)."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("UPDATE envelopes SET is_active = 0 WHERE id = ?", (envelope_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            logger.info(f"Deleted (deactivated) envelope {envelope_id}")
        return success

    def permanent_delete_envelope(self, envelope_id: int) -> bool:
        """Permanently delete an envelope and all its transactions."""
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            # Delete all envelope transactions first (foreign key constraint)
            cursor.execute("DELETE FROM envelope_transactions WHERE envelope_id = ?", (envelope_id,))

            # Delete the envelope
            cursor.execute("DELETE FROM envelopes WHERE id = ?", (envelope_id,))
            success = cursor.rowcount > 0

            conn.commit()

            if success:
                logger.info(f"Permanently deleted envelope {envelope_id}")
            return success
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to permanently delete envelope {envelope_id}: {e}")
            return False
        finally:
            conn.close()

    def add_envelope_transaction(self, envelope_transaction_data: Dict[str, Any]) -> int:
        """Add money to an envelope (allocation)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Insert envelope transaction
        cursor.execute("""
            INSERT INTO envelope_transactions 
            (envelope_id, transaction_date, amount, account_id, description)
            VALUES (?, ?, ?, ?, ?)
        """, (
            envelope_transaction_data['envelope_id'],
            envelope_transaction_data['transaction_date'],
            envelope_transaction_data['amount'],
            envelope_transaction_data['account_id'],
            envelope_transaction_data.get('description', '')
        ))
        
        transaction_id = cursor.lastrowid
        
        # Update envelope current_amount
        cursor.execute("""
            UPDATE envelopes 
            SET current_amount = current_amount + ? 
            WHERE id = ?
        """, (envelope_transaction_data['amount'], envelope_transaction_data['envelope_id']))
        
        conn.commit()
        conn.close()
        logger.info(f"Added envelope transaction: {envelope_transaction_data['amount']} to envelope {envelope_transaction_data['envelope_id']}")
        return transaction_id

    def get_envelope_transactions(self, envelope_id: int) -> List[Dict[str, Any]]:
        """Get all transactions for an envelope."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT et.*, a.name as account_name
            FROM envelope_transactions et
            JOIN accounts a ON et.account_id = a.id
            WHERE et.envelope_id = ?
            ORDER BY et.transaction_date DESC
        """, (envelope_id,))
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_envelope_progress(self, envelope_id: int) -> Dict[str, Any]:
        """Calculate envelope progress."""
        envelope = self.get_envelope(envelope_id)
        if not envelope:
            return {}

        current = envelope['current_amount']
        target = envelope['target_amount']
        percentage = (current / target * 100) if target > 0 else 0
        remaining = target - current

        # Calculate days until deadline if set
        days_remaining = None
        months_remaining = None
        monthly_target = None

        if envelope['deadline']:
            deadline = datetime.fromisoformat(envelope['deadline']).date()
            today = datetime.now().date()
            days_remaining = (deadline - today).days

            # Calculate months remaining (more accurate for monthly planning)
            # Use relativedelta for accurate month calculation
            from dateutil.relativedelta import relativedelta

            # Calculate total months from today to deadline
            delta = relativedelta(deadline, today)
            months_remaining = delta.years * 12 + delta.months

            # If there are remaining days in the current month, count it as a partial month
            if delta.days > 0:
                months_remaining += 1

            # Calculate monthly target based on remaining amount (not total target)
            # This way it updates automatically as user adds money
            if months_remaining > 0 and remaining > 0:
                monthly_target = remaining / months_remaining
            elif remaining <= 0:
                # Goal already reached!
                monthly_target = 0
            else:
                # Deadline passed or no months remaining
                monthly_target = remaining  # Need to allocate everything now

        return {
            'envelope_id': envelope_id,
            'name': envelope['name'],
            'current_amount': current,
            'target_amount': target,
            'percentage': round(percentage, 1),
            'remaining_amount': remaining,
            'deadline': envelope['deadline'],
            'days_remaining': days_remaining,
            'months_remaining': months_remaining,
            'monthly_target': round(monthly_target, 2) if monthly_target is not None else None,
            'is_complete': current >= target,
            'color': envelope['color']
        }

    # ==================== RECURRING TRANSACTIONS ====================

    def get_recurring_templates(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all recurring transaction templates."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if include_inactive:
            query = """
                SELECT rt.*, a.name as account_name, tt.name as type_name, tt.category as category, ts.name as subtype_name
                FROM recurring_templates rt
                JOIN accounts a ON rt.account_id = a.id
                JOIN transaction_types tt ON rt.type_id = tt.id
                JOIN transaction_subtypes ts ON rt.subtype_id = ts.id
                ORDER BY rt.is_active DESC, rt.name
            """
        else:
            query = """
                SELECT rt.*, a.name as account_name, tt.name as type_name, tt.category as category, ts.name as subtype_name
                FROM recurring_templates rt
                JOIN accounts a ON rt.account_id = a.id
                JOIN transaction_types tt ON rt.type_id = tt.id
                JOIN transaction_subtypes ts ON rt.subtype_id = ts.id
                WHERE rt.is_active = 1
                ORDER BY rt.name
            """

        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def add_recurring_template(self, template_data: Dict[str, Any]) -> int:
        """Add a new recurring transaction template."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO recurring_templates 
            (name, account_id, amount, currency, description, destinataire, 
             type_id, subtype_id, tags, recurrence_pattern, recurrence_interval, 
             day_of_month, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            template_data['name'],
            template_data['account_id'],
            template_data['amount'],
            template_data['currency'],
            template_data.get('description', ''),
            template_data['destinataire'],
            template_data['type_id'],
            template_data['subtype_id'],
            template_data.get('tags', ''),
            template_data['recurrence_pattern'],
            template_data.get('recurrence_interval', 1),
            template_data.get('day_of_month'),
            template_data['start_date'],
            template_data.get('end_date'),
            template_data.get('is_active', 1)
        ))
        
        template_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added recurring template: {template_data['name']}")
        return template_id

    def update_recurring_template(self, template_id: int, updates: Dict[str, Any]) -> bool:
        """Update a recurring template."""
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [template_id]

        cursor.execute(f"UPDATE recurring_templates SET {set_clause} WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def delete_recurring_template(self, template_id: int) -> bool:
        """Delete a recurring template."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Delete the template from database
        cursor.execute("DELETE FROM recurring_templates WHERE id = ?", (template_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            logger.info(f"Deleted recurring template with ID {template_id}")

        return success

    def get_pending_transactions(self) -> List[Dict[str, Any]]:
        """Get all pending transactions awaiting confirmation."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT pt.*, rt.name as template_name, a.name as account_name,
                   tt.name as type_name, tt.category, ts.name as subtype_name
            FROM pending_transactions pt
            JOIN recurring_templates rt ON pt.recurring_template_id = rt.id
            JOIN accounts a ON pt.account_id = a.id
            JOIN transaction_types tt ON pt.type_id = tt.id
            JOIN transaction_subtypes ts ON pt.subtype_id = ts.id
            ORDER BY pt.transaction_date
        """)
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def calculate_future_recurring_transactions(self, year: int, month: int, currency: str = None) -> List[Dict[str, Any]]:
        """Calculate expected recurring transactions for a given month.

        Args:
            year: Target year
            month: Target month
            currency: Optional currency filter

        Returns:
            List of expected recurring transactions with amount, date, type info
        """
        from datetime import date, timedelta
        from calendar import monthrange

        # Get active recurring templates
        templates = self.get_recurring_templates(include_inactive=False)

        # Filter by currency if specified
        if currency:
            templates = [t for t in templates if t['currency'] == currency]

        # Calculate first and last day of target month
        first_day = date(year, month, 1)
        last_day = date(year, month, monthrange(year, month)[1])

        future_transactions = []

        for template in templates:
            start_date = date.fromisoformat(template['start_date'])
            end_date = date.fromisoformat(template['end_date']) if template['end_date'] else None

            # Skip if template hasn't started yet or has already ended
            if start_date > last_day or (end_date and end_date < first_day):
                continue

            pattern = template['recurrence_pattern']
            interval = template.get('recurrence_interval', 1)

            # Calculate occurrences based on pattern
            if pattern == 'monthly':
                # Monthly: occurs on specific day of month
                day = template.get('day_of_month', 1)
                if day > monthrange(year, month)[1]:
                    day = monthrange(year, month)[1]  # Handle months with fewer days

                transaction_date = date(year, month, day)

                # Check if this date is within the template's active period
                if transaction_date >= start_date and (not end_date or transaction_date <= end_date):
                    future_transactions.append({
                        'template_id': template['id'],
                        'template_name': template['name'],
                        'transaction_date': transaction_date.isoformat(),
                        'amount': template['amount'],
                        'currency': template['currency'],
                        'type_name': template['type_name'],
                        'category': template['category'],
                        'description': template['description'],
                        'destinataire': template['destinataire']
                    })

            elif pattern == 'weekly':
                # Weekly: calculate all occurrences in the month
                # Start from first day of month that matches the weekday
                current_date = start_date
                if current_date < first_day:
                    current_date = first_day

                while current_date <= last_day:
                    if current_date >= start_date and (not end_date or current_date <= end_date):
                        if (current_date - start_date).days % (7 * interval) == 0:
                            future_transactions.append({
                                'template_id': template['id'],
                                'template_name': template['name'],
                                'transaction_date': current_date.isoformat(),
                                'amount': template['amount'],
                                'currency': template['currency'],
                                'type_name': template['type_name'],
                                'category': template['category'],
                                'description': template['description'],
                                'destinataire': template['destinataire']
                            })
                    current_date += timedelta(days=1)

            elif pattern == 'daily':
                # Daily: count all days in month
                current_date = max(start_date, first_day)
                end = min(end_date, last_day) if end_date else last_day

                while current_date <= end:
                    if (current_date - start_date).days % interval == 0:
                        future_transactions.append({
                            'template_id': template['id'],
                            'template_name': template['name'],
                            'transaction_date': current_date.isoformat(),
                            'amount': template['amount'],
                            'currency': template['currency'],
                            'type_name': template['type_name'],
                            'category': template['category'],
                            'description': template['description'],
                            'destinataire': template['destinataire']
                        })
                    current_date += timedelta(days=1)

            elif pattern == 'yearly':
                # Yearly: check if the month matches
                if start_date.month == month:
                    transaction_date = date(year, month, start_date.day)
                    if transaction_date >= start_date and (not end_date or transaction_date <= end_date):
                        future_transactions.append({
                            'template_id': template['id'],
                            'template_name': template['name'],
                            'transaction_date': transaction_date.isoformat(),
                            'amount': template['amount'],
                            'currency': template['currency'],
                            'type_name': template['type_name'],
                            'category': template['category'],
                            'description': template['description'],
                            'destinataire': template['destinataire']
                        })

        return sorted(future_transactions, key=lambda x: x['transaction_date'])

    def add_pending_transaction(self, pending_data: Dict[str, Any]) -> int:
        """Create a pending transaction from template."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO pending_transactions 
            (recurring_template_id, transaction_date, amount, currency, description, 
             destinataire, account_id, type_id, subtype_id, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pending_data['recurring_template_id'],
            pending_data['transaction_date'],
            pending_data['amount'],
            pending_data['currency'],
            pending_data.get('description', ''),
            pending_data['destinataire'],
            pending_data['account_id'],
            pending_data['type_id'],
            pending_data['subtype_id'],
            pending_data.get('tags', '')
        ))
        
        pending_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Created pending transaction {pending_id}")
        return pending_id

    def confirm_pending_transaction(self, pending_id: int) -> int:
        """Confirm a pending transaction and create actual transaction."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Get pending transaction
        cursor.execute("SELECT * FROM pending_transactions WHERE id = ?", (pending_id,))
        pending = cursor.fetchone()
        
        if not pending:
            conn.close()
            return None
        
        # Create actual transaction
        cursor.execute("""
            INSERT INTO transactions 
            (account_id, transaction_date, amount, currency, description, 
             destinataire, type_id, subtype_id, tags, recurring_template_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pending['account_id'],
            pending['transaction_date'],
            pending['amount'],
            pending['currency'],
            pending['description'],
            pending['destinataire'],
            pending['type_id'],
            pending['subtype_id'],
            pending['tags'],
            pending['recurring_template_id']
        ))
        
        transaction_id = cursor.lastrowid
        
        # Delete pending transaction
        cursor.execute("DELETE FROM pending_transactions WHERE id = ?", (pending_id,))
        
        # Update last_generated date in template
        cursor.execute("""
            UPDATE recurring_templates 
            SET last_generated = ? 
            WHERE id = ?
        """, (pending['transaction_date'], pending['recurring_template_id']))
        
        conn.commit()
        conn.close()
        logger.info(f"Confirmed pending transaction {pending_id} → transaction {transaction_id}")
        return transaction_id

    def reject_pending_transaction(self, pending_id: int) -> bool:
        """Reject and delete a pending transaction."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM pending_transactions WHERE id = ?", (pending_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        logger.info(f"Rejected pending transaction {pending_id}")
        return success

    def generate_pending_from_templates(self, check_date: str = None) -> int:
        """
        Generate ALL pending transactions from active templates up to the given date.
        Creates ONE transaction per missed occurrence/period.
        """
        from datetime import datetime, timedelta
        from dateutil.relativedelta import relativedelta

        if check_date is None:
            check_date = datetime.now().date().isoformat()

        conn = self._get_connection()
        cursor = conn.cursor()

        # Get active templates
        cursor.execute("SELECT * FROM recurring_templates WHERE is_active = 1")
        templates = cursor.fetchall()

        count = 0
        check_date_obj = datetime.fromisoformat(check_date).date()

        for template in templates:
            template_dict = dict(template)

            start_date = datetime.fromisoformat(template_dict['start_date']).date()
            end_date = datetime.fromisoformat(template_dict['end_date']).date() if template_dict['end_date'] else None
            last_generated = datetime.fromisoformat(template_dict['last_generated']).date() if template_dict['last_generated'] else None

            pattern = template_dict['recurrence_pattern']
            interval = template_dict['recurrence_interval']

            # Determine the starting point for generating transactions
            if last_generated:
                next_date = last_generated
            else:
                next_date = start_date

            # Generate all occurrences from next_date to check_date_obj
            # Use a list to collect all dates that need transactions
            dates_to_generate = []

            if pattern == 'daily':
                # Generate every interval days
                current = next_date if not last_generated else next_date + timedelta(days=interval)
                while current <= check_date_obj:
                    if end_date and current > end_date:
                        break
                    dates_to_generate.append(current)
                    current += timedelta(days=interval)

            elif pattern == 'weekly':
                # Generate every interval weeks
                current = next_date if not last_generated else next_date + timedelta(weeks=interval)
                while current <= check_date_obj:
                    if end_date and current > end_date:
                        break
                    dates_to_generate.append(current)
                    current += timedelta(weeks=interval)

            elif pattern == 'monthly':
                # Generate on the specified day of each month
                day_of_month = template_dict['day_of_month']

                if day_of_month:
                    # Start from the next month after last_generated (or start month if never generated)
                    if last_generated:
                        current = last_generated + relativedelta(months=interval)
                    else:
                        current = start_date

                    # Ensure we're on the correct day of month
                    # Handle edge case where day doesn't exist (e.g., Feb 31 -> Feb 28/29)
                    try:
                        current = current.replace(day=day_of_month)
                    except ValueError:
                        # Day doesn't exist in this month, use last day of month
                        import calendar
                        last_day = calendar.monthrange(current.year, current.month)[1]
                        current = current.replace(day=min(day_of_month, last_day))

                    # Generate for all months until check_date
                    while current <= check_date_obj:
                        if end_date and current > end_date:
                            break
                        # Only add if this month hasn't been generated yet
                        if not last_generated or (current.year, current.month) != (last_generated.year, last_generated.month):
                            dates_to_generate.append(current)
                        current = current + relativedelta(months=interval)
                        # Adjust day again for next month
                        try:
                            current = current.replace(day=day_of_month)
                        except ValueError:
                            import calendar
                            last_day = calendar.monthrange(current.year, current.month)[1]
                            current = current.replace(day=min(day_of_month, last_day))

            elif pattern == 'yearly':
                # Generate on the anniversary of start_date every interval years
                current = next_date if not last_generated else next_date.replace(year=next_date.year + interval)

                while current <= check_date_obj:
                    if end_date and current > end_date:
                        break
                    dates_to_generate.append(current)
                    current = current.replace(year=current.year + interval)

            elif pattern == 'custom':
                # Generate every interval days (same as daily)
                current = next_date if not last_generated else next_date + timedelta(days=interval)
                while current <= check_date_obj:
                    if end_date and current > end_date:
                        break
                    dates_to_generate.append(current)
                    current += timedelta(days=interval)

            # Create pending transactions for all collected dates
            for transaction_date in dates_to_generate:
                # Check if pending already exists
                cursor.execute("""
                    SELECT id FROM pending_transactions
                    WHERE recurring_template_id = ? AND transaction_date = ?
                """, (template_dict['id'], transaction_date.isoformat()))

                if not cursor.fetchone():
                    # Create pending transaction
                    cursor.execute("""
                        INSERT INTO pending_transactions
                        (recurring_template_id, transaction_date, amount, currency, description,
                         destinataire, account_id, type_id, subtype_id, tags)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        template_dict['id'],
                        transaction_date.isoformat(),
                        template_dict['amount'],
                        template_dict['currency'],
                        template_dict['description'],
                        template_dict['destinataire'],
                        template_dict['account_id'],
                        template_dict['type_id'],
                        template_dict['subtype_id'],
                        template_dict['tags']
                    ))
                    count += 1
                    logger.info(f"Generated pending transaction for template '{template_dict['name']}' on {transaction_date} (pattern: {pattern})")

        conn.commit()
        conn.close()
        logger.info(f"Generated {count} total pending transactions across all overdue periods")
        return count

 # ==================== DEBTS ====================

    def get_debts(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all debts."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if include_inactive:
            query = """
                SELECT d.*, a.name as account_name
                FROM debts d
                LEFT JOIN accounts a ON d.linked_account_id = a.id
                ORDER BY d.is_active DESC, d.name
            """
        else:
            query = """
                SELECT d.*, a.name as account_name
                FROM debts d
                LEFT JOIN accounts a ON d.linked_account_id = a.id
                WHERE d.is_active = 1
                ORDER BY d.name
            """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_debt(self, debt_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific debt by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT d.*, a.name as account_name
            FROM debts d
            LEFT JOIN accounts a ON d.linked_account_id = a.id
            WHERE d.id = ?
        """, (debt_id,))

        row = cursor.fetchone()
        conn.close()

        return dict(row) if row else None

    def add_debt(self, debt_data: Dict[str, Any]) -> int:
        """Add a new debt and create associated recurring transaction template.

        Note: linked_account_id is required for creating recurring payment template.
        """
        # Validate required account link
        if not debt_data.get('linked_account_id'):
            raise ValueError("linked_account_id is required to create a debt with automatic recurring payments")

        # Get or create Debt type and subtype BEFORE opening connection
        debt_type_id, debt_subtype_id = self.get_or_create_debt_subtype(debt_data['name'])

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO debts
            (name, principal_amount, current_balance, interest_rate, interest_type,
             monthly_payment, payment_day, start_date, linked_account_id, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            debt_data['name'],
            debt_data['principal_amount'],
            debt_data.get('current_balance', debt_data['principal_amount']),
            debt_data['interest_rate'],
            debt_data['interest_type'],
            debt_data['monthly_payment'],
            debt_data['payment_day'],
            debt_data['start_date'],
            debt_data['linked_account_id'],
            debt_data.get('is_active', 1)
        ))

        debt_id = cursor.lastrowid

        # Create recurring transaction template for this debt
        account_id = debt_data['linked_account_id']

        if account_id:
            cursor.execute("""
                INSERT INTO recurring_templates
                (name, account_id, amount, currency, description, destinataire,
                 type_id, subtype_id, tags, recurrence_pattern, recurrence_interval,
                 day_of_month, start_date, is_active, linked_debt_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"Debt Payment: {debt_data['name']}",
                account_id,
                debt_data['monthly_payment'],
                'EUR',  # Default currency for debts
                f"Monthly payment for {debt_data['name']}",
                debt_data['name'],
                debt_type_id,
                debt_subtype_id,
                'Debt Payment, Auto-generated',
                'monthly',
                1,  # recurrence_interval
                debt_data['payment_day'],
                debt_data['start_date'],
                1,  # is_active
                debt_id
            ))
            logger.info(f"Created recurring template for debt: {debt_data['name']}")

        conn.commit()
        conn.close()
        logger.info(f"Added debt: {debt_data['name']}")
        return debt_id

    def update_debt(self, debt_id: int, updates: Dict[str, Any]) -> bool:
        """Update an existing debt and its associated recurring template.

        If the debt is fully paid (current_balance <= 0), the recurring template is deleted.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [debt_id]

        cursor.execute(f"UPDATE debts SET {set_clause} WHERE id = ?", values)

        success = cursor.rowcount > 0

        # Check if debt is fully paid off
        if success and 'current_balance' in updates:
            new_balance = updates['current_balance']
            if new_balance <= 0:
                # Debt is fully paid - DELETE the recurring template
                cursor.execute("DELETE FROM recurring_templates WHERE linked_debt_id = ?", (debt_id,))
                deleted_count = cursor.rowcount
                if deleted_count > 0:
                    logger.info(f"Debt {debt_id} fully paid! Deleted recurring template.")

                # Also deactivate the debt
                cursor.execute("UPDATE debts SET is_active = 0 WHERE id = ?", (debt_id,))
                logger.info(f"Debt {debt_id} marked as inactive (fully paid)")

                conn.commit()
                conn.close()
                return success

        # Update the recurring template if relevant fields changed (and debt not paid off)
        if success and any(key in updates for key in ['monthly_payment', 'payment_day', 'linked_account_id', 'name']):
            # Build update for recurring template
            template_updates = {}
            if 'monthly_payment' in updates:
                template_updates['amount'] = updates['monthly_payment']
            if 'payment_day' in updates:
                template_updates['day_of_month'] = updates['payment_day']
            if 'linked_account_id' in updates:
                template_updates['account_id'] = updates['linked_account_id']
            if 'name' in updates:
                template_updates['name'] = f"Debt Payment: {updates['name']}"
                template_updates['destinataire'] = updates['name']
                template_updates['description'] = f"Monthly payment for {updates['name']}"

            if template_updates:
                set_template_clause = ", ".join([f"{key} = ?" for key in template_updates.keys()])
                template_values = list(template_updates.values()) + [debt_id]
                cursor.execute(
                    f"UPDATE recurring_templates SET {set_template_clause} WHERE linked_debt_id = ?",
                    template_values
                )
                logger.info(f"Updated recurring template for debt {debt_id}")

        conn.commit()
        conn.close()
        return success

    def delete_debt(self, debt_id: int) -> bool:
        """Deactivate a debt and DELETE its associated recurring template."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("UPDATE debts SET is_active = 0 WHERE id = ?", (debt_id,))
        success = cursor.rowcount > 0

        # DELETE the recurring template (not just deactivate)
        if success:
            cursor.execute("DELETE FROM recurring_templates WHERE linked_debt_id = ?", (debt_id,))
            deleted_count = cursor.rowcount
            if deleted_count > 0:
                logger.info(f"Deleted recurring template for debt {debt_id}")

        conn.commit()
        conn.close()
        return success

    def get_or_create_debt_subtype(self, debt_name: str) -> tuple[int, int]:
        """
        Get or create a subtype for a specific debt under the 'Debt' transaction type.

        Returns:
            tuple: (type_id, subtype_id) for the Debt type and specific debt subtype
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get or create the 'Debt' transaction type
        cursor.execute("SELECT id FROM transaction_types WHERE name = 'Debt'")
        result = cursor.fetchone()

        if not result:
            # Create the Debt transaction type if it doesn't exist
            cursor.execute(
                "INSERT INTO transaction_types (name, category, icon, color) VALUES (?, ?, ?, ?)",
                ('Debt', 'expense', '💳', '#E17055')
            )
            debt_type_id = cursor.lastrowid
            conn.commit()
            logger.info("Created 'Debt' transaction type")
        else:
            debt_type_id = result['id']

        # Check if subtype for this debt already exists
        cursor.execute("""
            SELECT id FROM transaction_subtypes
            WHERE type_id = ? AND name = ?
        """, (debt_type_id, debt_name))

        subtype_result = cursor.fetchone()

        if subtype_result:
            subtype_id = subtype_result['id']
            logger.info(f"Using existing debt subtype: {debt_name}")
        else:
            # Create new subtype for this debt
            cursor.execute("""
                INSERT INTO transaction_subtypes (type_id, name)
                VALUES (?, ?)
            """, (debt_type_id, debt_name))
            subtype_id = cursor.lastrowid
            conn.commit()
            logger.info(f"Created new debt subtype: {debt_name}")

        conn.close()
        return (debt_type_id, subtype_id)

    def ensure_investment_types_exist(self):
        """
        Ensure that all required investment transaction types and subtypes exist.
        Creates them if they don't exist.

        Required types:
        - Investments (expense) -> Securities Purchase
        - Investment Income (income) -> Dividends, Sale Proceeds
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        # 1. Ensure 'Investments' type exists (for buying securities - expense)
        cursor.execute("SELECT id FROM transaction_types WHERE name = 'Investments'")
        result = cursor.fetchone()

        if not result:
            cursor.execute(
                "INSERT INTO transaction_types (name, category, icon, color) VALUES (?, ?, ?, ?)",
                ('Investments', 'expense', '📈', '#6C5CE7')
            )
            investments_type_id = cursor.lastrowid
            conn.commit()
            logger.info("Created 'Investments' transaction type")
        else:
            investments_type_id = result['id']

        # Add 'Securities Purchase' subtype
        cursor.execute("""
            SELECT id FROM transaction_subtypes
            WHERE type_id = ? AND name = 'Securities Purchase'
        """, (investments_type_id,))

        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO transaction_subtypes (type_id, name)
                VALUES (?, 'Securities Purchase')
            """, (investments_type_id,))
            conn.commit()
            logger.info("Created 'Securities Purchase' subtype")

        # 2. Ensure 'Investment Income' type exists
        cursor.execute("SELECT id FROM transaction_types WHERE name = 'Investment Income'")
        result = cursor.fetchone()

        if not result:
            cursor.execute(
                "INSERT INTO transaction_types (name, category, icon, color) VALUES (?, ?, ?, ?)",
                ('Investment Income', 'income', '💰', '#00B894')
            )
            inv_income_type_id = cursor.lastrowid
            conn.commit()
            logger.info("Created 'Investment Income' transaction type")
        else:
            inv_income_type_id = result['id']

        # Add 'Sale Proceeds' subtype if missing
        cursor.execute("""
            SELECT id FROM transaction_subtypes
            WHERE type_id = ? AND name = 'Sale Proceeds'
        """, (inv_income_type_id,))

        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO transaction_subtypes (type_id, name)
                VALUES (?, 'Sale Proceeds')
            """, (inv_income_type_id,))
            conn.commit()
            logger.info("Created 'Sale Proceeds' subtype")

        # Ensure 'Dividends' subtype exists
        cursor.execute("""
            SELECT id FROM transaction_subtypes
            WHERE type_id = ? AND name = 'Dividends'
        """, (inv_income_type_id,))

        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO transaction_subtypes (type_id, name)
                VALUES (?, 'Dividends')
            """, (inv_income_type_id,))
            conn.commit()
            logger.info("Created 'Dividends' subtype")

        conn.close()
        logger.info("All investment transaction types verified/created")

    def add_debt_payment(self, payment_data: Dict[str, Any]) -> int:
        """Record a debt payment linked to a transaction."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get debt info to calculate interest
        cursor.execute("SELECT * FROM debts WHERE id = ?", (payment_data['debt_id'],))
        debt = dict(cursor.fetchone())
        
        # Calculate interest for this payment
        annual_rate = debt['interest_rate'] / 100
        monthly_rate = annual_rate / 12
        current_balance = debt['current_balance']
        
        # Calculate interest portion
        if debt['interest_type'] == 'simple':
            # Simple interest: (Balance × Annual Rate) / 12
            interest_paid = (current_balance * annual_rate) / 12
        else:
            # Compound interest: Balance × Monthly Rate
            interest_paid = current_balance * monthly_rate
        
        # Calculate principal portion
        total_payment = payment_data['amount']
        extra_payment = payment_data.get('extra_payment', 0)
        
        # Principal = Total Payment - Interest - Extra
        # But if total < interest (shouldn't happen), just record as is
        principal_paid = max(0, total_payment - interest_paid - extra_payment)
        
        # If extra payment specified, it all goes to principal
        total_principal = principal_paid + extra_payment
        
        cursor.execute("""
            INSERT INTO debt_payments 
            (debt_id, transaction_id, payment_date, amount, principal_paid, interest_paid, extra_payment)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payment_data['debt_id'],
            payment_data['transaction_id'],
            payment_data['payment_date'],
            total_payment,
            principal_paid,
            round(interest_paid, 2),
            extra_payment
        ))
        
        payment_id = cursor.lastrowid
        
        # Update debt balance (subtract principal + extra)
        cursor.execute("""
            UPDATE debts
            SET current_balance = current_balance - ?
            WHERE id = ?
        """, (total_principal, payment_data['debt_id']))

        # Check if debt is now fully paid
        cursor.execute("SELECT current_balance FROM debts WHERE id = ?", (payment_data['debt_id'],))
        result = cursor.fetchone()
        if result:
            new_balance = result[0]
            if new_balance <= 0:
                # Debt is fully paid - DELETE the recurring template
                cursor.execute("DELETE FROM recurring_templates WHERE linked_debt_id = ?", (payment_data['debt_id'],))
                deleted_count = cursor.rowcount
                if deleted_count > 0:
                    logger.info(f"Debt {payment_data['debt_id']} fully paid! Deleted recurring template.")

                # Mark debt as inactive (paid off)
                cursor.execute("UPDATE debts SET is_active = 0 WHERE id = ?", (payment_data['debt_id'],))
                logger.info(f"Debt {payment_data['debt_id']} marked as inactive (fully paid)")

        conn.commit()
        conn.close()
        logger.info(f"Added debt payment for debt {payment_data['debt_id']}: Interest={interest_paid:.2f}, Principal={principal_paid:.2f}, Extra={extra_payment}")
        return payment_id

    def get_debt_payments(self, debt_id: int) -> List[Dict[str, Any]]:
        """Get all payments for a specific debt."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT dp.*, t.destinataire, t.description
            FROM debt_payments dp
            JOIN transactions t ON dp.transaction_id = t.id
            WHERE dp.debt_id = ?
            ORDER BY dp.payment_date DESC
        """, (debt_id,))
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def calculate_debt_payoff(self, debt_id: int) -> Dict[str, Any]:
        """Calculate payoff information for a debt."""
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        import math
        
        debt = next((d for d in self.get_debts() if d['id'] == debt_id), None)
        if not debt:
            return {}
        
        balance = debt['current_balance']
        monthly_payment = debt['monthly_payment']
        annual_rate = debt['interest_rate'] / 100
        monthly_rate = annual_rate / 12
        
        if balance <= 0:
            return {
                'debt_id': debt_id,
                'is_paid_off': True,
                'months_remaining': 0,
                'payoff_date': None,
                'total_interest_remaining': 0,
                'total_amount_remaining': 0
            }
        
        # Calculate months to payoff
        if debt['interest_type'] == 'simple':
            # Simple interest: Total Interest = Principal × Rate × Time
            # Approximate time to pay off
            months = balance / monthly_payment
            total_interest = balance * annual_rate * (months / 12)
        else:
            # Compound interest calculation
            # Formula: n = log(P / (P - B*r)) / log(1 + r)
            # Where: P = monthly payment, B = balance, r = monthly rate, n = months
            
            if monthly_rate == 0:
                # No interest
                months = balance / monthly_payment
                total_interest = 0
            elif monthly_payment <= balance * monthly_rate:
                # Payment too small to cover interest - loan won't be paid off
                months = 999
                total_interest = balance
            else:
                # Standard amortization formula
                try:
                    months = math.log(monthly_payment / (monthly_payment - balance * monthly_rate)) / math.log(1 + monthly_rate)
                    total_paid = monthly_payment * months
                    total_interest = total_paid - balance
                except (ValueError, ZeroDivisionError):
                    months = 999
                    total_interest = balance
        
        # Calculate payoff date
        start_date = datetime.now().date()
        payoff_date = start_date + relativedelta(months=int(months))
        
        return {
            'debt_id': debt_id,
            'is_paid_off': False,
            'months_remaining': int(months),
            'payoff_date': payoff_date.isoformat(),
            'total_interest_remaining': round(total_interest, 2),
            'total_amount_remaining': round(balance + total_interest, 2),
            'current_balance': balance,
            'monthly_payment': monthly_payment
        }
# ==================== BUDGETS ====================

    def get_budgets(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all budgets."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if include_inactive:
            query = """
                SELECT b.*, tt.name as type_name, tt.icon, tt.color
                FROM budgets b
                JOIN transaction_types tt ON b.type_id = tt.id
                ORDER BY b.is_active DESC, tt.name
            """
        else:
            query = """
                SELECT b.*, tt.name as type_name, tt.icon, tt.color
                FROM budgets b
                JOIN transaction_types tt ON b.type_id = tt.id
                WHERE b.is_active = 1
                ORDER BY tt.name
            """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def add_budget(self, budget_data: Dict[str, Any]) -> int:
        """Add a new budget."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO budgets (type_id, amount, period, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            budget_data['type_id'],
            budget_data['amount'],
            budget_data.get('period', 'monthly'),
            budget_data['start_date'],
            budget_data.get('end_date'),
            budget_data.get('is_active', 1)
        ))
        
        budget_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"Added budget for type {budget_data['type_id']}")
        return budget_id

    def update_budget(self, budget_id: int, updates: Dict[str, Any]) -> bool:
        """Update a budget."""
        conn = self._get_connection()
        cursor = conn.cursor()

        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        values = list(updates.values()) + [budget_id]

        cursor.execute(f"UPDATE budgets SET {set_clause} WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def delete_budget(self, budget_id: int) -> bool:
        """Deactivate a budget."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("UPDATE budgets SET is_active = 0 WHERE id = ?", (budget_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    # ==================== REPORTING ====================

    def get_monthly_summary(self, year: int, month: int) -> Dict[str, Any]:
        """Get monthly summary report."""
        from datetime import date
        
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        transactions = self.get_transactions({
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        })
        
        income = sum(t['amount'] for t in transactions if t['category'] == 'income')
        expenses = sum(t['amount'] for t in transactions if t['category'] == 'expense')

        # By category
        income_by_cat = {}
        expense_by_cat = {}

        # By category with subcategory breakdown
        expense_by_cat_detailed = {}

        for t in transactions:
            if t['category'] == 'income':
                income_by_cat[t['type_name']] = income_by_cat.get(t['type_name'], 0) + t['amount']
            elif t['category'] == 'expense':
                expense_by_cat[t['type_name']] = expense_by_cat.get(t['type_name'], 0) + t['amount']

                # Build detailed subcategory structure
                type_name = t['type_name']
                subtype_name = t.get('subtype_name', 'Other')

                if type_name not in expense_by_cat_detailed:
                    expense_by_cat_detailed[type_name] = {
                        'total': 0,
                        'subcategories': {}
                    }

                expense_by_cat_detailed[type_name]['total'] += t['amount']
                expense_by_cat_detailed[type_name]['subcategories'][subtype_name] = \
                    expense_by_cat_detailed[type_name]['subcategories'].get(subtype_name, 0) + t['amount']

        return {
            'year': year,
            'month': month,
            'total_income': income,
            'total_expenses': expenses,
            'net': income - expenses,
            'income_by_category': income_by_cat,
            'expense_by_category': expense_by_cat,
            'expense_by_category_detailed': expense_by_cat_detailed,
            'transaction_count': len(transactions)
        }

    def get_spending_trends(self, start_date: str, end_date: str, group_by: str = 'month') -> Dict[str, Any]:
        """Get spending trends over time."""
        from datetime import datetime
        import calendar
        
        transactions = self.get_transactions({
            'start_date': start_date,
            'end_date': end_date
        })
        
        # Group by period
        trends = {}
        
        for t in transactions:
            if t['category'] != 'expense':
                continue
            
            trans_date = datetime.fromisoformat(t['transaction_date'])
            
            if group_by == 'month':
                period_key = f"{trans_date.year}-{trans_date.month:02d}"
            elif group_by == 'quarter':
                quarter = (trans_date.month - 1) // 3 + 1
                period_key = f"{trans_date.year}-Q{quarter}"
            else:  # year
                period_key = str(trans_date.year)
            
            if period_key not in trends:
                trends[period_key] = {'total': 0, 'by_category': {}}
            
            trends[period_key]['total'] += t['amount']
            cat = t['type_name']
            trends[period_key]['by_category'][cat] = trends[period_key]['by_category'].get(cat, 0) + t['amount']
        
        return {
            'start_date': start_date,
            'end_date': end_date,
            'group_by': group_by,
            'trends': trends
        }

    def get_budget_vs_actual(self, year: int, month: int) -> List[Dict[str, Any]]:
        """Compare budgets vs actual spending for a month."""
        from datetime import date
        
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        # Get active budgets
        budgets = self.get_budgets()
        
        # Get actual spending
        transactions = self.get_transactions({
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        })
        
        # Calculate actual by type
        actual_by_type = {}
        for t in transactions:
            if t['category'] == 'expense':
                actual_by_type[t['type_id']] = actual_by_type.get(t['type_id'], 0) + t['amount']
        
        # Compare
        results = []
        for budget in budgets:
            if budget['period'] == 'monthly':
                budget_amount = budget['amount']
            else:  # yearly
                budget_amount = budget['amount'] / 12
            
            actual = actual_by_type.get(budget['type_id'], 0)
            difference = budget_amount - actual
            percentage = (actual / budget_amount * 100) if budget_amount > 0 else 0
            
            results.append({
                'type_id': budget['type_id'],
                'type_name': budget['type_name'],
                'icon': budget['icon'],
                'color': budget['color'],
                'budget': budget_amount,
                'actual': actual,
                'difference': difference,
                'percentage': percentage,
                'status': 'over' if difference < 0 else 'under' if difference > 0 else 'exact'
            })
        
        return results

    def get_income_vs_expenses_trend(self, start_date: str, end_date: str, group_by: str = 'month') -> Dict[str, Any]:
        """Get income vs expenses trend over time."""
        from datetime import datetime
        
        transactions = self.get_transactions({
            'start_date': start_date,
            'end_date': end_date
        })
        
        trends = {}
        
        for t in transactions:
            trans_date = datetime.fromisoformat(t['transaction_date'])
            
            if group_by == 'month':
                period_key = f"{trans_date.year}-{trans_date.month:02d}"
            elif group_by == 'quarter':
                quarter = (trans_date.month - 1) // 3 + 1
                period_key = f"{trans_date.year}-Q{quarter}"
            else:  # year
                period_key = str(trans_date.year)
            
            if period_key not in trends:
                trends[period_key] = {'income': 0, 'expenses': 0, 'net': 0}
            
            if t['category'] == 'income':
                trends[period_key]['income'] += t['amount']
            elif t['category'] == 'expense':
                trends[period_key]['expenses'] += t['amount']
            
            trends[period_key]['net'] = trends[period_key]['income'] - trends[period_key]['expenses']
        
        return {
            'start_date': start_date,
            'end_date': end_date,
            'group_by': group_by,
            'trends': trends
        }

    def get_net_worth(self, as_of_date: str = None) -> Dict[str, Any]:
        """Calculate net worth as of a specific date, converted to dashboard currency."""
        from datetime import datetime

        if as_of_date is None:
            as_of_date = datetime.now().date().isoformat()

        # Get dashboard currency preference
        dashboard_currency = self.get_preference('dashboard_currency', 'DKK')

        # Get all accounts
        accounts = self.get_accounts()

        # Convert each account balance to dashboard currency
        accounts_converted = []
        total_assets = 0
        for a in accounts:
            original_balance = a['balance']
            converted_balance = self.convert_currency(original_balance, a['currency'], dashboard_currency)
            total_assets += converted_balance
            accounts_converted.append({
                'name': a['name'],
                'balance': converted_balance,
                'original_balance': original_balance,
                'currency': dashboard_currency,
                'original_currency': a['currency']
            })

        # Get all active debts (assuming they're in EUR, convert to dashboard currency)
        debts = self.get_debts()
        debts_converted = []
        total_debts = 0
        for d in debts:
            original_balance = d['current_balance']
            # Debts are stored in EUR by default
            converted_balance = self.convert_currency(original_balance, 'EUR', dashboard_currency)
            total_debts += converted_balance
            debts_converted.append({
                'name': d['name'],
                'balance': converted_balance,
                'original_balance': original_balance,
                'currency': dashboard_currency,
                'original_currency': 'EUR'
            })

        # Net worth
        net_worth = total_assets - total_debts

        return {
            'as_of_date': as_of_date,
            'total_assets': total_assets,
            'total_debts': total_debts,
            'net_worth': net_worth,
            'currency': dashboard_currency,
            'accounts': accounts_converted,
            'debts': debts_converted
        }

    def get_net_worth_trend(self, start_date: str = None, end_date: str = None, frequency: str = 'monthly') -> Dict[str, Any]:
        """Calculate net worth trend over time.

        Args:
            start_date: Start date (ISO format). If None, uses earliest transaction date
            end_date: End date (ISO format). If None, uses today
            frequency: 'monthly' or 'yearly'

        Returns:
            Dictionary with dates and net worth values
        """
        from datetime import datetime, date, timedelta
        from dateutil.relativedelta import relativedelta

        dashboard_currency = self.get_preference('dashboard_currency', 'DKK')

        # Determine date range
        if end_date is None:
            end_date = date.today().isoformat()

        if start_date is None:
            # Find earliest transaction or account opening date
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT MIN(transaction_date) FROM transactions")
            earliest_txn = cursor.fetchone()[0]
            cursor.execute("SELECT MIN(opening_date) FROM accounts")
            earliest_acc = cursor.fetchone()[0]
            conn.close()

            if earliest_txn and earliest_acc:
                start_date = min(earliest_txn, earliest_acc)
            elif earliest_txn:
                start_date = earliest_txn
            elif earliest_acc:
                start_date = earliest_acc
            else:
                # No data, use one year ago
                start_date = (date.today() - relativedelta(years=1)).isoformat()

        # Build list of dates to calculate net worth for
        calculation_dates = []
        current = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()

        if frequency == 'monthly':
            # First day of each month
            while current <= end:
                calculation_dates.append(current.replace(day=1).isoformat())
                current = current + relativedelta(months=1)
        else:  # yearly
            # First day of each year
            while current <= end:
                calculation_dates.append(current.replace(month=1, day=1).isoformat())
                current = current + relativedelta(years=1)

        # Add end date if not already included
        if end.isoformat() not in calculation_dates:
            calculation_dates.append(end.isoformat())

        # Calculate net worth at each date
        trend_data = []
        accounts = self.get_accounts()
        conn = self._get_connection()
        cursor = conn.cursor()

        for calc_date in calculation_dates:
            total_assets = 0

            # Calculate balance for each account at this date
            for account in accounts:
                opening_date = account.get('opening_date')
                opening_balance = account.get('opening_balance', 0) or 0

                # If account was opened after calc_date, skip it
                if opening_date and opening_date > calc_date:
                    continue

                # Start with opening balance
                balance = opening_balance

                # Add all confirmed transactions up to this date
                if opening_date:
                    # If we have an opening date, only count transactions after it
                    cursor.execute("""
                        SELECT amount
                        FROM transactions
                        WHERE account_id = ?
                          AND transaction_date <= ?
                          AND transaction_date >= ?
                          AND confirmed = 1
                        ORDER BY transaction_date
                    """, (account['id'], calc_date, opening_date))
                else:
                    # No opening date: count all transactions up to calc_date
                    cursor.execute("""
                        SELECT amount
                        FROM transactions
                        WHERE account_id = ?
                          AND transaction_date <= ?
                          AND confirmed = 1
                        ORDER BY transaction_date
                    """, (account['id'], calc_date))

                transactions = cursor.fetchall()
                for txn in transactions:
                    balance += txn[0]

                # Convert to dashboard currency
                converted_balance = self.convert_currency(balance, account['currency'], dashboard_currency)
                total_assets += converted_balance

            # Get debt balances at this date (simplified - using current balance)
            # Note: For full historical accuracy, we'd need to track debt payment history
            total_debts = 0
            debts = self.get_debts()
            for debt in debts:
                if debt.get('is_active', True):
                    # Convert debt to dashboard currency
                    debt_balance = debt.get('current_balance', 0)
                    converted_debt = self.convert_currency(debt_balance, 'EUR', dashboard_currency)
                    total_debts += converted_debt

            net_worth = total_assets - total_debts

            trend_data.append({
                'date': calc_date,
                'assets': total_assets,
                'debts': total_debts,
                'net_worth': net_worth
            })

        conn.close()

        return {
            'start_date': start_date,
            'end_date': end_date,
            'frequency': frequency,
            'currency': dashboard_currency,
            'data': trend_data
        }


        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM securities"
        params = []
        
        if search:
            query += " WHERE symbol LIKE ? OR name LIKE ? OR isin LIKE ?"
            params = [f"%{search}%", f"%{search}%", f"%{search}%"]
        
        query += " ORDER BY symbol"
        
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        securities = cursor.fetchall()
        conn.close()
        
        return securities

    def get_security(self, security_id: int) -> Dict[str, Any]:
        """Get a single security by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM securities WHERE id = ?", (security_id,))
        security = cursor.fetchone()
        conn.close()
        
        return security

    def add_security(self, security_data: Dict[str, Any]) -> int:
        """Add a new security to the master list."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        required_fields = ['symbol', 'name', 'investment_type', 'currency']
        for field in required_fields:
            if field not in security_data:
                raise ValueError(f"Missing required field: {field}")
        
        cursor.execute("""
            INSERT INTO securities 
            (symbol, name, investment_type, isin, exchange, currency, sector, country, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            security_data['symbol'].upper(),
            security_data['name'],
            security_data['investment_type'],
            security_data.get('isin'),
            security_data.get('exchange'),
            security_data['currency'],
            security_data.get('sector'),
            security_data.get('country'),
            security_data.get('notes', '')
        ))
        
        security_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"Added security: {security_data['symbol']} - {security_data['name']}")
        return security_id

    def update_security(self, security_id: int, update_data: Dict[str, Any]) -> bool:
        """Update security information."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if not update_data:
            return False
        
        set_clause = ", ".join([f"{key} = ?" for key in update_data.keys()])
        values = list(update_data.values()) + [security_id]
        
        cursor.execute(f"UPDATE securities SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"Updated security {security_id}")
        return success

    def delete_security(self, security_id: int) -> bool:
        """Delete a security from master list (only if not used by any holdings)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if security is used by any holdings
        cursor.execute("SELECT COUNT(*) FROM investment_holdings WHERE security_id = ?", (security_id,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            conn.close()
            raise ValueError("Cannot delete security that is used by existing holdings")
        
        cursor.execute("DELETE FROM securities WHERE id = ?", (security_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"Deleted security {security_id}")
        return success
    # ==================== INVESTMENTS ====================


    # Securities (master list of investment instruments)
    def get_securities(self, search: str = None, limit: int = None) -> List[Dict[str, Any]]:
        """Get securities from master list, optionally filtered by search term."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM securities"
        params = []
        
        if search:
            query += " WHERE symbol LIKE ? OR name LIKE ? OR isin LIKE ?"
            params = [f"%{search}%", f"%{search}%", f"%{search}%"]
        
        query += " ORDER BY symbol"
        
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        securities = cursor.fetchall()
        conn.close()
        
        return securities

    def get_security(self, security_id: int) -> Dict[str, Any]:
        """Get a single security by ID."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM securities WHERE id = ?", (security_id,))
        security = cursor.fetchone()
        conn.close()
        
        return security

    def add_security(self, security_data: Dict[str, Any]) -> int:
        """Add a new security to the master list."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        required_fields = ['symbol', 'name', 'investment_type', 'currency']
        for field in required_fields:
            if field not in security_data:
                raise ValueError(f"Missing required field: {field}")
        
        cursor.execute("""
            INSERT INTO securities 
            (symbol, name, investment_type, isin, exchange, currency, sector, country, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            security_data['symbol'].upper(),
            security_data['name'],
            security_data['investment_type'],
            security_data.get('isin'),
            security_data.get('exchange'),
            security_data['currency'],
            security_data.get('sector'),
            security_data.get('country'),
            security_data.get('notes', '')
        ))
        
        security_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"Added security: {security_data['symbol']} - {security_data['name']}")
        return security_id

    def update_security(self, security_id: int, update_data: Dict[str, Any]) -> bool:
        """Update security information."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if not update_data:
            return False
        
        set_clause = ", ".join([f"{key} = ?" for key in update_data.keys()])
        values = list(update_data.values()) + [security_id]
        
        cursor.execute(f"UPDATE securities SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"Updated security {security_id}")
        return success

    def delete_security(self, security_id: int) -> bool:
        """Delete a security from master list (only if not used by any holdings)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Check if security is used by any holdings
        cursor.execute("SELECT COUNT(*) FROM investment_holdings WHERE security_id = ?", (security_id,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            conn.close()
            raise ValueError("Cannot delete security that is used by existing holdings")
        
        cursor.execute("DELETE FROM securities WHERE id = ?", (security_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"Deleted security {security_id}")
        return success

    def get_investment_holdings(self, account_id: int = None) -> List[Dict[str, Any]]:
        """Get all investment holdings with calculated quantity and average cost from transactions."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if account_id:
            query = """
                SELECT h.id as holding_id,
                       h.account_id,
                       h.security_id,
                       h.quantity as calculated_quantity,
                       h.average_cost as calculated_average_cost,
                       h.currency as holding_currency,
                       h.current_price,
                       h.last_price_update,
                       h.created_at as holding_created_at,
                       s.symbol,
                       s.name,
                       s.investment_type,
                       s.isin,
                       s.exchange,
                       s.currency as security_currency,
                       s.sector,
                       s.country,
                       s.notes as security_notes,
                       a.name as account_name,
                       a.currency as account_currency,
                       -- Prefer stored values, fall back to transaction calculations
                       CASE
                           WHEN h.quantity IS NOT NULL AND h.quantity > 0 THEN h.quantity
                           ELSE COALESCE(
                               SUM(CASE
                                   WHEN t.transaction_type = 'buy' THEN t.shares
                                   WHEN t.transaction_type = 'sell' THEN -t.shares
                                   ELSE 0
                               END), 0
                           )
                       END as quantity,
                       CASE
                           WHEN h.average_cost IS NOT NULL AND h.average_cost > 0 THEN h.average_cost
                           WHEN SUM(CASE WHEN t.transaction_type = 'buy' THEN t.shares ELSE 0 END) > 0
                           THEN SUM(CASE WHEN t.transaction_type = 'buy' THEN t.total_amount ELSE 0 END) /
                                SUM(CASE WHEN t.transaction_type = 'buy' THEN t.shares ELSE 0 END)
                           ELSE 0
                       END as average_cost
                FROM investment_holdings h
                JOIN securities s ON h.security_id = s.id
                JOIN accounts a ON h.account_id = a.id
                LEFT JOIN investment_transactions t ON h.id = t.holding_id
                WHERE h.account_id = ?
                GROUP BY h.id
                ORDER BY s.symbol
            """
            cursor.execute(query, (account_id,))
        else:
            query = """
                SELECT h.id as holding_id,
                       h.account_id,
                       h.security_id,
                       h.quantity as calculated_quantity,
                       h.average_cost as calculated_average_cost,
                       h.currency as holding_currency,
                       h.current_price,
                       h.last_price_update,
                       h.created_at as holding_created_at,
                       s.symbol,
                       s.name,
                       s.investment_type,
                       s.isin,
                       s.exchange,
                       s.currency as security_currency,
                       s.sector,
                       s.country,
                       s.notes as security_notes,
                       a.name as account_name,
                       a.currency as account_currency,
                       -- Prefer stored values, fall back to transaction calculations
                       CASE
                           WHEN h.quantity IS NOT NULL AND h.quantity > 0 THEN h.quantity
                           ELSE COALESCE(
                               SUM(CASE
                                   WHEN t.transaction_type = 'buy' THEN t.shares
                                   WHEN t.transaction_type = 'sell' THEN -t.shares
                                   ELSE 0
                               END), 0
                           )
                       END as quantity,
                       CASE
                           WHEN h.average_cost IS NOT NULL AND h.average_cost > 0 THEN h.average_cost
                           WHEN SUM(CASE WHEN t.transaction_type = 'buy' THEN t.shares ELSE 0 END) > 0
                           THEN SUM(CASE WHEN t.transaction_type = 'buy' THEN t.total_amount ELSE 0 END) /
                                SUM(CASE WHEN t.transaction_type = 'buy' THEN t.shares ELSE 0 END)
                           ELSE 0
                       END as average_cost
                FROM investment_holdings h
                JOIN securities s ON h.security_id = s.id
                JOIN accounts a ON h.account_id = a.id
                LEFT JOIN investment_transactions t ON h.id = t.holding_id
                GROUP BY h.id
                ORDER BY a.name, s.symbol
            """
            cursor.execute(query)

        rows = cursor.fetchall()
        conn.close()
        
        # Process rows to merge calculated values with transaction-based values
        holdings = []
        for row in rows:
            holding = dict(row)
            # Use transaction-based values if available, otherwise use stored values
            holding['quantity'] = holding['quantity'] or holding['calculated_quantity']
            holding['average_cost'] = holding['average_cost'] or holding['calculated_average_cost']
            
            # Map holding_id to id for frontend compatibility
            if 'holding_id' in holding:
                holding['id'] = holding['holding_id']
                del holding['holding_id']
            
            holdings.append(holding)
        
        return holdings

    def add_investment_holding(self, holding_data: Dict[str, Any]) -> int:
        """Add a new investment holding with optional ISIN."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # First, ensure the security exists in the securities table
        security_id = None
        
        # If security_id is provided directly, use it
        if 'security_id' in holding_data and holding_data['security_id']:
            security_id = holding_data['security_id']
        else:
            # Otherwise, check if security already exists by symbol
            cursor.execute("SELECT id FROM securities WHERE symbol = ?", (holding_data['symbol'].upper(),))
            existing_security = cursor.fetchone()
            
            if existing_security:
                security_id = existing_security['id']
            else:
                # Create new security
                cursor.execute("""
                    INSERT INTO securities 
                    (symbol, name, investment_type, isin, currency, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    holding_data['symbol'].upper(),
                    holding_data['name'],
                    holding_data['investment_type'],
                    holding_data.get('isin', '').upper() if holding_data.get('isin') else None,
                    holding_data['currency'],
                    holding_data.get('notes', '')
                ))
                security_id = cursor.lastrowid

        # Now create the holding
        cursor.execute("""
            INSERT INTO investment_holdings
            (account_id, security_id, currency, current_price)
            VALUES (?, ?, ?, ?)
        """, (
            holding_data['account_id'],
            security_id,
            holding_data['currency'],
            holding_data.get('current_price', 0)
        ))

        holding_id = cursor.lastrowid
        conn.commit()
        
        # Get symbol for logging if available
        symbol_for_log = holding_data.get('symbol', 'Unknown')
        if symbol_for_log == 'Unknown' and security_id:
            # If we don't have symbol but have security_id, fetch it for logging
            cursor_log = conn.cursor()
            cursor_log.execute("SELECT symbol FROM securities WHERE id = ?", (security_id,))
            security_row = cursor_log.fetchone()
            if security_row:
                symbol_for_log = security_row['symbol']
        
        logger.info(f"Added investment holding: {symbol_for_log} (ISIN: {holding_data.get('isin', 'N/A')})")
        conn.close()
        return holding_id

    def update_investment_holding(self, holding_id: int, update_data: Dict[str, Any]) -> bool:
        """Update an existing investment holding."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Build update query dynamically based on provided fields
        update_fields = []
        update_values = []
        
        # Only update fields that are actually provided in update_data
        if 'quantity' in update_data:
            update_fields.append("quantity = ?")
            update_values.append(update_data['quantity'])
        
        if 'purchase_price' in update_data:
            update_fields.append("average_cost = ?")
            update_values.append(update_data['purchase_price'])
        
        if 'account_id' in update_data:
            update_fields.append("account_id = ?")
            update_values.append(update_data['account_id'])
        
        if 'currency' in update_data:
            update_fields.append("currency = ?")
            update_values.append(update_data['currency'])
        
        if 'current_price' in update_data:
            update_fields.append("current_price = ?")
            update_values.append(update_data['current_price'])
        
        if 'notes' in update_data:
            update_fields.append("notes = ?")
            update_values.append(update_data['notes'])
        
        if not update_fields:
            # No fields to update
            conn.close()
            return False
        
        update_values.append(holding_id)
        
        query = f"""
            UPDATE investment_holdings
            SET {', '.join(update_fields)}
            WHERE id = ?
        """
        
        cursor.execute(query, update_values)

        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            # Build log message based on what was actually updated
            updated_fields = []
            if 'quantity' in update_data:
                updated_fields.append(f"quantity={update_data['quantity']}")
            if 'purchase_price' in update_data:
                updated_fields.append(f"price={update_data['purchase_price']}")
            if 'currency' in update_data:
                updated_fields.append(f"currency={update_data['currency']}")
            if 'notes' in update_data:
                updated_fields.append("notes")
            
            logger.info(f"Updated investment holding ID {holding_id}: {', '.join(updated_fields)}")

        return success

    def update_holding_price(self, holding_id: int, new_price: float) -> bool:
        """Update the current price of a holding."""

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE investment_holdings
            SET current_price = ?, last_price_update = ?
            WHERE id = ?
        """, (new_price, datetime.now().isoformat(), holding_id))

        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return success

    def delete_investment_holding(self, holding_id: int) -> bool:
        """Delete an investment holding and all its transactions."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Get holding info for logging
        cursor.execute("""
            SELECT s.symbol FROM investment_holdings h
            JOIN securities s ON h.security_id = s.id
            WHERE h.id = ?
        """, (holding_id,))
        holding = cursor.fetchone()

        if not holding:
            conn.close()
            return False

        # Delete the holding (CASCADE will delete related transactions)
        cursor.execute("DELETE FROM investment_holdings WHERE id = ?", (holding_id,))

        success = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if success:
            logger.info(f"Deleted investment holding: {holding['symbol']} (ID: {holding_id})")

        return success

    def add_investment_transaction(self, trans_data: Dict[str, Any]) -> int:
        """
        Add an investment transaction (buy/sell/dividend).

        This method:
        1. Creates the investment transaction record
        2. Updates the LINKED account's cash balance (checking/savings where money comes from)
        3. Creates a corresponding regular transaction in the linked account
        4. Links the two transactions together
        """
        # Ensure required investment transaction types exist
        self.ensure_investment_types_exist()

        conn = self._get_connection()
        cursor = conn.cursor()

        # Get the holding's investment account_id
        cursor.execute("""
            SELECT h.account_id, s.symbol, s.name 
            FROM investment_holdings h
            JOIN securities s ON h.security_id = s.id
            WHERE h.id = ?
        """, (trans_data['holding_id'],))
        holding_result = cursor.fetchone()
        if not holding_result:
            conn.close()
            raise ValueError(f"Holding ID {trans_data['holding_id']} not found")

        investment_account_id = holding_result['account_id']
        symbol = holding_result['symbol']
        holding_name = holding_result['name']

        # Get the linked account (where actual cash movements happen)
        cursor.execute("SELECT linked_account_id, currency FROM accounts WHERE id = ?", (investment_account_id,))
        inv_account = cursor.fetchone()

        if not inv_account or not inv_account['linked_account_id']:
            conn.close()
            raise ValueError(f"Investment account must have a linked account for cash movements")

        linked_account_id = inv_account['linked_account_id']

        # Get linked account currency
        cursor.execute("SELECT currency FROM accounts WHERE id = ?", (linked_account_id,))
        linked_account = cursor.fetchone()
        linked_account_currency = linked_account['currency'] if linked_account else trans_data['currency']

        transaction_type = trans_data['transaction_type']
        total_amount = trans_data['total_amount']
        fees = trans_data.get('fees', 0)

        # Determine transaction type and subtype for the regular transaction
        # and calculate cash impact
        if transaction_type == 'buy':
            # Expense: Securities Purchase
            cursor.execute("""
                SELECT tt.id as type_id, ts.id as subtype_id
                FROM transaction_types tt
                JOIN transaction_subtypes ts ON ts.type_id = tt.id
                WHERE tt.name = 'Investments' AND ts.name = 'Securities Purchase'
            """)
            type_info = cursor.fetchone()
            if not type_info:
                conn.close()
                raise ValueError("Transaction type 'Investments - Securities Purchase' not found in database")

            # Cash impact: negative (money leaving linked account)
            cash_impact = -(total_amount + fees)
            description = f"Purchase of {trans_data.get('shares', 0)} shares of {symbol}"
            destinataire = holding_name

        elif transaction_type == 'sell':
            # Income: Sale Proceeds
            cursor.execute("""
                SELECT tt.id as type_id, ts.id as subtype_id
                FROM transaction_types tt
                JOIN transaction_subtypes ts ON ts.type_id = tt.id
                WHERE tt.name = 'Investment Income' AND ts.name = 'Sale Proceeds'
            """)
            type_info = cursor.fetchone()
            if not type_info:
                conn.close()
                raise ValueError("Transaction type 'Investment Income - Sale Proceeds' not found in database")

            # Cash impact: positive (money coming into linked account)
            cash_impact = total_amount - fees
            description = f"Sale of {trans_data.get('shares', 0)} shares of {symbol}"
            destinataire = holding_name

        elif transaction_type == 'dividend':
            # Income: Dividends
            cursor.execute("""
                SELECT tt.id as type_id, ts.id as subtype_id
                FROM transaction_types tt
                JOIN transaction_subtypes ts ON ts.type_id = tt.id
                WHERE tt.name = 'Investment Income' AND ts.name = 'Dividends'
            """)
            type_info = cursor.fetchone()
            if not type_info:
                conn.close()
                raise ValueError("Transaction type 'Investment Income - Dividends' not found in database")

            # Cash impact: positive (money coming into linked account)
            cash_impact = total_amount
            description = f"Dividend from {symbol}"
            destinataire = holding_name

        else:
            conn.close()
            raise ValueError(f"Unknown transaction type: {transaction_type}")

        # Create the regular transaction in the LINKED account (not investment account)
        cursor.execute("""
            INSERT INTO transactions
            (account_id, transaction_date, amount, currency, description,
             destinataire, type_id, subtype_id, confirmed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            linked_account_id,  # Transaction goes to the linked account
            trans_data['transaction_date'],
            abs(cash_impact),  # Store as positive value, sign is determined by type
            linked_account_currency,
            trans_data.get('notes', description),
            destinataire,
            type_info['type_id'],
            type_info['subtype_id'],
            True
        ))

        linked_transaction_id = cursor.lastrowid

        # Update LINKED account balance (not investment account)
        cursor.execute("""
            UPDATE accounts
            SET balance = balance + ?
            WHERE id = ?
        """, (cash_impact, linked_account_id))

        # Create the investment transaction with link to regular transaction
        cursor.execute("""
            INSERT INTO investment_transactions
            (holding_id, transaction_type, transaction_date, shares, price_per_share,
             total_amount, fees, currency, notes, linked_transaction_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trans_data['holding_id'],
            transaction_type,
            trans_data['transaction_date'],
            trans_data.get('shares'),
            trans_data.get('price_per_share'),
            total_amount,
            fees,
            trans_data['currency'],
            trans_data.get('notes'),
            linked_transaction_id
        ))

        trans_id = cursor.lastrowid
        conn.commit()
        conn.close()

        logger.info(f"Added investment transaction: {transaction_type}, cash impact: {cash_impact} on linked account {linked_account_id}, linked to transaction {linked_transaction_id}")
        return trans_id

    def get_investment_transactions(self, holding_id: int = None) -> List[Dict[str, Any]]:
        """Get investment transactions, optionally filtered by holding."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if holding_id:
            query = """
                SELECT it.*, s.symbol, s.name
                FROM investment_transactions it
                JOIN investment_holdings h ON it.holding_id = h.id
                JOIN securities s ON h.security_id = s.id
                WHERE it.holding_id = ?
                ORDER BY it.transaction_date DESC
            """
            cursor.execute(query, (holding_id,))
        else:
            query = """
                SELECT it.*, s.symbol, s.name
                FROM investment_transactions it
                JOIN investment_holdings h ON it.holding_id = h.id
                JOIN securities s ON h.security_id = s.id
                ORDER BY it.transaction_date DESC
            """
            cursor.execute(query)
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def calculate_holding_summary(self, holding_id: int) -> Dict[str, Any]:
        """Calculate summary for a holding (shares, cost basis, gains, etc.)."""
        from datetime import datetime
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Get holding info
        cursor.execute("SELECT * FROM investment_holdings WHERE id = ?", (holding_id,))
        holding = dict(cursor.fetchone())
        
        # Get all transactions
        cursor.execute("""
            SELECT * FROM investment_transactions 
            WHERE holding_id = ? 
            ORDER BY transaction_date
        """, (holding_id,))
        transactions = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        # Calculate totals
        total_shares = 0
        total_cost = 0
        total_dividends = 0
        realized_gains = 0
        
        for trans in transactions:
            if trans['transaction_type'] == 'buy':
                total_shares += trans['shares']
                total_cost += trans['total_amount'] + trans['fees']
            elif trans['transaction_type'] == 'sell':
                shares_sold = trans['shares']
                total_shares -= shares_sold
                
                # Calculate realized gain (simplified - FIFO)
                avg_cost_per_share = total_cost / (total_shares + shares_sold) if (total_shares + shares_sold) > 0 else 0
                cost_of_sold = avg_cost_per_share * shares_sold
                realized_gains += (trans['total_amount'] - trans['fees']) - cost_of_sold
                total_cost -= cost_of_sold
            elif trans['transaction_type'] == 'dividend':
                total_dividends += trans['total_amount']
        
        # Current value
        current_price = holding['current_price']
        current_value = total_shares * current_price if total_shares > 0 else 0
        
        # Unrealized gains
        unrealized_gains = current_value - total_cost if total_shares > 0 else 0
        
        # Average cost per share
        avg_cost_per_share = total_cost / total_shares if total_shares > 0 else 0
        
        # Total return %
        total_invested = sum(t['total_amount'] + t['fees'] for t in transactions if t['transaction_type'] == 'buy')
        total_return_pct = ((current_value + total_dividends + realized_gains) / total_invested - 1) * 100 if total_invested > 0 else 0
        
        # Daily change
        daily_change = 0  # Would need historical data for this
        daily_change_pct = 0
        
        # Dividend yield (annual)
        # Calculate dividends in last 12 months
        one_year_ago = (datetime.now().date().replace(year=datetime.now().year - 1)).isoformat()
        recent_dividends = sum(t['total_amount'] for t in transactions 
                              if t['transaction_type'] == 'dividend' and t['transaction_date'] >= one_year_ago)
        dividend_yield = (recent_dividends / current_value * 100) if current_value > 0 else 0
        
        return {
            'holding_id': holding_id,
            'symbol': holding['symbol'],
            'name': holding['name'],
            'isin': holding.get('isin'),
            'investment_type': holding['investment_type'],
            'currency': holding['currency'],
            'total_shares': total_shares,
            'avg_cost_per_share': avg_cost_per_share,
            'current_price': current_price,
            'current_value': current_value,
            'total_cost': total_cost,
            'unrealized_gains': unrealized_gains,
            'realized_gains': realized_gains,
            'total_dividends': total_dividends,
            'total_return': unrealized_gains + realized_gains + total_dividends,
            'total_return_pct': total_return_pct,
            'daily_change': daily_change,
            'daily_change_pct': daily_change_pct,
            'dividend_yield': dividend_yield,
            'last_price_update': holding.get('last_price_update')
        }

    def get_portfolio_summary(self, account_id: int = None) -> Dict[str, Any]:
        """Get overall portfolio summary."""
        holdings = self.get_investment_holdings(account_id)
        
        total_value = 0
        total_cost = 0
        total_unrealized_gains = 0
        total_realized_gains = 0
        total_dividends = 0
        
        holdings_summary = []
        
        for holding in holdings:
            summary = self.calculate_holding_summary(holding['id'])
            holdings_summary.append(summary)
            
            total_value += summary['current_value']
            total_cost += summary['total_cost']
            total_unrealized_gains += summary['unrealized_gains']
            total_realized_gains += summary['realized_gains']
            total_dividends += summary['total_dividends']
        
        total_gains = total_unrealized_gains + total_realized_gains
        total_return_pct = ((total_value + total_dividends + total_realized_gains) / total_cost - 1) * 100 if total_cost > 0 else 0
        
        # Asset allocation
        allocation = {}
        for summary in holdings_summary:
            inv_type = summary['investment_type']
            allocation[inv_type] = allocation.get(inv_type, 0) + summary['current_value']
        
        return {
            'total_value': total_value,
            'total_cost': total_cost,
            'total_unrealized_gains': total_unrealized_gains,
            'total_realized_gains': total_realized_gains,
            'total_gains': total_gains,
            'total_dividends': total_dividends,
            'total_return_pct': total_return_pct,
            'holdings_count': len(holdings),
            'asset_allocation': allocation,
            'holdings': holdings_summary
        }

    def update_all_prices_from_yahoo(self) -> int:
        """Update all holding prices from Yahoo Finance."""

        holdings = self.get_investment_holdings()
        updated = 0

        for holding in holdings:
            try:
                symbol = holding['symbol']
                ticker = yf.Ticker(symbol)
                info = ticker.info

                # Try multiple price fields (different securities use different fields)
                # European securities often use different fields than US stocks
                current_price = (
                    info.get('currentPrice') or
                    info.get('regularMarketPrice') or
                    info.get('previousClose') or
                    info.get('navPrice')
                )

                if current_price and current_price > 0:
                    self.update_holding_price(holding['id'], current_price)
                    updated += 1
                    logger.info(f"Updated {holding['symbol']}: {current_price}")
                else:
                    logger.warning(f"No valid price found for {holding['symbol']} (ISIN: {holding.get('isin', 'N/A')})")
            except Exception as e:
                logger.error(f"Failed to update {holding['symbol']} (ISIN: {holding.get('isin', 'N/A')}): {e}")

        return updated

    # ==================== Machine Learning====================
    def get_training_data(self, min_transactions: int = 100) -> List[Dict]:
        #"""Get transactions for ML training."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                t.description,
                t.type_id,
                t.subtype_id,
                tt.category,
                COUNT(*) as frequency
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE t.description IS NOT NULL AND t.description != ''
            GROUP BY t.description, t.type_id, t.subtype_id
            HAVING frequency >= 1
            ORDER BY frequency DESC
            LIMIT ?
        """, (min_transactions * 10,))
        data = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return data
    # ==================== Machine Learning====================
    def get_transactions_for_prediction(self, months: int = 6, currency: str = None) -> List[Dict]:
        """Get transactions with full details for prediction analysis.

        Args:
            months: Number of months of history to retrieve
            currency: Filter transactions by currency (e.g., 'EUR', 'DKK'). If None, returns all currencies.
        """
        conn = self._get_connection()
        cursor = conn.cursor()

        query = """
            SELECT
                t.transaction_date as date,
                t.amount,
                t.currency,
                t.description,
                tt.name as type_name,
                tt.category,
                ts.name as subtype_name
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            LEFT JOIN transaction_subtypes ts ON t.subtype_id = ts.id
            WHERE transaction_date >= date('now', ?)
        """

        params = [f'-{months} months']

        # Filter by currency if specified
        if currency:
            query += " AND t.currency = ?"
            params.append(currency)

        query += " ORDER BY transaction_date DESC"

        cursor.execute(query, params)
        transactions = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return transactions
    
    def get_today_spending(self) -> float:
        """Get total spending for today."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            JOIN transaction_types tt ON t.type_id = tt.id
            WHERE transaction_date = date('now')
            AND tt.category = 'expense'
        """)
        result = cursor.fetchone()
        conn.close()
        return float(result['total'])
    
    
