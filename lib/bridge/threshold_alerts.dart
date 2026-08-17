/// Deciding when a budget deserves interrupting someone.
///
/// Pure logic, no plugins: the background isolate calls it, and it is the part
/// worth testing. Sending the notification is somewhere else.
library;

import 'widget_payload.dart';

/// A budget that has just crossed a line it had not crossed before.
class ThresholdCrossing {
  const ThresholdCrossing({
    required this.category,
    required this.level,
    required this.pctLabel,
  });

  final String category;

  /// `close` or `over`. Falling back to `healthy` is not an event.
  final String level;

  final String pctLabel;

  /// Identity of this alert, for remembering it was already sent.
  ///
  /// Scoped to the month so the same category can alert again in September
  /// after alerting in August, and to the level so passing 80 % and later
  /// 100 % are two separate, both useful, alerts.
  String keyFor(int year, int month) =>
      '$year-${month.toString().padLeft(2, '0')}:$category:$level';

  String get title => level == 'over'
      ? '$category is over budget'
      : '$category is close to its limit';

  String get body => level == 'over'
      ? '$pctLabel of the limit used.'
      : '$pctLabel used. Still under, but not by much.';
}

/// Severity ordering, so a crossing is only ever a move upwards.
int _rank(String level) => switch (level) {
      'over' => 2,
      'close' => 1,
      _ => 0,
    };

/// Finds the categories that got worse since the last sync.
///
/// Only upward moves count. A category dropping back below a threshold is good
/// news and not worth a notification, and treating it as an event would make
/// anything hovering near 80 % buzz twice a day.
///
/// [alreadySent] holds keys from [ThresholdCrossing.keyFor] that have fired
/// before; a category sitting at 105 % must not alert on every three-hourly
/// sync for the rest of the month.
List<ThresholdCrossing> detectCrossings({
  required WidgetPayload? previous,
  required WidgetPayload current,
  required Set<String> alreadySent,
}) {
  if (!current.hasData) return const [];

  final before = {
    for (final c in previous?.categories ?? const <WidgetCategory>[])
      c.name: c.level,
  };

  final crossings = <ThresholdCrossing>[];
  for (final c in current.categories) {
    if (_rank(c.level) == 0) continue;

    // Unknown before means either a new budget or a category that dropped off
    // the shortened list the widget carries. Treating it as healthy is the
    // honest reading: we have no evidence it was ever worse.
    final wasRank = _rank(before[c.name] ?? 'healthy');
    if (_rank(c.level) <= wasRank) continue;

    final crossing = ThresholdCrossing(
      category: c.name,
      level: c.level,
      pctLabel: c.pctLabel,
    );
    if (alreadySent.contains(crossing.keyFor(current.year, current.month))) {
      continue;
    }
    crossings.add(crossing);
  }
  return crossings;
}

/// Drops remembered alerts that belong to other months.
///
/// Without this the set grows for as long as the app is installed, and a
/// category that alerted last August would stay silenced this August.
Set<String> pruneToMonth(Set<String> sent, int year, int month) {
  final prefix = '$year-${month.toString().padLeft(2, '0')}:';
  return sent.where((k) => k.startsWith(prefix)).toSet();
}
