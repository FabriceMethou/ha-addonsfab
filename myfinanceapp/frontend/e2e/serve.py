"""The real API and a build of the frontend, on a throwaway database of invented data."""
import os
import sys
import tempfile
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(os.path.dirname(HERE)), "app")
PASSWORD = "E2e-Passw0rd!"
os.environ.update(DATA_DIR=tempfile.mkdtemp(prefix="myfinance-e2e-"), JWT_SECRET_KEY="e2e",
                  ADMIN_DEFAULT_PASSWORD=PASSWORD)
sys.path[:0] = [APP, os.path.join(APP, "backend")]

import uvicorn  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import main  # noqa: E402
from deps import get_auth_manager, get_db  # noqa: E402

db = get_db()
get_auth_manager()
with db.db_connection(commit=True) as conn:
    conn.execute("UPDATE users SET requires_password_change = 0")
    food = conn.execute("""
        SELECT tt.id, ts.id FROM transaction_types tt
          JOIN transaction_subtypes ts ON ts.type_id = tt.id
         WHERE tt.name = 'Food' LIMIT 1
    """).fetchone()
    debt_type = conn.execute("SELECT id FROM transaction_types WHERE name = 'Debt'").fetchone()
    if not debt_type:
        debt_type = (conn.execute("INSERT INTO transaction_types (name, category) VALUES ('Debt', 'expense')").lastrowid,)
    # Bank fees live next to the loans in real data, and stay pickable.
    conn.execute("INSERT INTO transaction_subtypes (type_id, name) VALUES (?, 'Bank Fee')", (debt_type[0],))
db.set_preference("display_currency", "EUR")

owner = db.get_owners()[0]["id"]
account = db.add_account({"name": "E2E Checking", "owner_id": owner, "balance": 5000.0,
                          "opening_balance": 5000.0, "currency": "EUR", "account_type": "checking",
                          "opening_date": (date.today() - timedelta(days=100)).isoformat()})
db.add_transaction({"account_id": account, "amount": -80.0, "transaction_date": (date.today() - timedelta(days=10)).isoformat(),
                    "currency": "EUR", "type_id": food[0], "subtype_id": food[1],
                    "description": "Weekly shop", "destinataire": "E2E Market", "confirmed": True})
debt = db.add_debt({"name": "E2E Loan", "principal_amount": 1000.0, "current_balance": 1000.0,
                    "interest_rate": 12.0, "interest_type": "simple", "monthly_payment": 100.0,
                    "payment_day": 1, "currency": "EUR", "linked_account_id": account,
                    "start_date": "2026-01-01"})
db.record_debt_payment(debt, {"amount": 100.0, "payment_date": (date.today() - timedelta(days=20)).isoformat()})

db.set_preference("auto_refresh_prices", "false")  # no calls to Yahoo from a test
broker = db.add_account({"name": "E2E Broker", "owner_id": owner, "balance": 0.0, "opening_balance": 0.0,
                         "currency": "EUR", "account_type": "investment", "linked_account_id": account,
                         "opening_date": (date.today() - timedelta(days=100)).isoformat()})
security = db.add_security({"symbol": "E2E", "name": "E2E Fund", "investment_type": "etf", "currency": "EUR"})
holding = db.add_investment_holding({"account_id": broker, "security_id": security, "currency": "EUR",
                                     "current_price": 0})
db.add_investment_transaction({"holding_id": holding, "transaction_type": "buy",
                               "transaction_date": (date.today() - timedelta(days=30)).isoformat(),
                               "shares": 2, "price_per_share": 50, "total_amount": 100, "fees": 0,
                               "tax": 0, "currency": "EUR"})
db.update_holding_price(holding, 60.0)
closed_security = db.add_security({"symbol": "GONE", "name": "Sold Out Fund", "investment_type": "mutual_fund", "currency": "EUR"})
closed = db.add_investment_holding({"account_id": broker, "security_id": closed_security, "currency": "EUR",
                                    "current_price": 0})
for kind, price, days in (("buy", 10, 60), ("sell", 15, 40)):
    db.add_investment_transaction({"holding_id": closed, "transaction_type": kind,
                                   "transaction_date": (date.today() - timedelta(days=days)).isoformat(),
                                   "shares": 2, "price_per_share": price, "total_amount": 2 * price, "fees": 0,
                                   "tax": 0, "currency": "EUR"})

DIST = os.path.join(HERE, ".dist")
main.app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")


@main.app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    return FileResponse(os.path.join(DIST, "index.html"))


uvicorn.run(main.app, host="127.0.0.1", port=int(os.environ["E2E_PORT"]), log_level="warning")
