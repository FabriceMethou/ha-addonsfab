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

Captured from the most recent backup, taken 16 August 2026. It covers the cases
a smaller dataset hides:

- **Four currencies** — EUR, DKK, SEK and NOK across 18 accounts, so the
  server-side conversion paths are actually represented.
- **1100 transactions spanning 20 months**, up to two days before capture, so
  the *current* month has real data — which is the case the widget lives in.
- **Budgets scoped to all owners.** Every active budget here has a null
  `owner_id`, meaning it spans every owner. An earlier snapshot of the same
  database had the opposite: every budget owner-scoped, one set per person.
  Both configurations are real, and they must not be mixed blindly — an
  all-owners budget already contains what an owner-scoped budget on the same
  category counts, so summing both double-counts. The pace engine guards
  against this regardless of what today's data happens to look like.

### Two budget months, on purpose

| File | Month | Why |
|---|---|---|
| `budgets_vs_actual.json` | 2026-08 | The live case: current month, everything under budget and well behind pace (11 % spent at 52 % through the month). |
| `budgets_vs_actual_over.json` | 2026-07 | All three colour states in one payload: three categories over (max 163 %), one at 90 %, one at 15 %. |

The current month is what the app actually renders, but a month where nothing is
over budget cannot test over-budget rendering — hence the second fixture.

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
