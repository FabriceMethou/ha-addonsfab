# Changelog

## 2.0.2

- Sync backend and frontend with latest `myfinanceapp` updates (auth fixes, UI tweaks, API enhancements).
- Standardize database path to `/app/data/finance.db` for add-on runtime.
- Add uvicorn log configuration and align supervisor command with main app startup flags.
- Update nginx to stream logs to stdout/stderr and expose FastAPI docs via port 8501.

## 2.0.3

- Fix frontend API base URL so requests hit `/api/...` (avoid `/api/api/...` 404s).
- Make Docker build ARG `VITE_API_URL` default empty; set per-environment as needed.

## 2.0.1

- Fix login failing with `404 Not Found` caused by frontend requesting `/api/api/...` endpoints.

## 2.0.0

- Initial release.
