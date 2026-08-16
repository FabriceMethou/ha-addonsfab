import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/budget_pace.dart';

/// Minimal stand-in so these tests never need a parsed model.
class _Line implements BudgetLine {
  const _Line({
    required this.typeId,
    this.ownerId,
    required this.budget,
    required this.actual,
    double? percentage,
  }) : percentage = percentage ?? (budget > 0 ? actual / budget * 100 : 0);

  @override
  final int typeId;
  @override
  final int? ownerId;
  @override
  final double budget;
  @override
  final double actual;
  @override
  final double percentage;
}

void main() {
  group('daysInMonth', () {
    test('handles the four month lengths', () {
      expect(daysInMonth(2026, 1), 31);
      expect(daysInMonth(2026, 4), 30);
      expect(daysInMonth(2026, 2), 28);
      expect(daysInMonth(2026, 12), 31);
    });

    test('handles leap years, including the century rule', () {
      expect(daysInMonth(2024, 2), 29);
      expect(daysInMonth(2000, 2), 29, reason: '2000 is divisible by 400');
      expect(daysInMonth(1900, 2), 28, reason: '1900 is not');
    });
  });

  group('paceOfMonth', () {
    test('first of the month is barely started, and never zero', () {
      final pace = paceOfMonth(DateTime(2026, 8, 1), 2026, 8);
      expect(pace, closeTo(1 / 31, 1e-9));
      expect(pace, greaterThan(0), reason: 'guards the projection divisor');
    });

    test('the last day of the month is fully elapsed', () {
      expect(paceOfMonth(DateTime(2026, 1, 31), 2026, 1), 1.0);
      expect(paceOfMonth(DateTime(2026, 4, 30), 2026, 4), 1.0);
      expect(paceOfMonth(DateTime(2026, 2, 28), 2026, 2), 1.0);
      expect(paceOfMonth(DateTime(2024, 2, 29), 2024, 2), 1.0);
    });

    test('a past month is over regardless of the day', () {
      expect(paceOfMonth(DateTime(2026, 8, 16), 2026, 7), 1.0);
      expect(paceOfMonth(DateTime(2026, 1, 3), 2025, 12), 1.0);
    });

    test('a future month has not started', () {
      expect(paceOfMonth(DateTime(2026, 8, 16), 2026, 9), 0.0);
      expect(paceOfMonth(DateTime(2026, 12, 31), 2027, 1), 0.0);
    });

    test('mid-month matches the real August 2026 case', () {
      expect(paceOfMonth(DateTime(2026, 8, 16), 2026, 8), closeTo(16 / 31, 1e-9));
    });

    test('reads the local calendar day, not the UTC one', () {
      // 00:30 on the 16th locally is still the 15th in UTC. Using UTC here
      // would understate the pace every morning in an eastern time zone.
      final local = DateTime(2026, 8, 16, 0, 30);
      expect(local.toUtc().day, isNot(local.day),
          reason: 'the test is only meaningful where the two differ');
      expect(paceOfMonth(local, 2026, 8), closeTo(16 / 31, 1e-9));
    });
  });

  group('levelOf', () {
    test('matches the website thresholds at their exact boundaries', () {
      expect(levelOf(0), BudgetLevel.healthy);
      expect(levelOf(79.9), BudgetLevel.healthy);
      expect(levelOf(80), BudgetLevel.close, reason: 'inclusive lower bound');
      expect(levelOf(99.9), BudgetLevel.close);
      expect(levelOf(100), BudgetLevel.over, reason: 'inclusive lower bound');
      expect(levelOf(443.6), BudgetLevel.over);
    });
  });

  group('verdictOf', () {
    test('needs to clear the tolerance before it says anything', () {
      expect(verdictOf(0.55, 0.50), PaceVerdict.onPace);
      expect(verdictOf(0.60, 0.50), PaceVerdict.onPace, reason: 'exactly at tolerance');
      expect(verdictOf(0.61, 0.50), PaceVerdict.ahead);
      expect(verdictOf(0.40, 0.50), PaceVerdict.onPace);
      expect(verdictOf(0.39, 0.50), PaceVerdict.behind);
    });

    test('spending nothing is behind pace, not on it', () {
      expect(verdictOf(0.0, 0.52), PaceVerdict.behind);
    });
  });

  group('projectedTotal', () {
    test('extrapolates the current rate to month end', () {
      expect(projectedTotal(500, 0.5), closeTo(1000, 1e-9));
    });

    test('is undefined before any of the month has passed', () {
      expect(projectedTotal(500, 0), isNull);
      expect(projectedTotal(0, 0), isNull);
    });
  });

  group('withoutDoubleCounting', () {
    test('keeps every budget when all are owner-scoped (June 2026 shape)', () {
      final lines = [
        const _Line(typeId: 1, ownerId: 4, budget: 500, actual: 780),
        const _Line(typeId: 1, ownerId: 5, budget: 500, actual: 65),
        const _Line(typeId: 2, ownerId: 4, budget: 1500, actual: 1458),
      ];
      expect(withoutDoubleCounting(lines), hasLength(3));
    });

    test('keeps every budget when all span all owners (August 2026 shape)', () {
      final lines = [
        const _Line(typeId: 1, budget: 1000, actual: 139),
        const _Line(typeId: 2, budget: 2500, actual: 0),
      ];
      expect(withoutDoubleCounting(lines), hasLength(2));
    });

    test('drops the all-owner budget when a scoped one covers the category', () {
      final lines = [
        const _Line(typeId: 1, budget: 1000, actual: 845),
        const _Line(typeId: 1, ownerId: 4, budget: 500, actual: 780),
        const _Line(typeId: 1, ownerId: 5, budget: 500, actual: 65),
        const _Line(typeId: 2, budget: 2500, actual: 100),
      ];
      final kept = withoutDoubleCounting(lines);
      expect(kept, hasLength(3));
      expect(kept.where((l) => l.typeId == 1).every((l) => l.ownerId != null), isTrue);
      expect(kept.any((l) => l.typeId == 2 && l.ownerId == null), isTrue,
          reason: 'an unscoped budget with no scoped rival must survive');
    });
  });

  group('mostCritical', () {
    test('puts the worst offenders first', () {
      final lines = [
        const _Line(typeId: 1, budget: 100, actual: 15),
        const _Line(typeId: 2, budget: 100, actual: 163),
        const _Line(typeId: 3, budget: 100, actual: 90),
        const _Line(typeId: 4, budget: 100, actual: 154),
      ];
      final top = mostCritical(lines, take: 3);
      expect(top.map((l) => l.typeId), [2, 4, 3]);
    });

    test('asking for more than there is returns what there is', () {
      expect(mostCritical([const _Line(typeId: 1, budget: 10, actual: 1)], take: 5),
          hasLength(1));
    });
  });

  group('overviewOf', () {
    final now = DateTime(2026, 8, 16);

    test('reproduces the real August 2026 figures', () {
      final lines = [
        const _Line(typeId: 1, budget: 910, actual: 402.00),
        const _Line(typeId: 2, budget: 1000, actual: 139.28),
        const _Line(typeId: 3, budget: 600, actual: 43.92),
        const _Line(typeId: 4, budget: 420, actual: 6.48),
        const _Line(typeId: 5, budget: 2500, actual: 0.0),
      ];
      final o = overviewOf(lines, now: now, year: 2026, month: 8);

      expect(o.budget, closeTo(5430, 0.01));
      expect(o.actual, closeTo(591.68, 0.01));
      expect(o.spent, closeTo(0.109, 0.001));
      expect(o.pace, closeTo(16 / 31, 1e-9));
      expect(o.verdict, PaceVerdict.behind);
      expect(o.remaining, closeTo(4838.32, 0.01));
      expect(o.deltaPoints, closeTo(-40.7, 0.5));
      expect(o.projection, closeTo(1146.38, 0.5));
      expect(o.hasData, isTrue);
    });

    test('an empty month is empty, not a ring at zero', () {
      final o = overviewOf([], now: now, year: 2026, month: 8);
      expect(o.hasData, isFalse);
      expect(o.countedLines, 0);
      expect(o.spent, 0);
      expect(o.budget, 0);
    });

    test('a zero limit is not a limit, and never divides', () {
      final lines = [
        const _Line(typeId: 1, budget: 0, actual: 250),
        const _Line(typeId: 2, budget: 400, actual: 100),
      ];
      final o = overviewOf(lines, now: now, year: 2026, month: 8);

      expect(o.droppedAsUnlimited, 1);
      expect(o.budget, 400);
      expect(o.actual, 100, reason: 'the unlimited line must not inflate spending');
      expect(o.spent, closeTo(0.25, 1e-9));
      expect(o.spent.isFinite, isTrue);
    });

    test('every limit at zero leaves nothing to measure', () {
      final o = overviewOf(
        [const _Line(typeId: 1, budget: 0, actual: 80)],
        now: now,
        year: 2026,
        month: 8,
      );
      expect(o.hasData, isFalse);
      expect(o.spent, 0);
      expect(o.spent.isNaN, isFalse);
    });

    test('a heavy overspend is reported in full, not clamped', () {
      final o = overviewOf(
        [const _Line(typeId: 1, budget: 100, actual: 340)],
        now: now,
        year: 2026,
        month: 8,
      );
      expect(o.spent, closeTo(3.4, 1e-9));
      expect(o.verdict, PaceVerdict.ahead);
      expect(o.remaining, closeTo(-240, 1e-9));
    });

    test('the scope guard is applied before summing', () {
      final lines = [
        const _Line(typeId: 1, budget: 1000, actual: 845),
        const _Line(typeId: 1, ownerId: 4, budget: 500, actual: 780),
        const _Line(typeId: 1, ownerId: 5, budget: 500, actual: 65),
      ];
      final o = overviewOf(lines, now: now, year: 2026, month: 8);

      expect(o.droppedAsDuplicate, 1);
      expect(o.actual, closeTo(845, 0.01),
          reason: 'the two scoped budgets sum to the all-owner figure');
      expect(o.budget, closeTo(1000, 0.01));
    });

    test('a past month is measured against a fully elapsed pace', () {
      final o = overviewOf(
        [const _Line(typeId: 1, budget: 1000, actual: 500)],
        now: now,
        year: 2026,
        month: 7,
      );
      expect(o.pace, 1.0);
      expect(o.verdict, PaceVerdict.behind);
      expect(o.projection, closeTo(500, 1e-9));
    });
  });
}
