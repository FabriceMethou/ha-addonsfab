# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal finance tracker with React + TypeScript frontend and FastAPI + Python backend. The application tracks transactions across multiple accounts, owners, and currencies with features for budgeting, debt tracking, investments, and ML-based categorization.

## Development Commands

### Backend (FastAPI)

```bash
# From project root
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Run development server (with auto-reload)
python main.py
# Backend runs on http://localhost:8000
# API docs: http://localhost:8000/docs

# Environment setup
export DATABASE_PATH=/home/fab/Documents/Development/myfinanceapp/data/finance.db
export JWT_SECRET_KEY="dev-secret-key"
```

### Frontend (React + Vite)

```bash
# From project root
cd frontend
npm install

# Run development server
npm run dev
# Frontend runs on http://localhost:5173

# Build for production
npm run build

# Type checking and linting
npx tsc --noEmit
npm run lint
```

### Docker Deployment

```bash
# From project root
docker-compose up -d
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```

### Database Operations

The SQLite database is auto-created at first run. Located at `data/finance.db`.

```bash
# Direct SQLite access
sqlite3 data/finance.db
```

## Architecture

### Backend Architecture

**Entry Point**: `backend/main.py` - FastAPI app with CORS, JWT auth, and API router registration

**Core Modules** (in project root, shared by backend):
- `database.py` - Database layer with `FinanceDatabase` class and `SimpleCRUD` helper
- `categorizer.py` - ML-based transaction categorization using scikit-learn
- `predictions.py` - Spending prediction and budget analysis
- `reports.py` - Financial reporting (category breakdowns, trends, cashflow)
- `backup_manager.py` - Database backup/restore with versioning
- `cloud_backup.py` - Google Cloud Storage and WebDAV integration
- `alerts.py` - Email/notification alerts using Apprise
- `auth.py` - User authentication and password management
- `isin_lookup.py` - Investment symbol lookup via yfinance
- `validators.py` - Input validation utilities
- `utils.py` - Shared utility functions

**API Routers** (`backend/api/`):
Each module follows the pattern: router definition, Pydantic models, dependency injection of `db` instance
- `auth.py` - JWT authentication, MFA, user management, login history
- `accounts.py` - Accounts, banks, owners, account validations, balance summaries
- `transactions.py` - Transaction CRUD, bulk operations, auto-categorization
- `categories.py` - Transaction types and subtypes (category hierarchy)
- `envelopes.py` - Savings goals (envelope budgeting system)
- `recurring.py` - Recurring transaction templates and pending transactions
- `debts.py` - Debt/loan tracking with payment schedules
- `investments.py` - Investment holdings and transactions
- `budgets.py` - Budget limits and tracking
- `reports.py` - Financial reports and analytics
- `backups.py` - Backup/restore operations
- `settings.py` - User preferences and application settings
- `currencies.py` - Currency management (EUR, USD, GBP, SEK, DKK, CHF)
- `work_profiles.py` - Work hour tracking
- `alerts.py` - Alert configuration and management

**Database Pattern**:
- All API routers import and instantiate `FinanceDatabase(db_path=DB_PATH)`
- DB_PATH read from environment: `os.getenv("DATABASE_PATH", "default/path")`
- `database.py` provides `SimpleCRUD` class for simple name-based tables (banks, owners, etc.)
- Complex operations use direct SQL with context manager: `with db.db_connection(commit=True) as conn:`

**Safe Update Pattern**:
```python
# Prevents SQL injection by whitelisting allowed columns
db._safe_update(
    table='accounts',
    item_id=account_id,
    updates={'balance': new_balance, 'currency': 'EUR'},
    allowed_columns={'balance', 'currency', 'name'}
)
```

### Frontend Architecture

**Entry Point**: `frontend/src/main.tsx` → `App.tsx`

**Routing**: React Router v6 with protected routes (JWT authentication required)

**State Management**:
- TanStack Query for server state (caching, refetching)
- React Context for auth state (`contexts/AuthContext.tsx`)
- Local component state with React hooks

**API Layer**: `services/api.ts`
- Axios instance with base URL from `VITE_API_URL` env var
- Request interceptor adds JWT token from localStorage
- Response interceptor handles 401 (auto-logout and redirect to /login)
- Organized by domain: `authAPI`, `accountsAPI`, `transactionsAPI`, etc.

**UI Components**:
- Primary: Material-UI v5 (dark theme configured in App.tsx)
- Experimental: shadcn/ui components in `components/shadcn/` (Radix UI + Tailwind)
- Layout: `components/Layout.tsx` - shared navigation and layout wrapper

**Pages** (`frontend/src/pages/`):
Each page is self-contained with its own data fetching (TanStack Query) and local state:
- `DashboardPage.tsx` - Overview with account balances, recent transactions, charts
- `TransactionsPage.tsx` - Transaction list, filters, create/edit forms
- `AccountsPage.tsx` - Account management, banks, owners
- `CategoriesPage.tsx` - Category hierarchy management
- `EnvelopesPage.tsx` - Savings goals (envelope system)
- `DebtsPage.tsx` - Debt tracking and payment schedules
- `InvestmentsPage.tsx` - Investment portfolio
- `RecurringPage.tsx` - Recurring transaction templates
- `BudgetsPage.tsx` - Budget creation and monitoring
- `ReportsPage.tsx` - Financial analytics and visualizations
- `BackupPage.tsx` - Database backup/restore UI
- `SettingsPage.tsx` - User preferences
- `SecurityPage.tsx` - Password change, MFA setup
- `NotificationsPage.tsx` - Alert configuration
- `WorkHoursPage.tsx` - Work hour tracking
- `LoginPage.tsx` - Authentication (JWT + optional MFA)

### Key Concepts

**Multi-Owner System**: Transactions tracked by owner (Me, Wife, Investor, Kids). Each account has an owner.

**Multi-Currency**: Supports EUR, USD, GBP, SEK, DKK, CHF. Each account has a base currency. Cross-currency transactions handled.

**Category Hierarchy**: Transaction types (Income, Expense, Transfer) → Subtypes (Groceries, Salary, etc.)

**Envelope System**: Savings goals with allocations from transactions. Track progress toward goals.

**ML Categorization**: `categorizer.py` trains on historical transactions to auto-suggest categories for new transactions.

**Pending Transactions**: Recurring templates generate pending transactions that require confirmation before being added to the ledger.

**Account Validations**: Periodic balance validations to track discrepancies between expected and actual balances.

## Environment Variables

**Backend** (`.env` in project root or set in shell):
```
DATABASE_PATH=/path/to/data/finance.db
JWT_SECRET_KEY=your-secret-key-here
```

**Frontend** (`.env` in `frontend/`):
```
VITE_API_URL=http://localhost:8000
```

## Common Workflows

### Adding a New API Endpoint

1. Define Pydantic models in the appropriate `backend/api/*.py` file
2. Add router function with `@router.get/post/put/delete` decorator
3. Add authentication dependency: `current_user: User = Depends(get_current_user)`
4. Use database instance (already imported): `db.method_name(...)`
5. Add corresponding frontend API function in `frontend/src/services/api.ts`
6. Use TanStack Query in page component to fetch/mutate data

### Testing Backend Changes

```bash
# Terminal 1: Start backend
cd backend
source venv/bin/activate
export PYTHONPATH=/home/fab/Documents/Development/myfinanceapp
export JWT_SECRET_KEY="dev-secret-key"
export DATABASE_PATH=/home/fab/Documents/Development/myfinanceapp/data/finance.db
python main.py

# Terminal 2: Test with curl or use Swagger UI
curl http://localhost:8000/docs
```

### Database Schema Changes

Database schema is defined in `database.py` in the `create_tables()` method. Schema is auto-created on first run. For schema changes, you may need to manually alter the database or create a migration script in `scripts/`.

### Mutation Error Handling Pattern

Always add error handlers to mutations to display backend error messages to users:

```typescript
const deleteMutation = useMutation({
  mutationFn: (id: number) => api.deleteItem(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
    alert('Item deleted successfully!');
  },
  onError: (error: any) => {
    console.error('Failed to delete item:', error);
    const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
    alert(`Failed to delete item: ${errorMessage}`);
  },
});
```

This pattern ensures backend validation errors (like "Cannot delete security that is used by existing holdings") are properly displayed to users.

## Important Notes

- **Shared modules**: Core Python modules (`database.py`, `categorizer.py`, etc.) are in the project root and shared by backend API routers
- **PYTHONPATH**: Backend expects PYTHONPATH to include project root for imports to work
- **Authentication**: All API endpoints (except `/api/auth/*` and `/health`) require JWT authentication
- **Date formats**: Backend expects ISO format strings (YYYY-MM-DD), frontend uses date-fns for parsing/formatting
- **Error handling**: Backend uses FastAPI HTTPException, frontend uses axios interceptors for global error handling
- **UI Migration**: Project is transitioning from MUI to shadcn/ui (Radix + Tailwind). Both are currently available.
- **Database ownership**: The database file (`data/finance.db`) may be owned by root. If encountering "readonly database" errors, run: `sudo chown fab:fab /home/fab/Documents/Development/myfinanceapp/data/finance.db`

## Balance Management Architecture

The system uses a **hybrid approach** for account balance tracking:

### Stored Balance (Fast)
- Account balances are stored in the `accounts.balance` column
- Updated incrementally when transactions are created/updated/deleted via `_update_account_balance()`
- Fast for normal operations but can drift due to bugs

### Balance Recalculation (Accurate)
- **Manual**: "Recalculate Balances" button in AccountsPage UI calls `POST /api/accounts/recalculate-balances`
- **Auto (Debug)**: Enable via Settings > Debug Settings > Auto-Recalculate Balances
- Recalculates by summing all confirmed transactions: `SELECT SUM(amount) FROM transactions WHERE account_id = ? AND confirmed = 1`
- Script available: `python3 scripts/recalculate_balances.py [--dry-run]`

### Transaction Amount Sign Conventions
**Critical**: Transaction amounts are stored with their sign in the database:
- **Expenses**: Negative amounts (e.g., -50.00)
- **Income**: Positive amounts (e.g., +1000.00)
- **Transfers**: Sign depends on direction (negative from source, positive to destination)

The `_update_account_balance()` method applies the signed amount directly:
```python
# For all transaction types (income, expense, transfer):
cursor.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, account_id))
```

When deleting transactions, reverse the sign:
```python
self._update_account_balance(cursor, account_id, -transaction['amount'], category)
```

### Investment Transactions and Linked Accounts
Investment transactions create **two records**:
1. **Investment transaction** (`investment_transactions` table)
2. **Linked transaction** (`transactions` table) - records cash movement in the linked checking/savings account

**Critical Pattern**:
```python
# When creating investment buy transaction:
cash_impact = -(total_amount + fees + tax)  # Negative for purchases
# Store with correct sign (NOT abs value):
cursor.execute("INSERT INTO transactions (..., amount, ...) VALUES (..., ?, ...)", (cash_impact,))
```

When deleting investment transactions, the system:
1. Reverses the linked account balance by the cash impact amount
2. Deletes the linked transaction
3. Deletes the investment transaction

**Common Bug Pattern**: Using `abs(cash_impact)` when storing linked transactions causes balance reversals to go in the wrong direction.

## Core Database Tables

Key tables for reference when implementing features:

- `users` - Authentication (username, password_hash, mfa_enabled, role)
- `accounts` - Bank accounts (bank_id, owner_id, balance, currency, account_type)
- `transactions` - Core ledger (account_id, date, amount, type_id, subtype_id, description, tags)
- `transaction_types` - Category level 1 (Income, Expense, Transfer)
- `transaction_subtypes` - Category level 2 (Groceries, Salary, etc.)
- `envelopes` - Savings goals (target_amount, current_amount, deadline)
- `recurring_templates` - Recurring transaction rules (recurrence_pattern, start/end dates)
- `pending_transactions` - Unconfirmed recurring transactions
- `debts` - Loan tracking (principal_amount, current_balance, interest_rate, payment_day)
- `investment_holdings` - Portfolio (security_id, account_id, quantity, current_price)
- `securities` - Investment master list (symbol, name, isin, investment_type, currency)
- `budgets` - Budget limits (category, limit, period)

## Field Mapping Conventions

Some API routers use field name mapping for better API semantics:

```python
# Example from debts.py - database uses different names than API
api_debt = {
    'creditor': debt.get('name'),          # DB: name → API: creditor
    'original_amount': debt.get('principal_amount'),  # DB: principal_amount → API: original_amount
    'current_balance': debt.get('current_balance'),   # Same name
}
```

When working with API endpoints, check for field mapping in the router file if database field names don't match API request/response field names.

## Debug Settings

The application includes comprehensive debug settings accessible via **Settings page > Debug Settings**:

### Master Debug Toggle
- `debug_mode` - Enables all debug features when turned on
- Settings stored in `preferences` table (per-user)
- Also cached in `localStorage` as `debug_settings` for quick access

### Individual Debug Options (visible when debug_mode = true)
1. **Auto-Recalculate Balances**: Recalculates account balances on AccountsPage load
2. **Show Debug Logs**: Enables `[DEBUG]` console logs throughout the app
3. **Log API Calls**: Logs all API requests/responses with `[DEBUG API]` prefix
4. **Log Transaction Operations**: Logs transaction CRUD operations

### Debug Log Format
```javascript
[DEBUG] Auto-recalculating balances on page load...
[DEBUG API] → POST /api/accounts/recalculate-balances
[DEBUG API] ← 200 POST /api/accounts/recalculate-balances { data: {...} }
```

### Implementation Details
- Backend: `backend/api/settings.py` stores/retrieves debug preferences
- Frontend: `frontend/src/services/api.ts` axios interceptors check `localStorage.debug_settings`
- Settings sync: `SettingsPage.tsx` syncs backend settings to localStorage on change

## Utility Scripts

Located in `scripts/` directory:

### Balance Management
- `recalculate_balances.py` - Recalculate all account balances from transactions
  - Usage: `python3 scripts/recalculate_balances.py [--dry-run]`
  - Shows which accounts have mismatches and updates them

### Investment Transaction Fixes
- `fix_investment_transaction_signs.py` - Fix incorrectly signed investment transactions
  - Finds linked transactions with wrong sign (purchases stored as positive instead of negative)
  - Interactive: asks for confirmation before making changes
  - Should be run once after fixing the investment transaction bug

## API Interceptor Debug Logging

The axios instance in `services/api.ts` includes debug logging that can be toggled via Settings:

```typescript
// Checks localStorage for debug settings
const isDebugEnabled = () => {
  const debugSettings = localStorage.getItem('debug_settings');
  return settings.debug_show_logs || settings.debug_log_api_calls;
};

// Request interceptor logs outgoing requests
api.interceptors.request.use((config) => {
  if (isDebugEnabled()) {
    console.log(`[DEBUG API] → ${config.method.toUpperCase()} ${config.url}`);
  }
});

// Response interceptor logs responses and errors
api.interceptors.response.use((response) => {
  if (isDebugEnabled()) {
    console.log(`[DEBUG API] ← ${response.status} ${response.config.method.toUpperCase()} ${response.config.url}`);
  }
});
```

This provides comprehensive visibility into API communication without modifying code or using external tools.
