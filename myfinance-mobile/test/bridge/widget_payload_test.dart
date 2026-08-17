import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/bridge/widget_payload.dart';
import 'package:myfinance/domain/models/budget.dart';

BudgetVsActual loadBudget(String name) => BudgetVsActual.fromJson(
      jsonDecode(File('test/fixtures/$name.json').readAsStringSync())
          as Map<String, dynamic>,
    );

void main() {
  final august = DateTime(2026, 8, 16);

  group('building a snapshot from real data', () {
    late WidgetPayload payload;

    setUp(() {
      payload = WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august);
    });

    test('carries the month it describes, so a tap opens the same one', () {
      expect(payload.year, 2026);
      expect(payload.month, 8);
      expect(payload.hasData, isTrue);
    });

    test('carries finished strings, not raw numbers to format again', () {
      // The widget must not format money: doing it a second time in Kotlin
      // would be a separate implementation, and the first time the two drifted
      // the home screen would contradict the app.
      expect(payload.amountLabel, contains('€'));
      expect(payload.ofLabel, startsWith('of '));
      expect(payload.remainingLabel, endsWith('left'));
      expect(payload.spentPctLabel, endsWith('%'));
    });

    test('carries the two fractions the widget needs for geometry', () {
      expect(payload.paceFraction, closeTo(16 / 31, 1e-9));
      expect(payload.spentFraction, closeTo(0.109, 0.002));
    });

    test('says how the month is going in words', () {
      expect(payload.verdict, 'behind');
      expect(payload.verdictLabel, contains('under pace'));
    });

    test('counts the days left', () {
      expect(payload.daysLeftLabel, '15 days left');
    });

    test('sends only the categories the widget can show', () {
      expect(payload.categories.length, lessThanOrEqualTo(5));
      for (final c in payload.categories) {
        expect(c.pctLabel, endsWith('%'));
        expect(c.level, isIn(['healthy', 'close', 'over']));
      }
    });

    test('orders categories worst first', () {
      final over = WidgetPayload.from(
        loadBudget('budgets_vs_actual_over'),
        now: DateTime(2026, 7, 20),
      );
      final fractions = over.categories.map((c) => c.fraction).toList();
      expect(fractions, orderedEquals([...fractions]..sort((a, b) => b.compareTo(a))));
      expect(over.categories.first.level, 'over');
    });

    test('a month that has ended says so rather than counting negative days', () {
      final ended = WidgetPayload.from(
        loadBudget('budgets_vs_actual_over'),
        now: DateTime(2026, 8, 16),
      );
      expect(ended.daysLeftLabel, 'Month ended');
      expect(ended.paceFraction, 1.0);
    });

    test('an overspent total reads as over, not as a negative remainder', () {
      final over = WidgetPayload.from(
        loadBudget('budgets_vs_actual_over'),
        now: DateTime(2026, 7, 31),
      );
      if (over.spentFraction > 1) {
        expect(over.remainingLabel, endsWith('over'));
      }
    });
  });

  group('the wire format', () {
    test('survives a round trip', () {
      final original =
          WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august);
      final restored = WidgetPayload.decode(original.encode());

      expect(restored, isNotNull);
      expect(restored!.amountLabel, original.amountLabel);
      expect(restored.spentFraction, closeTo(original.spentFraction, 1e-9));
      expect(restored.paceFraction, closeTo(original.paceFraction, 1e-9));
      expect(restored.categories.length, original.categories.length);
      expect(restored.categories.first.name, original.categories.first.name);
    });

    test('carries its version', () {
      final json =
          jsonDecode(WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august).encode())
              as Map<String, dynamic>;
      expect(json['v'], WidgetPayload.version);
    });

    test('refuses a version it does not know', () {
      // Updating the app cannot update a widget already on someone's home
      // screen, so old code will eventually be handed new JSON. It has to
      // decline rather than half-read it.
      final json = jsonDecode(
        WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august).encode(),
      ) as Map<String, dynamic>;
      json['v'] = WidgetPayload.version + 1;

      expect(WidgetPayload.decode(jsonEncode(json)), isNull);
    });

    test('refuses rubbish instead of throwing', () {
      expect(WidgetPayload.decode(null), isNull);
      expect(WidgetPayload.decode(''), isNull);
      expect(WidgetPayload.decode('not json'), isNull);
      expect(WidgetPayload.decode('[]'), isNull);
      expect(WidgetPayload.decode('{}'), isNull);
    });
  });

  group('the two ends of the bridge', () {
    test('writes the golden snapshot the Kotlin test reads back', () {
      // Flutter and the widget are separate processes that never share types,
      // only these bytes. Having Dart emit them and Kotlin parse the same file
      // is the only way a drift in the contract fails a test instead of
      // quietly blanking someone's home screen.
      final payload =
          WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august);
      final golden = File('android/app/src/test/resources/budget_payload.json');
      golden.parent.createSync(recursive: true);
      golden.writeAsStringSync(payload.encode());

      expect(golden.existsSync(), isTrue);
      expect(WidgetPayload.decode(golden.readAsStringSync()), isNotNull);
    });
  });

  group('degraded states', () {
    test('a stale snapshot keeps its figures and only flips the flag', () {
      final fresh =
          WidgetPayload.from(loadBudget('budgets_vs_actual'), now: august);
      final stale = fresh.asStale();

      expect(stale.stale, isTrue);
      expect(stale.amountLabel, fresh.amountLabel,
          reason: 'blanking the figures would be worse than showing old ones');
      expect(stale.categories.length, fresh.categories.length);
      expect(stale.syncedAt, fresh.syncedAt,
          reason: 'the sync time must not advance when nothing synced');
    });

    test('an empty month is distinguishable from a ring at zero', () {
      final empty = WidgetPayload.empty(now: august);
      expect(empty.hasData, isFalse);
      expect(empty.categories, isEmpty);
      expect(WidgetPayload.decode(empty.encode())!.hasData, isFalse);
    });
  });
}
