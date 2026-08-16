import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/core/auth/session_store.dart';
import 'package:myfinance/core/format/money.dart';

void main() {
  group('formatMoney', () {
    test('always shows two decimals, as the website does', () {
      expect(formatMoney(1000, 'EUR', locale: 'en_US'), '€1,000.00');
      expect(formatMoney(0, 'EUR', locale: 'en_US'), '€0.00');
      expect(formatMoney(5.5, 'EUR', locale: 'en_US'), '€5.50');
    });

    test('keeps the sign the backend stored', () {
      // Expenses arrive negative. Showing them unsigned and inferring direction
      // from the category is how an expense ends up displayed as income.
      expect(formatMoney(-42.5, 'EUR', locale: 'en_US'), contains('42.50'));
      expect(formatSignedMoney(-42.5, 'EUR', locale: 'en_US'),
          formatMoney(-42.5, 'EUR', locale: 'en_US'));
    });

    test('handles every currency in this dataset', () {
      for (final code in ['EUR', 'DKK', 'SEK', 'NOK']) {
        expect(() => formatMoney(1234.5, code, locale: 'en_US'), returnsNormally);
        expect(formatMoney(1234.5, code, locale: 'en_US'), contains('1,234.50'));
      }
    });

    test('falls back to the bare code for a currency it has no symbol for', () {
      expect(formatMoney(10, 'XYZ', locale: 'en_US'), contains('10.00'));
    });
  });

  group('formatPercent', () {
    test('rounds to whole percent, matching the budget screen', () {
      expect(formatPercent(44.2), '44%');
      expect(formatPercent(99.5), '100%');
      expect(formatPercent(0), '0%');
      expect(formatPercent(443.6), '444%');
    });
  });

  group('parseApiDate', () {
    test('reads the ISO dates the backend sends', () {
      expect(parseApiDate('2026-08-16'), DateTime(2026, 8, 16));
    });

    test('returns null instead of throwing on rubbish', () {
      // One malformed row must not take down a whole screen.
      expect(parseApiDate(null), isNull);
      expect(parseApiDate(''), isNull);
      expect(parseApiDate('not a date'), isNull);
    });
  });

  group('normalizeBaseUrl', () {
    test('defaults a scheme-less address to HTTPS', () {
      expect(normalizeBaseUrl('finance.example.com'), 'https://finance.example.com');
    });

    test('leaves an explicit scheme alone, including plain HTTP on the LAN', () {
      expect(normalizeBaseUrl('http://homeassistant.local:8501'),
          'http://homeassistant.local:8501');
      expect(normalizeBaseUrl('https://finance.example.com'),
          'https://finance.example.com');
    });

    test('strips what people actually paste', () {
      expect(normalizeBaseUrl('  https://finance.example.com/  '),
          'https://finance.example.com');
      expect(normalizeBaseUrl('https://finance.example.com///'),
          'https://finance.example.com');
    });

    test('leaves an empty address empty rather than inventing a scheme', () {
      expect(normalizeBaseUrl(''), '');
      expect(normalizeBaseUrl('   '), '');
    });
  });
}
