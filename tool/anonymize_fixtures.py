"""Anonymise les reponses capturees avant versionnement.

Les montants sont multiplies par un facteur constant : les ratios, et donc
tous les pourcentages de budget, restent exacts, ce qui garde les fixtures
utiles pour tester le moteur de rythme, sans exposer de vrais montants.
"""
import json, sys, hashlib, pathlib

SCALE = 0.7314
RAW = pathlib.Path(sys.argv[1]) / "_raw.json"
OUT = pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

MONEY = {
    "amount", "balance", "total_balance", "budget", "actual", "difference",
    "budget_original", "actual_original", "income", "expenses", "net",
    "net_worth", "total_assets", "total_debts", "assets", "debts",
    "current_net_worth", "transfer_amount", "opening_balance",
    "principal_amount", "current_balance",
}
COUNTS = {"count", "account_count", "transaction_count", "debt_count", "months",
          "id", "budget_id", "type_id", "subtype_id", "owner_id", "account_id",
          "bank_id", "transfer_account_id", "linked_transfer_id",
          "effective_owner_id", "recurring_template_id", "year", "month",
          "percentage", "limit", "offset"}

MERCHANTS = ["Corner Bakery", "Metro Market", "Blue Line Transit", "Riverside Cafe",
             "Northgate Pharmacy", "City Grocers", "Halden Bistro", "Orchard Foods",
             "Central Fuel", "Lakeside Diner", "Union Hardware", "Verde Market",
             "Sunset Deli", "Harbour Books", "Elm Street Kitchen"]

TAGS = ["Groceries", "Travel", "Gift", "Shared", "Review", "Refund"]

# Mappage sequentiel par registre : deux valeurs sources distinctes ne peuvent
# jamais tomber sur le meme pseudonyme, contrairement a un mappage par hachage.
_registry = {}

def fake(value, pool, prefix):
    if value is None or value == "":
        return value
    seen = _registry.setdefault(prefix, {})
    if value not in seen:
        i = len(seen)
        seen[value] = pool[i] if i < len(pool) else f"{prefix}{i + 1}"
    return seen[value]

def walk(node, key=None, counts_ok=(), name_is_account=False):
    if isinstance(node, dict):
        return {k: walk(v, k, counts_ok, name_is_account) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v, key, counts_ok, name_is_account) for v in node]

    if isinstance(node, (int, float)) and not isinstance(node, bool):
        if key in COUNTS or key in counts_ok:
            return node
        if key in MONEY or key == "total":
            return round(node * SCALE, 2)
        return node

    if isinstance(node, str):
        if key in ("destinataire", "recipient"):
            return fake(node, MERCHANTS, "Merchant ")
        if key == "description":
            return None if not node else f"Note {int(hashlib.sha256(node.encode()).hexdigest(), 16) % 900 + 100}"
        if key == "owner_name":
            return fake(node, ["Owner A", "Owner B", "Owner C"], "Owner ")
        # 'name' designe un compte dans les fixtures de comptes, mais une
        # categorie ailleurs (categories/hierarchy) : la renommer partout
        # casserait le lien entre budgets et hierarchie.
        if key in ("account_name", "transfer_account_name") or (key == "name" and name_is_account):
            return fake(node, ["Everyday Account", "Savings Pot", "Joint Account",
                               "Travel Card", "Cash Wallet", "Brokerage"], "Account ")
        if key in ("bank_name", "transfer_bank_name"):
            return fake(node, ["Northbank", "Meridian Bank", "Coastal Credit"], "Bank ")
        if key == "tags":
            return ", ".join(fake(t.strip(), TAGS, "Tag ") for t in node.split(",") if t.strip())
        if key in ("username",):
            return "demo"
        if key in ("email",):
            return "demo@example.com"
        if key in ("access_token", "refresh_token", "mfa_secret", "salt", "password_hash"):
            return "<redacted>"
    return node

raw = json.loads(RAW.read_text())
written = []
ACCOUNT_FIXTURES = {"accounts", "accounts_balances"}
for name, payload in raw.items():
    # dans l'enveloppe transactions, 'total' est un nombre de lignes, pas un montant
    counts_ok = ("total",) if name == "transactions" else ()
    clean = walk(payload, None, counts_ok, name_is_account=name in ACCOUNT_FIXTURES)
    p = OUT / f"{name}.json"
    p.write_text(json.dumps(clean, indent=2, ensure_ascii=False) + "\n")
    written.append((name, p.stat().st_size))

for n, s in sorted(written):
    print(f"  {n:<26} {s:>7} o")

# controles d'anonymisation
blob = json.dumps([json.loads((OUT / f'{n}.json').read_text()) for n, _ in written])
leaks = [w for w in ["<witnesses supplied at run time>"]
         if w.lower() in blob.lower()]
print()
print("FUITE DETECTEE : " + ", ".join(leaks) if leaks else "aucune fuite detectee sur les temoins connus")

# le ratio budget/actual doit survivre a la mise a l'echelle
src = raw["budgets_vs_actual"]["categories"][0]
dst = json.loads((OUT / "budgets_vs_actual.json").read_text())["categories"][0]
r_src = round(src["actual"] / src["budget"] * 100, 1)
r_dst = round(dst["actual"] / dst["budget"] * 100, 1)
print(f"ratio preserve : source={r_src}  anonymise={r_dst}  percentage={dst['percentage']}  "
      + ("OK" if abs(r_src - r_dst) < 0.15 else "CASSE"))
