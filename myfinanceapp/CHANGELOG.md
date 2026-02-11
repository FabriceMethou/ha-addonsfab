# Changelog

## 2.0.19
- Fix bugs from previous version 

## 2.0.18

### Performance
- Lazy-load all page components with React `Suspense` for faster initial load
- Add `staleTime` / `gcTime` to React Query client and per-query caches to reduce redundant API calls
- Add Vite `manualChunks` for vendor code splitting (react, recharts, nivo, radix-ui, forms)

### Security
- Add JWT refresh token flow with automatic silent renewal and request queuing
- Reject refresh and MFA-pending tokens used as access tokens
- Add security headers middleware (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Disable FastAPI docs/redoc in production by default
- Whitelist allowed columns in `update_type` / `update_subtype` to prevent SQL injection
- Prevent directory traversal in backup download endpoint
- Restrict backup restore and delete to admin users only
- Remove SMTP password from persisted config; use `SMTP_PASSWORD` env var instead
- Generate random default admin password instead of hardcoded "admin"; support `ADMIN_DEFAULT_PASSWORD` env var
- Enforce password strength validation via `validators.py`
- Remove unused session management code from `auth.py`

### Features
- Add manual alert check endpoint (`POST /alerts/check`) for budget and daily spending alerts
- Add server-side transaction pagination (`limit`/`offset` filters and `count_transactions`)
- Add `BackupPage` as a dedicated page for backup management
- Add `useBreakpoint` hook for responsive breakpoint detection
- Add `transaction_id` column to envelope transactions for virtual linking

### Bug Fixes
- Fix same-currency transfer balance calculation (use `abs(amount)` for destination account)
- Simplify balance impact calculation — amounts are already signed, remove redundant category branching
- Fix `datetime.utcnow()` deprecation — use `datetime.now(timezone.utc)`

### UI/UX
- Mobile-responsive card layout for accounts, debts, investments, recurring, reconcile, and reports pages
- Collapsible account cards on mobile with expand/collapse chevron
- Improved responsive grid layouts and tab wrapping across pages
- Updated dialog and tab component styling

## 2.0.17

- Adding Reconcilation
- Fixing currency
- Other small fixes

## 2.0.16

- Fix visual
- Add money flow
- Fix recurring transactions

## 2.0.15

- Add MFA support
- Fix password change flow
- Fix admin user 

## 2.0.14

- Fix budget bug with mutli-currency transactions
- Fix recurring transactions value bugs
- Fix validation of account balance UI/UX

## 2.0.13

- Update dockerfile

## 2.0.12

- Update visual of Report, Dashboard and Transaction page
- Fix Networth report issue 

## 2.0.11

- Allow recurring templates to omit description, recipient, and subtype values while keeping database inserts safe.
- Confirm pending transactions through full add-transaction logic and reject them from the pending queue.
- Add recipient autocomplete, clearer pending transaction details, and toast feedback to the recurring templates UI.
- Refine transactions detail card styling.

## 2.0.10

- Add KPI summary cards and refreshed headers for Transactions and Work Hours pages, plus improved empty-state UX.
- Include income totals in spending trends responses and tighten debug setting updates to admin users only.
- Require `JWT_SECRET_KEY` at startup and standardize DB path defaults to the project data directory.
- Add `.env.example`, a migration script for optional envelope transaction accounts, and move diagnostics into `app/tools`.

## 2.0.9

### Critical Bug Fixes
- **Fix transfer sign convention**: Transfers now correctly stored as negative (money leaving source account), resolving the critical bug where transfers were incorrectly increasing both source and destination account balances
- Fix balance calculation logic in `investigate_account` to use correct sign conventions
- Fix hardcoded EUR currency - now uses account's actual currency
- Fix `destinataire` NULL constraint handling in transaction updates
- Remove duplicate `recalculate-balances` route implementation

### UI Modernization
- **Complete visual redesign** with modern glass morphism aesthetic across all 13 pages
- Enhanced card styling with `bg-card/50 backdrop-blur-sm` for glass effect
- Consistent rounded corners (`rounded-xl`) and improved padding (`p-6`)
- Modern borders (`border border-border`) throughout the application

### Dashboard Enhancements
- Converted income visualization to animated Nivo donut chart
- Added Sankey flow diagram for money distribution visualization
- Real delta calculations comparing current vs previous month
- Gradient background effects on KPI cards
- Sparkline trends for account balances
- Modernized Budget Overview section with enhanced bar charts and progress cards

### Charts & Visualizations
- Updated all Recharts components with modern styling:
  - Clean CartesianGrid with subtle stroke (`#2a2a2a`) and opacity
  - Removed tick and axis lines for cleaner appearance
  - Dark tooltips with rounded corners (`#0a0a0a` background)
  - Circle icon legends with better padding
  - Increased bar radius (6px) for smoother corners
- Fixed spending data display in ReportsPage pie charts (added `Math.abs()` for negative values)
- Enhanced MetricCard component across Reports page

### New Features
- **Toast notification system**: New ToastContext and Toast component for user feedback
- **Debug settings**: Added auto-recalculate and API logging preferences in Settings page
- **Balance recalculation**: New API endpoint and UI feature in Accounts page to fix balance drift
- Added validation requiring investment accounts to have linked accounts
- Enhanced error handlers in TransactionsPage mutations for better UX
- Improved investment transaction error logging

### Backend Improvements
- Added balance recalculation utilities and safe update methods to `database.py`
- Enhanced `POST /accounts/recalculate-balances` API endpoint
- Improved investment transaction handling with proper sign conventions
- Added debug settings support for per-user preferences
- Expanded database utilities with safe update methods
- Database concurrency safeguards (WAL + busy timeout)

### New Dependencies
- `@nivo/pie`, `@nivo/sankey`, `@nivo/sunburst` - Modern chart visualizations
- `@tremor/react` - Fintech-focused UI component library
- Updated Tailwind configuration to support Tremor components

### Utility Scripts
- `fix_investment_transaction_signs.py`: Data correction script for investment transactions
- `recalculate_balances.py`: Database maintenance script for balance recalculation
- `debug_account.py`: Debugging utility for account issues

### Documentation
- Updated `CLAUDE.md` with balance management architecture
- Documented transaction sign conventions
- Added debug settings documentation

## 2.0.8

- Improve transaction and transfer handling (cross-currency transfers, recipient fields, and balance recalculation fixes).
- Expand investment tracking with taxes/fees and more resilient price updates.
- Refine reporting and dashboard calculations to exclude transfers from income/expense totals.
- Update UI flows for transactions, investments, and account selectors.
- Add database concurrency safeguards (WAL + busy timeout) and new schema migrations.

## 2.0.7

- Backup importation and downloads option

## 2.0.6

- Add a display-currency preference and apply it across dashboard, reports, and account summaries.
- Convert account summaries, transaction summaries, and key reports to the preferred display currency using the currencies table rates.
- Keep spending-by-category payloads backward compatible and restore the add-on DB path default.
- Show account names in the accounts list, selector, and balance validation dialog.

## 2.0.5

- Sync frontend with latest app changes: drop unused MUI theme/dependencies and rely on the shadcn/Tailwind stack.
- Fix password change flow by sending the correct payload keys and surfacing validation errors from the API.
- Refresh frontend docs to reflect the current UI stack.

## 2.0.4

- Allow explicit account names with validation and sensible defaults; record opening balances correctly when creating accounts.
- Add bank/owner update support in the backend and expose edit actions in the accounts UI.
- Refresh frontend setup script messaging for the Vite dev port.

## 2.0.3

- Fix frontend API base URL so requests hit `/api/...` (avoid `/api/api/...` 404s).
- Make Docker build ARG `VITE_API_URL` default empty; set per-environment as needed.

## 2.0.2

- Sync backend and frontend with latest `myfinanceapp` updates (auth fixes, UI tweaks, API enhancements).
- Standardize database path to `/app/data/finance.db` for add-on runtime.
- Add uvicorn log configuration and align supervisor command with main app startup flags.
- Update nginx to stream logs to stdout/stderr and expose FastAPI docs via port 8501.

## 2.0.1

- Fix login failing with `404 Not Found` caused by frontend requesting `/api/api/...` endpoints.

## 2.0.0

- Initial release.
