"""
A client for the real API routes on a throwaway database.

Most of the suite calls database methods directly, which is how an account that
could not be created and a loan row that returned a 500 stayed green. Tests that
protect a user-facing path should go through here.
"""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))


@pytest.fixture
def api(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api import accounts, categories, debts, investments, reports, transactions
    from api.auth import get_current_user
    from database import FinanceDatabase

    db = FinanceDatabase(db_path=str(tmp_path / "api.db"))
    db.set_preference("display_currency", "EUR")

    app = FastAPI()
    for module, prefix in ((accounts, "/api/accounts"), (categories, "/api/categories"),
                           (debts, "/api/debts"),
                           (investments, "/api/investments"), (reports, "/api/reports"),
                           (transactions, "/api/transactions")):
        # Other test modules rebind these too, so set them for this test only.
        monkeypatch.setattr(module, "db", db)
        app.include_router(module.router, prefix=prefix)
    app.dependency_overrides[get_current_user] = lambda: None

    client = TestClient(app, raise_server_exceptions=False)
    client.db = db
    return client
