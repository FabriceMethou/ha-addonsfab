import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/models/reports.dart';

Map<String, dynamic> fixture(String name) => jsonDecode(
      File('test/fixtures/$name.json').readAsStringSync(),
    ) as Map<String, dynamic>;

void main() {
  group('NetWorthTrend', () {
    late NetWorthTrend trend;

    setUp(() {
      trend = NetWorthTrend.fromJson(fixture('reports_net_worth_trend'));
    });

    test('parses the curve', () {
      expect(trend.trend, isNotEmpty);
      expect(trend.currency, 'EUR');
      for (final p in trend.trend) {
        expect(p.date, isNotEmpty);
        expect(p.month, isNotEmpty);
        expect(p.parsedDate, isNotNull);
      }
    });

    test('each point reconciles assets against debts', () {
      for (final p in trend.trend) {
        // A cent of tolerance, because of how these fixtures are made rather
        // than anything the backend does: the anonymiser scales every amount
        // by a constant and rounds each to two places independently, so a
        // derived figure can land a cent away from the difference of its own
        // parts. Real responses reconcile exactly.
        expect(p.netWorth, closeTo(p.assets - p.debts, 0.02));
      }
    });

    test('knows its bounds, for scaling the chart', () {
      expect(trend.minimum, lessThanOrEqualTo(trend.maximum));
      expect(
        trend.trend.every(
          (p) => p.netWorth >= trend.minimum && p.netWorth <= trend.maximum,
        ),
        isTrue,
      );
    });

    test('reports the change across the range', () {
      expect(trend.hasData, isTrue);
      expect(
        trend.change,
        closeTo(trend.trend.last.netWorth - trend.trend.first.netWorth, 0.01),
      );
    });

    test('a single point is not a trend', () {
      // Drawing a line through one point would imply a direction the data
      // cannot support, so the screen shows a message instead.
      final single = NetWorthTrend.fromJson({
        'trend': [
          {'date': '2026-08-01', 'month': 'August 2026', 'net_worth': 100.0}
        ],
        'currency': 'EUR',
      });
      expect(single.hasData, isFalse);
      expect(single.change, isNull);
    });

    test('an empty trend does not blow up on bounds', () {
      const empty = NetWorthTrend();
      expect(empty.hasData, isFalse);
      expect(empty.change, isNull);
    });
  });

  group('IncomeVsExpenses', () {
    late IncomeVsExpenses flow;

    setUp(() {
      flow = IncomeVsExpenses.fromJson(fixture('reports_income_expenses'));
    });

    test('parses both sides and the difference', () {
      expect(flow.currency, 'EUR');
      expect(flow.expenses, greaterThan(0),
          reason: 'the server sends expenses positive');
      expect(flow.net, closeTo(flow.income - flow.expenses, 0.01));
    });

    test('knows whether the period was in the black', () {
      expect(flow.isPositive, flow.net >= 0);
    });
  });

  group('SpendingByCategory', () {
    late SpendingByCategory spending;

    setUp(() {
      spending = SpendingByCategory.fromJson(fixture('reports_by_category'));
    });

    test('reads the amounts under the "total" key this endpoint uses', () {
      expect(spending.categories, isNotEmpty);
      expect(spending.categories.first.amount, greaterThan(0));
    });

    test('ranks largest first, leaving the source order alone', () {
      final original = [...spending.categories];
      final ranked = spending.ranked;

      final amounts = ranked.map((c) => c.amount).toList();
      expect(amounts, orderedEquals([...amounts]..sort((a, b) => b.compareTo(a))));
      expect(spending.categories, orderedEquals(original),
          reason: 'sorting a getter must not reorder the model it reads');
    });

    test('shares add up to the whole', () {
      final sum =
          spending.categories.fold<double>(0, (s, c) => s + spending.shareOf(c));
      expect(sum, closeTo(1.0, 0.02));
    });

    test('a zero total yields a zero share rather than infinity', () {
      const empty = SpendingByCategory(total: 0);
      expect(empty.shareOf(const CategorySpend(amount: 10)), 0);
    });
  });
}
