# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A read-only Flutter companion for the MyFinance tracker. It displays budgets,
accounts, transactions and reports, and drives a home-screen widget showing
budget status against the pace of the month. **It never writes financial data.**

Android is the target that ships. iOS builds from the same code but its widget
is a separate WidgetKit extension that does not exist yet.

## The backend lives in another repository

```
~/Documents/Development/ha-addonsfab/myfinanceapp/     # FastAPI + React, the live copy
```

Beware: a second, older copy exists at `~/Documents/Development/myfinanceapp/`
with uncommitted work in it. It is **not** the source of truth. Backend changes
belong in the `ha-addonsfab` copy.

## Non-negotiable rules

**Read-only, structurally.** `lib/data/finance_api.dart` declares only `GET`
methods for financial data, plus the three auth `POST`s. Do not add a write path.

**Never aggregate on the device.** Report and budget endpoints return amounts
already converted server-side into the display currency. List endpoints
(transactions, accounts) return raw amounts in each account's own currency, and
they include both legs of every transfer. Summing a transaction list therefore
produces a wrong total even in a single-currency setup. Every total, average and
balance comes from an endpoint.

The one exception is `lib/domain/budget_pace.dart`, which compares values the
server already aggregated into one currency.

**Never recompute `percentage`.** The server computes it before currency
conversion. Recomputing it from the rounded, converted `actual` and `budget`
drifts, and the app would colour a category differently from the website.

**Stay consistent with the website.** Colour thresholds (≥100 % over, ≥80 %
close), category colours from the API, `display_currency` from
`/api/settings/`, two-decimal currency formatting. If the two clients disagree
about a number, both lose credibility.

## Layout

```
lib/core/      net · auth · cache · format   — must be usable from a bare isolate
lib/domain/    budget_pace.dart + models     — pure Dart, no dependencies
lib/data/      GET-only API + repositories
lib/features/  one directory per screen      — never used by the isolate
lib/bridge/    widget payload · sync · background entry point
android/app/src/main/kotlin/.../widget/      — Glance widget, native
```

The background sync that refreshes the widget runs in a **separate Dart
isolate** with no widget tree and no live Riverpod container. Everything from
stored tokens to written snapshot must be constructible cold. That is why no
business logic may live under `lib/features/`.

## Traps confirmed against the running API

- `POST /api/auth/token` is **form-urlencoded** — the only such endpoint. JSON returns 422.
- Error `detail` is a string on 4xx but a **list of objects** on 422. Parse both.
- Expenses are negative, income positive; `amount` is in `account_currency`.
- Use `effective_owner_id`, not `owner_id`.
- `bank_name` is nullable.
- Transactions carry both `transaction_date` and a `date` alias for the website; prefer `transaction_date`.
- `limit` on `/api/transactions/` caps at 1000; `total` is returned for paging.

## Tests

`test/fixtures/` holds real API responses, anonymised — see its README. Model
tests run against them, so a change in the backend's response shape turns a test
red instead of surfacing as a crash on the phone.

```bash
flutter analyze
flutter test
```
