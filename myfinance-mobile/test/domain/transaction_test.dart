import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/models/category.dart';
import 'package:myfinance/domain/models/transaction.dart';

Map<String, dynamic> fixture(String name) => jsonDecode(
      File('test/fixtures/$name.json').readAsStringSync(),
    ) as Map<String, dynamic>;

void main() {
  group('TransactionPage', () {
    late TransactionPage page;

    setUp(() {
      page = TransactionPage.fromJson(fixture('transactions'));
    });

    test('parses the envelope', () {
      expect(page.transactions, isNotEmpty);
      expect(page.count, page.transactions.length);
      expect(page.total, greaterThanOrEqualTo(page.count));
    });

    test('total counts every match, not just this page', () {
      // This is what makes exact infinite scrolling possible: without it the
      // list could only guess whether more rows exist.
      expect(page.total, greaterThan(0));
      expect(page.hasMoreAfter(0), page.transactions.length < page.total);
      expect(page.hasMoreAfter(page.total), isFalse);
    });
  });

  group('Transaction', () {
    late List<Transaction> rows;

    setUp(() {
      rows = TransactionPage.fromJson(fixture('transactions')).transactions;
    });

    test('parses every field the list shows', () {
      for (final t in rows) {
        expect(t.id, isPositive);
        expect(t.transactionDate, isNotEmpty);
        expect(t.accountCurrency, isNotEmpty);
        expect(t.typeName, isNotEmpty);
        expect(t.category, isIn(['income', 'expense', 'transfer']));
      }
    });

    test('keeps the sign the backend stored', () {
      final expenses = rows.where((t) => t.category == 'expense');
      expect(expenses, isNotEmpty);
      expect(expenses.every((t) => t.amount < 0), isTrue,
          reason: 'expenses are stored negative');
    });

    test('amounts stay in their own currency', () {
      // Summing these would be wrong: several currencies are present, and both
      // legs of every transfer are in the list.
      expect(rows.map((t) => t.accountCurrency).toSet().length,
          greaterThanOrEqualTo(1));
      expect(rows.any((t) => t.isTransfer || t.category == 'transfer'), isTrue,
          reason: 'transfers appear in the list, unlike in the reports');
    });

    test('booleans survive arriving as integers', () {
      // SQLite has no boolean type: confirmed and is_transfer come back as 0
      // and 1, which a plain cast rejects.
      final t = Transaction.fromJson({
        'id': 1,
        'transaction_date': '2026-08-16',
        'confirmed': 0,
        'is_transfer': 1,
      });
      expect(t.confirmed, isFalse);
      expect(t.isTransfer, isTrue);
    });

    test('uses effective_owner_id, which is never null when an account has one',
        () {
      // owner_id alone is null whenever the transaction inherits its owner
      // from the account, which is most of the time.
      expect(rows.where((t) => t.effectiveOwnerId != null), isNotEmpty);
    });

    test('a malformed date yields null rather than throwing', () {
      final t = Transaction.fromJson(
        {'id': 1, 'transaction_date': 'not-a-date'},
      );
      expect(t.date, isNull);
      expect(t.transactionDate, 'not-a-date');
    });

    test('splits the comma-separated tag string', () {
      expect(
        Transaction.fromJson({'id': 1, 'tags': 'Travel, Gift'}).tagList,
        ['Travel', 'Gift'],
      );
      expect(Transaction.fromJson({'id': 1, 'tags': ''}).tagList, isEmpty);
      expect(Transaction.fromJson({'id': 1}).tagList, isEmpty);
    });

    test('sorts newest first', () {
      final shuffled = [...rows]..shuffle();
      shuffled.sort();
      expect(
        shuffled.first.transactionDate.compareTo(shuffled.last.transactionDate),
        greaterThanOrEqualTo(0),
      );
    });
  });

  group('TransactionFilter', () {
    test('an empty filter sends no parameters', () {
      const filter = TransactionFilter();
      expect(filter.isEmpty, isTrue);
      expect(filter.activeCount, 0);
      expect(filter.toQuery(), isEmpty,
          reason: 'null values must be dropped, not sent as "null"');
    });

    test('sends only what is set', () {
      const filter = TransactionFilter(typeId: 3, ownerId: 4);
      expect(filter.toQuery(), {'owner_id': 4, 'type_id': 3});
      expect(filter.activeCount, 2);
      expect(filter.isEmpty, isFalse);
    });

    test('counts a date range as one filter, not two', () {
      const filter =
          TransactionFilter(startDate: '2026-08-01', endDate: '2026-08-31');
      expect(filter.activeCount, 1);
      expect(filter.toQuery(),
          {'start_date': '2026-08-01', 'end_date': '2026-08-31'});
    });

    test('is a value type, so it works as a provider key', () {
      const a = TransactionFilter(typeId: 1);
      const b = TransactionFilter(typeId: 1);
      const c = TransactionFilter(typeId: 2);
      expect(a, b);
      expect(a, isNot(c));
    });

    test('copyWith clears a field when given null', () {
      const filter = TransactionFilter(typeId: 1, ownerId: 2);
      expect(filter.copyWith(typeId: null).typeId, isNull);
      expect(filter.copyWith(typeId: null).ownerId, 2);
    });
  });

  group('CategoryHierarchy', () {
    test('parses types with their subtypes', () {
      final categories =
          CategoryHierarchy.fromJson(fixture('categories_hierarchy')).categories;
      expect(categories, isNotEmpty);
      for (final c in categories) {
        expect(c.id, isPositive);
        expect(c.name, isNotEmpty);
        expect(c.category, isIn(['income', 'expense', 'transfer']));
      }
      expect(categories.any((c) => c.subtypes.isNotEmpty), isTrue);
    });

    test('exposes expense categories, which is what budgets are set on', () {
      final categories =
          CategoryHierarchy.fromJson(fixture('categories_hierarchy')).categories;
      expect(categories.where((c) => c.isExpense), isNotEmpty);
    });
  });
}
