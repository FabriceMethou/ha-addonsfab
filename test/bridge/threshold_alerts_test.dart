import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/bridge/threshold_alerts.dart';
import 'package:myfinance/bridge/widget_payload.dart';

WidgetPayload payloadWith(
  List<(String name, String level)> categories, {
  bool hasData = true,
  int year = 2026,
  int month = 8,
}) =>
    WidgetPayload(
      syncedAt: DateTime(year, month, 16),
      stale: false,
      hasData: hasData,
      monthLabel: 'August 2026',
      daysLeftLabel: '15 days left',
      spentFraction: 0.5,
      paceFraction: 0.5,
      spentPctLabel: '50%',
      amountLabel: '€1.00',
      ofLabel: 'of €2.00',
      remainingLabel: '€1.00 left',
      verdict: 'onPace',
      verdictLabel: 'On pace',
      year: year,
      month: month,
      categories: [
        for (final (name, level) in categories)
          WidgetCategory(
            name: name,
            pctLabel: '90%',
            fraction: 0.9,
            level: level,
          ),
      ],
    );

void main() {
  group('detectCrossings', () {
    test('fires when a category gets worse', () {
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'healthy')]),
        current: payloadWith([('Food', 'close')]),
        alreadySent: {},
      );
      expect(crossings, hasLength(1));
      expect(crossings.single.category, 'Food');
      expect(crossings.single.level, 'close');
    });

    test('fires again when the same category goes from close to over', () {
      // Two separate, both useful alerts: nearly there, and past it.
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'close')]),
        current: payloadWith([('Food', 'over')]),
        alreadySent: {'2026-08:Food:close'},
      );
      expect(crossings.single.level, 'over');
    });

    test('stays quiet while a category simply remains over', () {
      // Otherwise anything past its limit would buzz on every sync for the
      // rest of the month.
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'over')]),
        current: payloadWith([('Food', 'over')]),
        alreadySent: {},
      );
      expect(crossings, isEmpty);
    });

    test('stays quiet when a category improves', () {
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'over')]),
        current: payloadWith([('Food', 'healthy')]),
        alreadySent: {},
      );
      expect(crossings, isEmpty);
    });

    test('does not repeat an alert already sent this month', () {
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'healthy')]),
        current: payloadWith([('Food', 'over')]),
        alreadySent: {'2026-08:Food:over'},
      );
      expect(crossings, isEmpty);
    });

    test('an alert sent last month does not silence this month', () {
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'healthy')]),
        current: payloadWith([('Food', 'over')]),
        alreadySent: {'2026-07:Food:over'},
      );
      expect(crossings, hasLength(1));
    });

    test('the first ever sync can still alert on something already over', () {
      final crossings = detectCrossings(
        previous: null,
        current: payloadWith([('Food', 'over')]),
        alreadySent: {},
      );
      expect(crossings, hasLength(1));
    });

    test('a month with no budgets is not an event', () {
      final crossings = detectCrossings(
        previous: null,
        current: payloadWith([], hasData: false),
        alreadySent: {},
      );
      expect(crossings, isEmpty);
    });

    test('reaching healthy is never an event', () {
      final crossings = detectCrossings(
        previous: null,
        current: payloadWith([('Food', 'healthy')]),
        alreadySent: {},
      );
      expect(crossings, isEmpty);
    });

    test('handles several categories turning at once', () {
      final crossings = detectCrossings(
        previous: payloadWith([('Food', 'healthy'), ('Transport', 'healthy')]),
        current: payloadWith([('Food', 'over'), ('Transport', 'close')]),
        alreadySent: {},
      );
      expect(crossings.map((c) => c.category), containsAll(['Food', 'Transport']));
    });
  });

  group('wording', () {
    test('says which line was crossed', () {
      const over = ThresholdCrossing(
          category: 'Housing', level: 'over', pctLabel: '163%');
      expect(over.title, 'Housing is over budget');
      expect(over.body, contains('163%'));

      const close = ThresholdCrossing(
          category: 'Housing', level: 'close', pctLabel: '90%');
      expect(close.title, contains('close to its limit'));
      expect(close.body, contains('90%'));
    });

    test('keys are scoped to month, category and level', () {
      const crossing =
          ThresholdCrossing(category: 'Food', level: 'over', pctLabel: '120%');
      expect(crossing.keyFor(2026, 8), '2026-08:Food:over');
      expect(crossing.keyFor(2026, 12), '2026-12:Food:over');
    });
  });

  group('pruneToMonth', () {
    test('keeps this month and drops the rest', () {
      final pruned = pruneToMonth(
        {'2026-08:Food:over', '2026-07:Food:over', '2025-08:Transport:close'},
        2026,
        8,
      );
      expect(pruned, {'2026-08:Food:over'});
    });

    test('stops the set growing for the life of the install', () {
      final many = {
        for (var m = 1; m <= 12; m++)
          '2026-${m.toString().padLeft(2, '0')}:Food:over',
      };
      expect(pruneToMonth(many, 2026, 8), hasLength(1));
    });
  });
}
