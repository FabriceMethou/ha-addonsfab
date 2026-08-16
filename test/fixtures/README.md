# API fixtures

Real responses captured from the MyFinance FastAPI backend, then anonymised.
They exist so the model layer is tested against what the API actually returns,
not against what the documentation says it returns.

## How they were produced

1. A copy of a real database was served by the backend on `127.0.0.1:8199`,
   with both outstanding backend fixes applied.
2. `tool/capture_fixtures.py` logged in and called every endpoint the app uses,
   asserting the shapes documented in the technical spec (§4). All 45 assertions
   passed, including the four documented traps.
3. `tool/anonymize_fixtures.py` stripped identifying data before anything was
   committed here.

Regenerate with a backend running locally:

```bash
MYFINANCE_API=http://127.0.0.1:8199 FIXTURE_YEAR=2026 FIXTURE_MONTH=5 \
  python3 tool/capture_fixtures.py /tmp/raw          # writes /tmp/raw/_raw.json
python3 tool/anonymize_fixtures.py /tmp/raw test/fixtures
```

## What this dataset exercises

The source database was chosen because it covers the cases a smaller one hides:

- **Four currencies** — EUR, DKK, SEK and NOK across 18 accounts, so the
  server-side conversion paths are actually represented.
- **Two owners with parallel budgets** — each owns a Food, Housing and Transport
  budget. Every budget is owner-scoped, so summing them for the overall ring is
  correct here. Careful: a budget with a null `owner_id` spans *all* owners, so
  mixing scoped and unscoped budgets for the same category would double-count.
  The pace engine has to defend against that even though this data doesn't
  trigger it.
- **Budgets over limit** — several categories sit past 100 %, one at 196 %, so
  over-budget rendering has real values to work with.
- **750 transactions spanning 18 months**, including transactions on the last
  day of a month, which is what the budget date fix was about.

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
