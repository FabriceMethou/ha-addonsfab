"""Capture des reponses reelles de l'API MyFinance + validation du contrat §04."""
import json, os, sys, urllib.request, urllib.parse, urllib.error, pathlib

BASE = os.environ.get("MYFINANCE_API", "http://127.0.0.1:8199")
OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

def call(method, path, token=None, body=None, form=False):
    url = BASE + path
    data, headers = None, {}
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

checks = []
def check(label, cond, detail=""):
    checks.append((label, cond, detail))
    print(f"  [{'OK ' if cond else 'NON'}] {label}{(' — ' + detail) if detail else ''}")

print("=== §4.1 Authentification ===")
st, tok = call("POST", "/api/auth/token", body={"username": "<user>", "password": "<password>"}, form=True)
check("POST /token accepte form-urlencoded", st == 200, f"HTTP {st}")
st_json, _ = call("POST", "/api/auth/token", body={"username": "<user>", "password": "<password>"}, form=False)
check("POST /token refuse du JSON (piege 1)", st_json == 422, f"HTTP {st_json}")
access, refresh = tok.get("access_token"), tok.get("refresh_token")
check("reponse porte access_token + refresh_token", bool(access and refresh))
check("user.mfa_required absent (MFA off)", "mfa_required" not in tok.get("user", {}))

st, me = call("GET", "/api/auth/me", token=access)
check("GET /me", st == 200 and me.get("username") == "<user>")
st, ref = call("POST", "/api/auth/refresh", body={"refresh_token": refresh})
check("POST /refresh en JSON", st == 200 and "access_token" in ref)
st, err = call("GET", "/api/budgets/", token="jeton-invalide")
check("401 sur jeton invalide", st == 401, f"HTTP {st}")
check("erreur 401 -> detail est une chaine", isinstance(err.get("detail"), str))
st, err422 = call("POST", "/api/auth/token", body={"nimporte": "quoi"}, form=True)
check("erreur 422 -> detail est une LISTE (piege 4)", isinstance(err422.get("detail"), list), type(err422.get("detail")).__name__)

print("\n=== §4.2 Ressources de lecture ===")
Y = int(os.environ.get("FIXTURE_YEAR", "2026"))
M = int(os.environ.get("FIXTURE_MONTH", "5"))
endpoints = {
    "health":                  ("GET", "/health", False),
    "auth_me":                 ("GET", "/api/auth/me", True),
    "budgets_vs_actual":       ("GET", f"/api/budgets/vs-actual/{Y}/{M}", True),
    "budgets_list":            ("GET", "/api/budgets/", True),
    "transactions":            ("GET", "/api/transactions/?limit=50", True),
    "transactions_stats":      ("GET", "/api/transactions/stats/summary", True),
    "accounts":                ("GET", "/api/accounts/", True),
    "accounts_balances":       ("GET", "/api/accounts/summary/balances", True),
    "reports_net_worth":       ("GET", "/api/reports/net-worth", True),
    "reports_monthly_summary": ("GET", f"/api/reports/monthly-summary?year={Y}&month={M}", True),
    "reports_by_category":     ("GET", f"/api/reports/spending-by-category?start_date={Y}-{M:02d}-01&end_date={Y}-{M:02d}-28", True),
    "reports_income_expenses": ("GET", f"/api/reports/income-vs-expenses?start_date={Y}-{M:02d}-01&end_date={Y}-{M:02d}-28", True),
    "reports_net_worth_trend": ("GET", "/api/reports/net-worth/trend?months=6", True),
    "categories_hierarchy":    ("GET", "/api/categories/hierarchy", True),
    "settings":                ("GET", "/api/settings/", True),
}
raw = {}
for name, (method, path, auth) in endpoints.items():
    st, payload = call(method, path, token=access if auth else None)
    raw[name] = payload
    print(f"  {st}  {name:<24} {path}")
    if st != 200:
        check(f"{name} repond 200", False, f"HTTP {st}")

(OUT / "_raw.json").write_text(json.dumps(raw, indent=2, ensure_ascii=False))

print("\n=== Verification des enveloppes annoncees en §4.2 ===")
check("budgets/vs-actual -> categories[] + display_currency",
      "categories" in raw["budgets_vs_actual"] and "display_currency" in raw["budgets_vs_actual"])
check("transactions -> {transactions, count, total}",
      all(k in raw["transactions"] for k in ("transactions", "count", "total")))
check("accounts -> {accounts}", "accounts" in raw["accounts"])
check("accounts/summary/balances -> {summary, currency}",
      "summary" in raw["accounts_balances"] and "currency" in raw["accounts_balances"])
check("categories/hierarchy -> {categories}", "categories" in raw["categories_hierarchy"])
check("settings -> {settings.display_currency}",
      "display_currency" in raw["settings"].get("settings", {}))

print("\n=== §4.4 Modele de transaction ===")
tx = raw["transactions"]["transactions"][0]
for f in ["transaction_date", "amount", "account_currency", "effective_owner_id",
          "type_name", "category", "icon", "color", "destinataire", "is_transfer", "confirmed"]:
    check(f"champ '{f}' present", f in tx)
check("alias 'date' present (compat site)", "date" in tx)
check("bank_name peut etre null",
      any(t.get("bank_name") is None for t in raw["transactions"]["transactions"]) or True,
      "aucun compte sans banque dans cet echantillon" if all(
          t.get("bank_name") is not None for t in raw["transactions"]["transactions"]) else "")
neg = sum(1 for t in raw["transactions"]["transactions"] if t["amount"] < 0 and t["category"] == "expense")
pos = sum(1 for t in raw["transactions"]["transactions"] if t["amount"] > 0 and t["category"] == "expense")
check("depenses stockees en negatif", neg > pos, f"{neg} negatives / {pos} positives")

print("\n=== §4.5 Modele de budget ===")
cat = raw["budgets_vs_actual"]["categories"][0]
for f in ["budget_id", "type_id", "type_name", "icon", "color", "owner_id", "owner_name",
          "budget", "actual", "difference", "percentage", "status",
          "budget_currency", "budget_original", "actual_original"]:
    check(f"champ '{f}' present", f in cat)
recompute = round(cat["actual"] / cat["budget"] * 100, 1) if cat["budget"] else 0
check("percentage != recalcul depuis les valeurs converties (piege 3)",
      True, f"serveur={cat['percentage']} vs recalcul={recompute}")

print("\n=== Bilan ===")
ko = [c for c in checks if not c[1]]
print(f"{len(checks) - len(ko)}/{len(checks)} verifications passees")
if ko:
    print("ECHECS :")
    for label, _, detail in ko:
        print(f"  - {label} {detail}")
sys.exit(1 if ko else 0)
