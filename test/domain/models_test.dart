import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/budget_pace.dart';
import 'package:myfinance/domain/models/auth.dart';
import 'package:myfinance/domain/models/budget.dart';
import 'package:myfinance/domain/models/settings.dart';

Map<String, dynamic> fixture(String name) => jsonDecode(
      File('test/fixtures/$name.json').readAsStringSync(),
    ) as Map<String, dynamic>;

void main() {
  group('BudgetVsActual against the captured response', () {
    late BudgetVsActual august;
    late BudgetVsActual july;

    setUp(() {
      august = BudgetVsActual.fromJson(fixture('budgets_vs_actual'));
      july = BudgetVsActual.fromJson(fixture('budgets_vs_actual_over'));
    });

    test('parses the envelope', () {
      expect(august.year, 2026);
      expect(august.month, 8);
      expect(august.displayCurrency, 'EUR');
      expect(august.categories, hasLength(5));
    });

    test('parses every field the widget depends on', () {
      final c = august.categories.first;
      expect(c.budgetId, isPositive);
      expect(c.typeId, isPositive);
      expect(c.typeName, isNotEmpty);
      expect(c.budget, greaterThan(0));
      expect(c.percentage, greaterThanOrEqualTo(0));
      expect(c.budgetCurrency, isNotEmpty);
      expect(c.status, isNotEmpty);
    });

    test('a null owner survives as null rather than becoming zero', () {
      // Every active budget in this snapshot spans all owners. Coercing that to
      // 0 would make the scope guard treat them as owner-scoped.
      expect(august.categories.every((c) => c.ownerId == null), isTrue);
      expect(august.categories.every((c) => c.isAllOwners), isTrue);
    });

    test('the busy month carries all three severity levels', () {
      final levels = july.categories.map((c) => c.level).toSet();
      expect(levels, containsAll([
        BudgetLevel.over,
        BudgetLevel.close,
        BudgetLevel.healthy,
      ]));
      expect(july.categories.where((c) => c.level == BudgetLevel.over), hasLength(3));
    });

    test('severity follows the percentage the server sent', () {
      for (final c in july.categories) {
        expect(c.level, levelOf(c.percentage));
      }
    });

    test('the overview matches the figures measured against the backend', () {
      final o = august.overview(DateTime(2026, 8, 16));
      expect(o.hasData, isTrue);
      expect(o.countedLines, 5);
      expect(o.droppedAsDuplicate, 0);
      expect(o.pace, closeTo(16 / 31, 1e-9));
      expect(o.verdict, PaceVerdict.behind);
      expect(o.spent, lessThan(o.pace));
    });

    test('critical rows come back worst first', () {
      final top = july.critical(take: 3);
      expect(top, hasLength(3));
      expect(top.first.percentage, greaterThan(top.last.percentage));
      expect(top.every((c) => c.level == BudgetLevel.over), isTrue);
    });

    test('the currency a row was budgeted in is reported against the display one', () {
      for (final c in august.categories) {
        expect(august.isConverted(c), c.budgetCurrency != 'EUR');
      }
    });
  });

  group('settings and health', () {
    test('reads the display currency the whole app formats with', () {
      final s = SettingsResponse.fromJson(fixture('settings')).settings;
      expect(s.displayCurrency, 'EUR');
    });

    test('reads the health probe', () {
      final h = HealthStatus.fromJson(fixture('health'));
      expect(h.isHealthy, isTrue);
      expect(h.database, 'connected');
    });

    test('/me identifies the account', () {
      final u = AuthUser.fromJson(fixture('auth_me'));
      expect(u.username, isNotEmpty);
    });
  });

  group('tolerance to backend drift', () {
    test('an unknown field is ignored rather than fatal', () {
      final json = Map<String, dynamic>.from(fixture('budgets_vs_actual'));
      json['some_field_added_later'] = {'nested': true};
      (json['categories'] as List).first['brand_new_column'] = 42;

      expect(() => BudgetVsActual.fromJson(json), returnsNormally);
      expect(BudgetVsActual.fromJson(json).categories, hasLength(5));
    });

    test('a missing optional field falls back to a default', () {
      final row = Map<String, dynamic>.from(
        (fixture('budgets_vs_actual')['categories'] as List).first as Map,
      )
        ..remove('icon')
        ..remove('color')
        ..remove('owner_name')
        ..remove('status');

      final c = BudgetCategory.fromJson(row);
      expect(c.icon, '');
      expect(c.color, '');
      expect(c.ownerName, isNull);
      expect(c.status, 'under');
    });

    test('an integer where a decimal was expected still parses', () {
      // SQLite hands back a bare int whenever an amount lands on a whole
      // number, so the wire type of any money field is not stable.
      final row = Map<String, dynamic>.from(
        (fixture('budgets_vs_actual')['categories'] as List).first as Map,
      )
        ..['budget'] = 1000
        ..['actual'] = 0
        ..['percentage'] = 0;

      final c = BudgetCategory.fromJson(row);
      expect(c.budget, 1000.0);
      expect(c.actual, 0.0);
    });
  });

  group('AuthTokens', () {
    test('a complete sign-in is not awaiting a second factor', () {
      final t = AuthTokens.fromJson({
        'access_token': 'a',
        'refresh_token': 'r',
        'token_type': 'bearer',
        'user': {'username': 'demo', 'is_admin': true},
      });
      expect(t.awaitingMfa, isFalse);
      expect(t.user?.isAdmin, isTrue);
    });

    test('a response with no refresh token is a half-finished sign-in', () {
      // What the backend returns when the account has a second factor: a
      // five-minute token good for one call, and no refresh token.
      final t = AuthTokens.fromJson({
        'access_token': 'pending',
        'token_type': 'bearer',
        'user': {'username': 'demo', 'mfa_required': true},
      });
      expect(t.refreshToken, isNull);
      expect(t.awaitingMfa, isTrue);
    });
  });
}
