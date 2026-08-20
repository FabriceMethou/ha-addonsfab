import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/core/format/money.dart';

/// The table both implementations are pinned to.
///
/// The widget computes the age in Kotlin, because a string formatted at sync
/// time would freeze on "just now". Two implementations means two chances to
/// drift, so both are held to this same list — see `RelativeAgeTest.kt`.
const cases = <(Duration, String)>[
  (Duration(seconds: 0), 'just now'),
  (Duration(seconds: 59), 'just now'),
  (Duration(minutes: 1), '1 min ago'),
  (Duration(minutes: 59), '59 min ago'),
  (Duration(hours: 1), '1 hour ago'),
  (Duration(hours: 2), '2 hours ago'),
  (Duration(hours: 23), '23 hours ago'),
  (Duration(days: 1), '1 day ago'),
  (Duration(days: 29), '29 days ago'),
  (Duration(days: 30), 'over a month ago'),
  (Duration(days: 400), 'over a month ago'),
];

void main() {
  final now = DateTime(2026, 8, 20, 12);

  group('formatRelativeAge', () {
    for (final (elapsed, expected) in cases) {
      test('$elapsed reads as "$expected"', () {
        expect(formatRelativeAge(now.subtract(elapsed), now: now), expected);
      });
    }

    test('a timestamp in the future is not a negative age', () {
      // A snapshot written a moment ahead of this device's clock, or a clock
      // that moved backwards. Neither is worth "-3 minutes ago".
      expect(
        formatRelativeAge(now.add(const Duration(minutes: 5)), now: now),
        'just now',
      );
    });

    test('the boundaries fall on the right side', () {
      expect(formatRelativeAge(now.subtract(const Duration(minutes: 60)), now: now),
          '1 hour ago');
      expect(formatRelativeAge(now.subtract(const Duration(hours: 24)), now: now),
          '1 day ago');
    });
  });
}
