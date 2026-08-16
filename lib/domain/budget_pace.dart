/// Budget pacing: the one piece of business logic that lives on the device.
///
/// The app and the home-screen widget both call into here, so that a category
/// can never look healthy in one place and alarming in the other. Nothing in
/// this file imports anything — it is plain Dart so it can run inside the
/// background isolate that refreshes the widget, where there is no widget tree
/// and no provider container.
///
/// It never converts currencies and never sums raw transactions. Every value it
/// touches was already aggregated and converted by the server.
library;

/// The slice of a budget row the pace engine needs.
///
/// Declared as an interface so tests can supply a two-line fake and the widget
/// isolate can avoid building full models.
abstract class BudgetLine {
  int get typeId;

  /// `null` means the budget spans every owner.
  int? get ownerId;

  /// The limit, in the display currency.
  double get budget;

  /// Spending so far, in the display currency.
  double get actual;

  /// Share of the limit used, as sent by the server.
  ///
  /// Always prefer this over `actual / budget`: the server computes it before
  /// currency conversion, so recomputing it from the converted, rounded values
  /// drifts — enough to colour a category differently from the website.
  double get percentage;
}

/// Where spending sits relative to how much of the month has gone.
enum PaceVerdict {
  /// Spending faster than the month is passing. The one to worry about.
  ahead,
  onPace,

  /// Spending slower than the month is passing.
  behind,
}

/// Severity of a single budget, matching the website's thresholds exactly.
enum BudgetLevel { healthy, close, over }

/// How far spending must diverge from the month before it is worth mentioning.
const double kPaceTolerance = 0.10;

/// Percentage at which a budget turns amber on both clients.
const double kCloseThreshold = 80.0;

/// Percentage at which a budget turns red on both clients.
const double kOverThreshold = 100.0;

/// Number of days in [month] of [year].
///
/// Day zero of the following month is the last day of this one, which keeps
/// leap years and December correct without a table.
int daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;

/// Fraction of the target month that has elapsed, in `[0, 1]`.
///
/// Past months are fully elapsed and future months have not started, so the
/// pace marker stays meaningful when browsing away from today.
///
/// [now] must be a local date. Computing it in UTC shows the wrong day for the
/// first hours of the morning in eastern time zones — precisely when someone
/// glances at the widget.
double paceOfMonth(DateTime now, int year, int month) {
  final target = year * 12 + month;
  final current = now.year * 12 + now.month;
  if (target < current) return 1.0;
  if (target > current) return 0.0;
  return now.day / daysInMonth(year, month);
}

/// Severity of a single budget from its server-sent percentage.
BudgetLevel levelOf(double percentage) {
  if (percentage >= kOverThreshold) return BudgetLevel.over;
  if (percentage >= kCloseThreshold) return BudgetLevel.close;
  return BudgetLevel.healthy;
}

/// Verdict for a spent fraction against an elapsed fraction.
PaceVerdict verdictOf(double spent, double pace) {
  final delta = spent - pace;
  if (delta > kPaceTolerance) return PaceVerdict.ahead;
  if (delta < -kPaceTolerance) return PaceVerdict.behind;
  return PaceVerdict.onPace;
}

/// What spending would reach by month end if it carried on at this rate.
///
/// Null before any of the month has elapsed, when the rate is undefined.
double? projectedTotal(double actual, double pace) =>
    pace <= 0 ? null : actual / pace;

/// Drops budgets that would be counted twice.
///
/// A budget with a null owner spans everyone, so its spending already contains
/// what an owner-scoped budget on the same category counts separately. Summing
/// both inflates the total and can invent an overspend that never happened.
///
/// Both shapes occur in practice — this database held only owner-scoped budgets
/// in June 2026 and only all-owner budgets by August — so the guard cannot be
/// skipped on the strength of what today's data looks like.
List<T> withoutDoubleCounting<T extends BudgetLine>(List<T> lines) {
  final scopedTypes = <int>{
    for (final line in lines)
      if (line.ownerId != null) line.typeId,
  };
  return [
    for (final line in lines)
      if (line.ownerId != null || !scopedTypes.contains(line.typeId)) line,
  ];
}

/// Orders budgets worst-first, for the handful the widget has room to show.
List<T> mostCritical<T extends BudgetLine>(List<T> lines, {int take = 3}) {
  final sorted = [...lines]
    ..sort((a, b) => b.percentage.compareTo(a.percentage));
  return sorted.take(take).toList();
}

/// The headline figures behind the widget's ring.
class BudgetOverview {
  const BudgetOverview({
    required this.budget,
    required this.actual,
    required this.pace,
    required this.spent,
    required this.verdict,
    required this.countedLines,
    required this.droppedAsDuplicate,
    required this.droppedAsUnlimited,
  });

  /// Total limit across the budgets that counted.
  final double budget;

  /// Total spending across the budgets that counted.
  final double actual;

  /// Fraction of the month elapsed.
  final double pace;

  /// Fraction of the total limit used.
  final double spent;

  final PaceVerdict verdict;

  /// How many budgets contributed to [budget] and [actual].
  final int countedLines;

  /// Budgets removed because an owner-scoped budget covered the same category.
  final int droppedAsDuplicate;

  /// Budgets removed because their limit was zero, which is not a limit.
  final int droppedAsUnlimited;

  /// Whether anything was actually measured. A ring at 0 % and a ring with no
  /// budgets at all must not look the same on the home screen.
  bool get hasData => countedLines > 0;

  /// Limit still unspent. Negative once the total is overspent.
  double get remaining => budget - actual;

  /// Percentage points by which spending leads the month. Negative when behind.
  double get deltaPoints => (spent - pace) * 100;

  /// Spending at month end if the current rate holds.
  double? get projection => projectedTotal(actual, pace);
}

/// Rolls a month's budgets into the single figure the widget leads with.
///
/// Budgets with a zero limit are left out: they contribute spending without
/// contributing any limit, which would drag the ring towards a false overspend.
BudgetOverview overviewOf(
  List<BudgetLine> lines, {
  required DateTime now,
  required int year,
  required int month,
}) {
  final pace = paceOfMonth(now, year, month);
  final deduped = withoutDoubleCounting(lines);
  final counted = [
    for (final line in deduped)
      if (line.budget > 0) line,
  ];

  var budget = 0.0;
  var actual = 0.0;
  for (final line in counted) {
    budget += line.budget;
    actual += line.actual;
  }

  final spent = budget > 0 ? actual / budget : 0.0;

  return BudgetOverview(
    budget: budget,
    actual: actual,
    pace: pace,
    spent: spent,
    verdict: verdictOf(spent, pace),
    countedLines: counted.length,
    droppedAsDuplicate: lines.length - deduped.length,
    droppedAsUnlimited: deduped.length - counted.length,
  );
}
