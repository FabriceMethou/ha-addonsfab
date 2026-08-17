import 'dart:convert';

import '../core/format/money.dart';
import '../domain/budget_pace.dart';
import '../domain/models/budget.dart';

/// The contract between Flutter and the native home-screen widget.
///
/// Flutter and the widget share no memory — the widget is drawn by the system,
/// in another process, from a snapshot left in shared storage. This class is
/// that snapshot.
///
/// It deliberately carries **finished strings** alongside the few fractions the
/// widget needs for geometry. Formatting money correctly means locale and
/// currency rules; doing that again in Kotlin would be a second implementation
/// to keep in step, and the first time the two drifted the widget would
/// contradict the app it came from. Colours are the exception: only a level is
/// sent, so the widget can honour the system's light or dark theme.
class WidgetPayload {
  const WidgetPayload({
    required this.syncedAt,
    required this.stale,
    required this.hasData,
    required this.monthLabel,
    required this.daysLeftLabel,
    required this.spentFraction,
    required this.paceFraction,
    required this.spentPctLabel,
    required this.amountLabel,
    required this.ofLabel,
    required this.remainingLabel,
    required this.verdict,
    required this.verdictLabel,
    required this.categories,
    required this.year,
    required this.month,
  });

  /// Bumped whenever the shape below changes.
  ///
  /// Versioned from the first release because an app update cannot update the
  /// widgets already sitting on someone's home screen: the old Kotlin keeps
  /// reading whatever the new Dart wrote. On an unknown version the widget says
  /// so instead of drawing nonsense or crashing the launcher.
  static const int version = 1;

  /// Key the snapshot is stored under, shared with the Kotlin side.
  static const String storageKey = 'budget_payload';

  final DateTime syncedAt;

  /// The session lapsed, so these figures could not be refreshed.
  ///
  /// The numbers stay on display — someone glancing at a widget deserves the
  /// last known state, not a blank — but they are labelled as old.
  final bool stale;

  /// Whether any budget was measured at all. A ring at 0 % and a month with no
  /// budgets must not look the same.
  final bool hasData;

  final String monthLabel;
  final String daysLeftLabel;

  /// Share of the total limit used. Drives the ring sweep. Can exceed 1.
  final double spentFraction;

  /// Share of the month elapsed. Drives the pace tick.
  final double paceFraction;

  final String spentPctLabel;
  final String amountLabel;
  final String ofLabel;
  final String remainingLabel;

  /// `ahead`, `onPace` or `behind`.
  final String verdict;
  final String verdictLabel;

  final List<WidgetCategory> categories;

  /// Which month this describes, so tapping the widget opens the same one.
  final int year;
  final int month;

  Map<String, dynamic> toJson() => {
        'v': version,
        'syncedAt': syncedAt.toIso8601String(),
        'stale': stale,
        'hasData': hasData,
        'monthLabel': monthLabel,
        'daysLeftLabel': daysLeftLabel,
        'spentFraction': spentFraction,
        'paceFraction': paceFraction,
        'spentPctLabel': spentPctLabel,
        'amountLabel': amountLabel,
        'ofLabel': ofLabel,
        'remainingLabel': remainingLabel,
        'verdict': verdict,
        'verdictLabel': verdictLabel,
        'year': year,
        'month': month,
        'categories': [for (final c in categories) c.toJson()],
      };

  String encode() => jsonEncode(toJson());

  /// Reads a snapshot back, for tests and for the app's own "last synced" line.
  ///
  /// Returns null on an unrecognised version rather than guessing.
  static WidgetPayload? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return null;
    }
    if (decoded is! Map<String, dynamic>) return null;
    if (decoded['v'] != version) return null;

    return WidgetPayload(
      syncedAt: DateTime.tryParse(decoded['syncedAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      stale: decoded['stale'] as bool? ?? false,
      hasData: decoded['hasData'] as bool? ?? false,
      monthLabel: decoded['monthLabel'] as String? ?? '',
      daysLeftLabel: decoded['daysLeftLabel'] as String? ?? '',
      spentFraction: (decoded['spentFraction'] as num? ?? 0).toDouble(),
      paceFraction: (decoded['paceFraction'] as num? ?? 0).toDouble(),
      spentPctLabel: decoded['spentPctLabel'] as String? ?? '',
      amountLabel: decoded['amountLabel'] as String? ?? '',
      ofLabel: decoded['ofLabel'] as String? ?? '',
      remainingLabel: decoded['remainingLabel'] as String? ?? '',
      verdict: decoded['verdict'] as String? ?? 'onPace',
      verdictLabel: decoded['verdictLabel'] as String? ?? '',
      year: decoded['year'] as int? ?? 0,
      month: decoded['month'] as int? ?? 0,
      categories: [
        for (final c in (decoded['categories'] as List? ?? const []))
          if (c is Map<String, dynamic>) WidgetCategory.fromJson(c),
      ],
    );
  }

  /// Builds a snapshot from a month of budgets.
  ///
  /// [take] is how many category rows to carry. The largest widget shows five;
  /// sending a few more would only bloat a snapshot read on every redraw.
  factory WidgetPayload.from(
    BudgetVsActual data, {
    required DateTime now,
    bool stale = false,
    int take = 5,
    String? locale,
  }) {
    final overview = data.overview(now);
    final currency = data.displayCurrency;
    final daysLeft = daysLeftInMonth(now, data.year, data.month);

    return WidgetPayload(
      syncedAt: now,
      stale: stale,
      hasData: overview.hasData,
      year: data.year,
      month: data.month,
      monthLabel: formatMonth(data.year, data.month, locale: locale),
      daysLeftLabel: switch (daysLeft) {
        < 0 => 'Month ended',
        0 => 'Last day',
        1 => '1 day left',
        _ => '$daysLeft days left',
      },
      spentFraction: overview.spent,
      paceFraction: overview.pace,
      spentPctLabel: formatPercent(overview.spent * 100),
      amountLabel: formatMoney(overview.actual, currency, locale: locale),
      ofLabel: 'of ${formatMoney(overview.budget, currency, locale: locale)}',
      remainingLabel: overview.remaining >= 0
          ? '${formatMoney(overview.remaining, currency, locale: locale)} left'
          : '${formatMoney(overview.remaining.abs(), currency, locale: locale)} over',
      verdict: overview.verdict.name,
      verdictLabel: _verdictLabel(overview),
      categories: [
        for (final c in data.critical(take: take))
          WidgetCategory(
            name: c.typeName,
            pctLabel: formatPercent(c.percentage),
            fraction: c.percentage / 100,
            level: c.level.name,
          ),
      ],
    );
  }

  /// An empty snapshot, for a month with nothing budgeted.
  factory WidgetPayload.empty({required DateTime now, String? locale}) =>
      WidgetPayload(
        syncedAt: now,
        stale: false,
        hasData: false,
        year: now.year,
        month: now.month,
        monthLabel: formatMonth(now.year, now.month, locale: locale),
        daysLeftLabel: '',
        spentFraction: 0,
        paceFraction: 0,
        spentPctLabel: '',
        amountLabel: '',
        ofLabel: '',
        remainingLabel: '',
        verdict: 'onPace',
        verdictLabel: '',
        categories: const [],
      );

  /// The same snapshot, marked as no longer refreshable.
  WidgetPayload asStale() => WidgetPayload(
        syncedAt: syncedAt,
        stale: true,
        hasData: hasData,
        monthLabel: monthLabel,
        daysLeftLabel: daysLeftLabel,
        spentFraction: spentFraction,
        paceFraction: paceFraction,
        spentPctLabel: spentPctLabel,
        amountLabel: amountLabel,
        ofLabel: ofLabel,
        remainingLabel: remainingLabel,
        verdict: verdict,
        verdictLabel: verdictLabel,
        categories: categories,
        year: year,
        month: month,
      );

  static String _verdictLabel(BudgetOverview o) {
    final points = o.deltaPoints.abs().round();
    return switch (o.verdict) {
      PaceVerdict.ahead => '$points points ahead of pace',
      PaceVerdict.behind => '$points points under pace',
      PaceVerdict.onPace => 'On pace',
    };
  }
}

/// One category row on the widget.
class WidgetCategory {
  const WidgetCategory({
    required this.name,
    required this.pctLabel,
    required this.fraction,
    required this.level,
  });

  final String name;
  final String pctLabel;

  /// Share of the limit used. Can exceed 1; the bar clamps, the label does not.
  final double fraction;

  /// `healthy`, `close` or `over`. The widget maps this to a colour itself so
  /// the result follows the system theme.
  final String level;

  Map<String, dynamic> toJson() => {
        'name': name,
        'pctLabel': pctLabel,
        'fraction': fraction,
        'level': level,
      };

  factory WidgetCategory.fromJson(Map<String, dynamic> json) => WidgetCategory(
        name: json['name'] as String? ?? '',
        pctLabel: json['pctLabel'] as String? ?? '',
        fraction: (json['fraction'] as num? ?? 0).toDouble(),
        level: json['level'] as String? ?? 'healthy',
      );
}
