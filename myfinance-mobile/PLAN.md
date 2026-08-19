# What comes next

Written 19 Aug 2026, after the first day this app ran on a real phone against
the real server. Five faults surfaced that day and all five are fixed; what
follows is the work that day made obvious, in the order worth doing it.

## Four decisions already taken

**The mobile client leads, the website follows.** CLAUDE.md asks the two clients
to stay consistent, and a modern restyle of the phone will leave the React site
behind for a while. The rule is therefore narrowed rather than broken: what must
agree between the two is **the numbers and what a colour means** — the ≥80 % and
≥100 % thresholds, the two-decimal amounts, the server's `percentage`. Corner
radii, translucency and typography are free to differ. That edit to CLAUDE.md is
part of phase 4, not a footnote to it.

**The widget takes Material You for its surfaces and keeps fixed severity
colours.** Backgrounds and text follow the wallpaper through `GlanceTheme`;
red, amber and green stay exactly what they are on the website. A colour that
means "over budget" cannot be allowed to drift with someone's wallpaper.

**Glass in the app goes on the chrome, never under a figure.** Blur on the top
bar, the tab bar and the modal sheets; opaque surfaces under every amount. This
is both a legibility decision and a performance one — a `BackdropFilter` above a
scrolling transaction list is expensive, and fixed chrome costs nothing to blur.

**All four widget content improvements are in scope**, listed as phases 1 to 3.

## Phase 1 — The widget stops lying about its age

The one item here that is a defect rather than an improvement, and the reason it
goes first.

`syncedAt` has been travelling in the payload since the beginning and is
rendered nowhere. Worse, `WidgetSync.refresh` only marks the widget when the
session has lapsed: on any network failure it returns without touching
anything, so the figures quietly grow old with nothing on screen to say so.
CLAUDE.md is unambiguous that this is the one unforgivable bug on a finance app,
and the app itself honours the rule with its "3 hours ago" banner. The widget
does not.

The work is to render the age in the header, in words rather than a timestamp,
matching the app's wording; and to mark the snapshot on *any* failed refresh,
not only on a 401. The two cases must stay distinguishable — "you are signed
out" and "the last fetch did not get through" call for different actions from
the person reading, and only the first is worth "Tap to sign in".

## Phase 2 — The widget becomes something you can act on

**Deep links per element.** The plumbing exists and is used for one thing only:
`widgetInteractionCallback` takes a `Uri` and looks at nothing but
`uri.host == 'refresh'`. Touching a category should open Budgets on that month,
the ring should open Overview. This needs a URI vocabulary settled first, and it
needs the app's router to accept an incoming link — the router was rewritten
today to refresh on session changes, so that is the moment to add link handling
rather than bolting it on later.

**Feedback on ↻.** Today the button does its work with no visible sign, for
several seconds, which is exactly what makes people press it repeatedly. A
"refreshing" flag written before the fetch and cleared after would let the
header show it. Note the cost: the flag means two extra widget redraws per
refresh, from a background isolate.

## Phase 3 — The finish

Days left belongs in the 4×2 and 4×4 layouts. It appears only in the 2×2 today,
which is backwards: the pace tick is meaningless without knowing how much month
is left, and the big layouts are the ones with room to say it.

`previewLayout` replaces the app icon in the widget picker, on API 31 and above,
with `previewImage` kept for older phones. And `maxResizeWidth` is set to 320 dp
for no reason anybody recorded — the launcher handed the widget 370 dp without
complaint.

**Count the children before adding any of this.** A Glance container holds ten,
silently dropping the rest, which is how the 4×4 lost three of its five
categories until today. Every layout change from here on has to be counted
against `MAX_CONTAINER_CHILDREN`.

## Phase 4 — The restyle

Last, deliberately. Behaviour settles first; a restyle over shifting layouts is
work done twice.

**The app.** Translucent top bar, tab bar and sheets; content running edge to
edge underneath them; wider corner radii and tonal surfaces throughout. Material
3 Expressive is Google's own 2025 answer to the direction Apple set, and taking
it gets a native result rather than an imitation. Amounts sit on opaque
surfaces — no exceptions, however good it looks in a screenshot.

**The widget.** `GlanceTheme` for surfaces, pill-shaped bars, larger radii, and
a slightly translucent background so the wallpaper shows through. Worth stating
plainly so nobody tries: **frosted glass is not possible in a widget.** A widget
is RemoteViews; it cannot see or blur what is behind it, and no amount of effort
changes that. Dynamic colour is what buys the feeling of belonging on the home
screen.

`glance-material3` is already declared in `android/app/build.gradle.kts` and
imported nowhere. This phase is what it was added for.

## Phase 5 — A second widget, proposed

Net worth. It answers a different question from the budget widget — "where do I
stand overall" rather than "am I overspending this month" — and the server
already computes it at `/reports/net_worth` and `/reports/net_worth_trend`, so
it needs no device-side arithmetic. One figure, a direction of travel, a small
trend line at 4×2.

Not yet agreed, and worth costing before it is: a second widget means another
provider, another payload with its own version, another sync path and another
golden file.

Two ideas considered and set aside. A configurable single-category widget is
useful but needs a configuration activity, which is a disproportionate amount of
new surface for what it gives. A recent-transactions list is the least
glanceable thing the app could put on a home screen and only duplicates a tab.

## Things that will bite, in every phase

**The payload is versioned and the check is strict.** `BudgetPayload.parse`
returns null on any version other than `SUPPORTED_VERSION`, and null draws the
placeholder. Adding a field means bumping the version on both sides. App and
widget ship in the same APK so they can never disagree for long, but a widget
already on a home screen will show "Open MyFinance" until it is next redrawn.

**The Kotlin golden is generated, not written.** `flutter test
test/bridge/widget_payload_test.dart` rewrites
`android/app/src/test/resources/budget_payload.json`. Any payload change means
regenerating it, and it is gitignored, so a fresh clone needs it built before
the Gradle unit tests pass.

**Test a release build on a real phone before believing any of it works.** Three
of the five faults found on 19 Aug could not appear in a debug build on an
emulator: the missing `INTERNET` permission, the router that never re-ran its
redirect, and the widget provider named without its package. CI cannot catch
them either — it builds release APKs and never installs one. Until that changes,
a phone on the desk is the only real gate.
