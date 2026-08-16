# API fixtures

Real responses captured from the MyFinance FastAPI backend, then anonymised.
They exist so the model layer is tested against what the API actually returns,
not against what the documentation says it returns.

## How they were produced

1. A copy of a real database was served by the backend on `127.0.0.1:8199`.
2. `tool/capture_fixtures.py` logged in and called every endpoint the app uses,
   asserting the shapes documented in the technical spec (§4).
3. `tool/anonymize_fixtures.py` stripped identifying data before anything was
   committed here.

Regenerate with a backend running locally:

```bash
python3 tool/capture_fixtures.py /tmp/raw          # writes /tmp/raw/_raw.json
python3 tool/anonymize_fixtures.py /tmp/raw test/fixtures
```

## What was anonymised

| Field | Treatment |
|---|---|
| `destinataire`, `recipient` | replaced with invented merchant names |
| `description` | replaced with `Note NNN`, or nulled when empty |
| `owner_name` | `Owner A`, `Owner B`, … |
| `account_name`, `name` (accounts only) | invented account names |
| `bank_name` | invented bank names |
| `tags` | replaced with a generic tag vocabulary |
| `username`, `email` | `demo`, `demo@example.com` |
| tokens, `salt`, `mfa_secret` | `<redacted>` |
| monetary amounts | multiplied by a constant factor |

Category names (`type_name`, `subtype_name`, and `name` in
`categories_hierarchy.json`) are **not** anonymised. They are not personal data,
and renaming them would break the link between budgets, transactions and the
category hierarchy that several tests rely on.

## Two properties the tests depend on

**Ratios survive.** Amounts are scaled by a single constant, so every
`actual / budget` ratio — and therefore every `percentage` the server sent — is
still exact. The pace engine can be tested on this data.

**The fixtures agree with each other.** Pseudonyms are assigned sequentially
from a registry rather than by hashing, so two distinct real values can never
collapse onto the same fake one. `owner_id` → `owner_name` stays bijective, and
every `type_name` in `budgets_vs_actual.json` and `transactions.json` exists in
`categories_hierarchy.json`.

Both properties are asserted by the anonymiser itself when it runs.
