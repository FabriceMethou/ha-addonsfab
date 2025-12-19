# Changelog

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
