import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/models/account.dart';
import 'package:myfinance/domain/models/reports.dart';

Map<String, dynamic> fixture(String name) => jsonDecode(
      File('test/fixtures/$name.json').readAsStringSync(),
    ) as Map<String, dynamic>;

void main() {
  group('Account', () {
    late List<Account> accounts;

    setUp(() {
      accounts = AccountList.fromJson(fixture('accounts')).accounts;
    });

    test('parses every account', () {
      expect(accounts, hasLength(18));
      for (final a in accounts) {
        expect(a.id, isPositive);
        expect(a.currency, isNotEmpty);
        expect(a.accountType, isNotEmpty);
      }
    });

    test('keeps each balance in its own currency', () {
      // These must never be summed: four currencies are in play here, and the
      // converted totals live on the balances endpoint instead.
      final currencies = accounts.map((a) => a.currency).toSet();
      expect(currencies.length, greaterThan(1),
          reason: 'this dataset is deliberately multi-currency');
      expect(currencies, containsAll(['EUR', 'DKK']));
    });

    test('covers all four account types', () {
      expect(
        accounts.map((a) => a.accountType).toSet(),
        containsAll(['cash', 'checking', 'savings', 'investment']),
      );
    });

    test('a missing bank stays null rather than becoming an empty name', () {
      // bank_id is nullable and the join that fills the name is a LEFT JOIN,
      // so the UI has to have something to say when there is no bank.
      final json = Map<String, dynamic>.from(
        (fixture('accounts')['accounts'] as List).first as Map,
      )
        ..['bank_id'] = null
        ..['bank_name'] = null;

      final account = Account.fromJson(json);
      expect(account.bankName, isNull);
      expect(account.bankId, isNull);
    });

    test('investment accounts point at the cash account they settle to', () {
      final investments = accounts.where((a) => a.isInvestment);
      expect(investments, isNotEmpty);
    });
  });

  group('BalancesSummary', () {
    late BalancesSummary summary;

    setUp(() {
      summary = BalancesSummary.fromJson(fixture('accounts_balances'));
    });

    test('parses owners and the currency they are converted to', () {
      expect(summary.currency, 'EUR');
      expect(summary.summary, hasLength(3));
    });

    test('hides owners who hold nothing', () {
      // One owner in this dataset has no accounts at all. Showing them would
      // be a row that never says anything.
      expect(summary.summary.any((o) => !o.hasAccounts), isTrue);
      expect(summary.owners.length, lessThan(summary.summary.length));
      expect(summary.owners.every((o) => o.accountCount > 0), isTrue);
    });

    test('the household total adds up the converted figures', () {
      // Safe here precisely because the server converted each owner's total
      // into one currency first.
      final expected =
          summary.summary.fold<double>(0, (s, o) => s + o.totalBalance);
      expect(summary.total, closeTo(expected, 0.01));
      expect(summary.total, greaterThan(0));
    });
  });

  group('NetWorth', () {
    test('parses assets, debts and the difference', () {
      final worth = NetWorth.fromJson(fixture('reports_net_worth'));
      expect(worth.currency, 'EUR');
      expect(worth.accountCount, 18);
      expect(worth.debtCount, 2);
      expect(worth.hasDebts, isTrue);
      expect(
        worth.netWorth,
        closeTo(worth.totalAssets - worth.totalDebts, 0.01),
      );
    });

    test('recognises a negative net worth', () {
      final worth = NetWorth.fromJson(fixture('reports_net_worth'));
      expect(worth.isNegative, worth.netWorth < 0);
    });

    test('a null owner means everyone, not owner zero', () {
      final worth = NetWorth.fromJson(fixture('reports_net_worth'));
      expect(worth.ownerId, isNull);
    });
  });

  group('MonthlySummary', () {
    late MonthlySummary month;

    setUp(() {
      month = MonthlySummary.fromJson(fixture('reports_monthly_summary'));
    });

    test('parses the period and its totals', () {
      expect(month.year, 2026);
      expect(month.month, 8);
      expect(month.currency, 'EUR');
      expect(month.transactionCount, greaterThan(0));
    });

    test('expenses arrive positive even though they are stored negative', () {
      // The server takes the absolute value before converting, so a client
      // negating again would flip the sign of every figure on the dashboard.
      expect(month.expenses, greaterThan(0));
      expect(month.income, greaterThanOrEqualTo(0));
      expect(month.net, closeTo(month.income - month.expenses, 0.01));
    });

    test('knows whether the month is in the black', () {
      expect(month.isPositive, month.net >= 0);
    });

    test('ignores budget_vs_actual, whose type is not stable', () {
      // The backend returns an object for a year/month request but an empty
      // list for a date-range one. Parsing it would break on one of the two.
      expect(
        () => MonthlySummary.fromJson({
          ...fixture('reports_monthly_summary'),
          'budget_vs_actual': [],
        }),
        returnsNormally,
      );
    });
  });

  group('CategorySpend reads either amount key', () {
    test('takes "amount" from monthly-summary', () {
      final month =
          MonthlySummary.fromJson(fixture('reports_monthly_summary'));
      expect(month.spendingByCategory, isNotEmpty);
      expect(month.spendingByCategory.first.amount, greaterThan(0));
      expect(month.spendingByCategory.first.category, isNotEmpty);
    });

    test('takes "total" from spending-by-category', () {
      // Same structure from the same backend helper, different key. One model
      // covers both only because it accepts either.
      final raw = fixture('reports_by_category')['categories'] as List;
      final first = CategorySpend.fromJson(raw.first as Map<String, dynamic>);
      expect(first.amount, greaterThan(0));
      expect(first.category, isNotEmpty);
    });

    test('carries subcategories', () {
      final month =
          MonthlySummary.fromJson(fixture('reports_monthly_summary'));
      final withSubs = month.spendingByCategory
          .where((c) => c.subcategories.isNotEmpty);
      expect(withSubs, isNotEmpty);
      expect(withSubs.first.subcategories.first.amount, greaterThan(0));
    });
  });
}
