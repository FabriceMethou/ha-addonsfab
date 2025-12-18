# Changelog

## 2.0.2

- Sync backend and frontend with latest `myfinanceapp` updates (auth fixes, UI tweaks, API enhancements).
- Standardize database path to `/app/data/finance.db` for add-on runtime.
- Add uvicorn log configuration and align supervisor command with main app startup flags.
- Update nginx to stream logs to stdout/stderr and expose FastAPI docs via port 8501.

## 2.0.1

- Fix login failing with `404 Not Found` caused by frontend requesting `/api/api/...` endpoints.

## 2.0.0

- Initial release.
