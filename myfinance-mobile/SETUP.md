# Working on this from a fresh clone

Three things are deliberately absent from this repository. Each is regenerated
locally in one command, and each is missing for a reason.

## 1. Generated Dart code

`*.freezed.dart` and `*.g.dart` are not committed: they are derived from
`lib/domain/models/*.dart` and would add noise to every model diff. Nothing
compiles without them.

```bash
flutter pub get
dart run build_runner build
```

## 2. Test fixtures

`test/fixtures/*.json` and `android/app/src/test/resources/` are captured from a
real database. They are anonymised — amounts scaled by one constant, names
replaced — but the account structure, the transaction dates and the ratios are
genuine, and **this repository is public**. They stay out of it for that reason.

The app builds and runs without them; only the tests that read them fail. To
recreate them, point the capture script at a backend serving a copy of a real
database:

```bash
MYFINANCE_API=http://127.0.0.1:8199 \
MYFINANCE_USER=… MYFINANCE_PASS=… FIXTURE_YEAR=2026 FIXTURE_MONTH=8 \
  python3 tool/capture_fixtures.py /tmp/raw

# The witness list is the anonymiser's own check that nothing slipped through.
# It is passed in rather than committed: writing real names into the detector
# would publish exactly what it exists to keep out.
ANONYMIZE_WITNESSES='a merchant,an owner name,your username' \
  python3 tool/anonymize_fixtures.py /tmp/raw test/fixtures

flutter test test/bridge/widget_payload_test.dart   # writes the Kotlin golden
```

Read the category and subcategory names afterwards: they pass through
anonymisation on purpose, because budgets reference them by name, and one has
already arrived naming family members.

## 3. Android SDK location

`android/local.properties` is machine-specific. Running any Flutter command
recreates it.

## Prerequisites

- Flutter 3.47.0 or later, and the Android SDK with **platform 37** installed:
  `flutter_secure_storage` requires it, so `compileSdk` is pinned to 37 in
  `android/app/build.gradle.kts`.
- JDK 17 or later. JDK 21 works.

## Checking it over

```bash
flutter analyze          # must be clean
flutter test             # 121 tests, needs nothing running
cd android && ./gradlew :app:testDebugUnitTest
flutter build apk --debug
```

## What has not been verified

The home-screen widget has never been rendered on a device. The laptop this was
written on cannot run an accelerated emulator — its user is not in the `kvm`
group — so the widget's layout, its three sizes and the ↻ button are untested
outside unit tests of the data crossing the bridge. Placing it on a real home
screen is the first thing worth doing here.

## Where the history is

This directory is a snapshot. The full commit history lives in a separate
repository on the laptop at `~/Documents/Development/myfinance-mobile`, which
still holds the fixtures. To avoid the two-divergent-copies situation that
already happened with the web app, treat **this** copy as the one being worked
on from now on.
