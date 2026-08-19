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
flutter test             # 158 tests, needs nothing running
cd android && ./gradlew :app:testDebugUnitTest
flutter build apk --debug
```

## What the widget has been checked against

Rendered on a Pixel emulator, Android 16, 1080×2400 at 420 dpi, on 19 Aug 2026.
All three sizes draw, the ring and the pace tick included, and the ↻ button
reaches the Dart callback. The empty state and the five-category month were
checked by writing a payload straight into the widget's preferences:

```bash
# The golden file is exactly the contract the widget reads.
adb push android/app/src/test/resources/budget_payload.json /data/local/tmp/p.json
adb shell chmod 644 /data/local/tmp/p.json
# then wrap it in a <string name="budget_payload"> in
# /data/data/com.methou.myfinance/shared_prefs/HomeWidgetPreferences.xml via run-as
```

`APPWIDGET_UPDATE` is a protected broadcast that adb cannot send, so the way to
force a redraw is `adb install -r` of the same APK: Glance's
`MyPackageReplacedReceiver` updates every placed widget.

Two faults surfaced this way that no unit test could have caught, both fixed:
the 4×4 layout overflowed Glance's ten-children limit and lost three of its five
categories in silence, and the ↻ button died permanently after its first failure
because home_widget appends to a work chain that had failed. See the comments in
`BudgetWidget.kt` and `BudgetWidgetReceiver.kt`.

Then rendered again on a physical Galaxy S25 Ultra, Android 16, against the live
server and in dark mode, which is where the release build showed three more
faults the emulator could not: the release APK had no `INTERNET` permission at
all, the router never re-ran its redirect so signing in left the setup screen on
display, and the Dart side named the widget provider without its package so
every publish threw. All three are fixed and the widget now follows the app.

Still unverified: iOS, whose widget does not exist yet. The widget picker also
shows the app icon rather than a preview of the widget, for want of a
`previewLayout`.

The lesson worth keeping: **test a release build on a real phone before
believing any of this works.** Three of the five faults found could not appear
in a debug build on an emulator, and CI cannot catch them either — it builds
release APKs but never installs or runs one.

## Where the history is

Here. This directory is a git subtree of `ha-addonsfab`, carrying the project's
own commits rather than a snapshot of them, so both machines pull and push the
same history instead of drifting apart the way the web app once did.

The standalone repository that used to hold this on the laptop was archived on
19 Aug 2026. Do not revive it: its history still contains the anonymisation
witnesses and the test account's password, purged from this one before anything
was pushed.
