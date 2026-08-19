/// Money and date formatting, kept deliberately in step with the website.
///
/// The website formats with `Intl.NumberFormat(locale, {style: 'currency',
/// currency, minimumFractionDigits: 2, maximumFractionDigits: 2})`. Dart's
/// `intl` draws on the same ICU data, so matching those options here produces
/// the same string for the same amount — which is the point. A figure that
/// reads differently on the phone and in the browser makes people doubt both.
library;

import 'package:intl/intl.dart';

/// Formats [amount] in [currencyCode], always with two decimals.
///
/// [locale] should come from the device. Passing null uses the ambient default.
String formatMoney(num amount, String currencyCode, {String? locale}) {
  final format = NumberFormat.currency(
    locale: locale,
    name: currencyCode,
    symbol: _symbolFor(currencyCode, locale),
    decimalDigits: 2,
  );
  return format.format(amount);
}

/// Formats [amount] without any currency marker, for columns that carry their
/// unit in the header.
String formatAmount(num amount, {String? locale}) =>
    NumberFormat.decimalPatternDigits(locale: locale, decimalDigits: 2)
        .format(amount);

/// Formats a share of a budget the way both clients show it: whole percent.
String formatPercent(num percentage) => '${percentage.round()}%';

/// Signed amount, with the sign kept as the backend stored it.
///
/// Expenses arrive negative and income positive. Normalising to absolute values
/// and inferring direction from the category is how a client ends up showing an
/// expense as income the day a category is renamed.
String formatSignedMoney(num amount, String currencyCode, {String? locale}) =>
    formatMoney(amount, currencyCode, locale: locale);

/// The symbol ICU would use, falling back to the code itself.
///
/// `NumberFormat.currency` writes the bare code when handed no symbol, which is
/// correct but noisy for the currencies in daily use here.
String? _symbolFor(String code, String? locale) {
  const known = <String, String>{
    'EUR': '€',
    'USD': r'$',
    'GBP': '£',
    'SEK': 'kr',
    'DKK': 'kr',
    'NOK': 'kr',
    'CHF': 'CHF',
  };
  return known[code.toUpperCase()];
}

/// Formats a date the way the transaction list shows it.
String formatDate(DateTime date, {String? locale}) =>
    DateFormat.yMMMd(locale).format(date);

/// Month and year, for the budget screen's header.
String formatMonth(int year, int month, {String? locale}) =>
    DateFormat.yMMMM(locale).format(DateTime(year, month));

/// Parses a backend date, which is always ISO `YYYY-MM-DD`.
///
/// Returns null rather than throwing: one malformed row must not take down a
/// whole screen.
DateTime? parseApiDate(String? value) {
  if (value == null || value.isEmpty) return null;
  return DateTime.tryParse(value);
}
