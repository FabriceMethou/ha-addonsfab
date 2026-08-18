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

**Offline reads come from the cache, and say so.** Every screen goes through
`withCache`: a successful fetch is stored, and a network failure falls back to
what was stored, marked stale and banner-ed with its age. Never present cached
figures as current — on a finance app that is the one unforgivable bug. A
failure with nothing cached throws, because an error page is honest where an
empty state would read as "you have no data".

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

## Build and test

**Generated code is not committed.** `*.freezed.dart` and `*.g.dart` are
gitignored, so a fresh clone does not compile until you run codegen. Do this
first, and again after touching anything in `lib/domain/models/`:

```bash
dart run build_runner build
```

```bash
flutter analyze     # must be clean; no warnings tolerated
flutter test        # hermetic, needs nothing running
flutter build apk --debug
```

`android/app/build.gradle.kts` pins `compileSdk = 37` rather than following
`flutter.compileSdkVersion`, because flutter_secure_storage requires it. AGP
warns that 36 is its highest recommended value; that warning is expected.

### Fixtures

`test/fixtures/` holds real API responses, anonymised — see its README. Model
tests run against them, so a change in the backend's response shape turns a test
red instead of surfacing as a crash on the phone.

### Live tests

`test/live/` drives the real HTTP stack against a running backend. It skips
itself unless pointed at one, so the ordinary suite stays hermetic. Run it after
touching anything in `lib/core/net/`, where a fixture cannot tell you whether
the wire format is still right:

```bash
MYFINANCE_LIVE=http://127.0.0.1:8199 \
MYFINANCE_USER=… MYFINANCE_PASS=… flutter test test/live
```

It caught two things fixtures could not: booleans arriving from SQLite as `0`
and `1` rather than `true`/`false`, and `ApiException` being buried inside
`DioException` so that every `catch` upstream missed it.
