import 'package:freezed_annotation/freezed_annotation.dart';

part 'reports.freezed.dart';
part 'reports.g.dart';

/// Assets against debts, converted server-side into [currency].
@freezed
abstract class NetWorth with _$NetWorth {
  const factory NetWorth({
    @JsonKey(name: 'total_assets') @Default(0.0) double totalAssets,
    @JsonKey(name: 'total_debts') @Default(0.0) double totalDebts,
    @JsonKey(name: 'net_worth') @Default(0.0) double netWorth,
    @JsonKey(name: 'account_count') @Default(0) int accountCount,
    @JsonKey(name: 'debt_count') @Default(0) int debtCount,
    @Default('EUR') String currency,

    /// Null when the figure covers everyone.
    @JsonKey(name: 'owner_id') int? ownerId,
  }) = _NetWorth;

  const NetWorth._();

  factory NetWorth.fromJson(Map<String, dynamic> json) =>
      _$NetWorthFromJson(json);

  bool get isNegative => netWorth < 0;

  /// Whether there is any debt to show a breakdown for.
  bool get hasDebts => totalDebts != 0;
}

/// What came in and went out over a period.
///
/// `budget_vs_actual` is deliberately not modelled. The backend returns an
/// object for a year/month request but an empty list for a date-range one, so
/// its type is not stable; budgets are read from their own endpoint instead,
/// where the shape is consistent.
@freezed
abstract class MonthlySummary with _$MonthlySummary {
  const factory MonthlySummary({
    int? year,
    int? month,
    @JsonKey(name: 'start_date') String? startDate,
    @JsonKey(name: 'end_date') String? endDate,

    /// Positive. Transfers are excluded server-side, so this is real income.
    @Default(0.0) double income,

    /// Positive, despite expenses being stored negative: the server takes the
    /// absolute value before converting.
    @Default(0.0) double expenses,
    @Default(0.0) double net,
    @JsonKey(name: 'transaction_count') @Default(0) int transactionCount,
    @Default('EUR') String currency,
    @JsonKey(name: 'spending_by_category')
    @Default(<CategorySpend>[])
    List<CategorySpend> spendingByCategory,
  }) = _MonthlySummary;

  const MonthlySummary._();

  factory MonthlySummary.fromJson(Map<String, dynamic> json) =>
      _$MonthlySummaryFromJson(json);

  bool get isPositive => net >= 0;

  /// Share of income that was spent. Null when nothing came in, since a ratio
  /// against zero says nothing.
  double? get spentShare => income > 0 ? expenses / income : null;
}

/// Reads the amount under whichever name this endpoint chose.
///
/// The backend builds both breakdowns with the same helper but passes a
/// different key: `/reports/monthly-summary` labels it `amount` while
/// `/reports/spending-by-category` labels it `total`. Identical structure,
/// different name, so one model covers both only if it accepts either.
Object? _amountOrTotal(Map json, String key) => json['amount'] ?? json['total'];

/// One category's spending over a period, with its subcategories.
@freezed
abstract class CategorySpend with _$CategorySpend {
  const factory CategorySpend({
    @Default('') String category,
    @JsonKey(readValue: _amountOrTotal) @Default(0.0) double amount,
    @Default(<CategorySpend>[]) List<CategorySpend> subcategories,
  }) = _CategorySpend;

  factory CategorySpend.fromJson(Map<String, dynamic> json) =>
      _$CategorySpendFromJson(json);
}

/// One point on the net-worth curve.
@freezed
abstract class NetWorthPoint with _$NetWorthPoint {
  const factory NetWorthPoint({
    @Default('') String date,

    /// Already formatted by the server, e.g. "February 2026".
    @Default('') String month,
    @Default(0.0) double assets,
    @Default(0.0) double debts,
    @JsonKey(name: 'net_worth') @Default(0.0) double netWorth,
  }) = _NetWorthPoint;

  const NetWorthPoint._();

  factory NetWorthPoint.fromJson(Map<String, dynamic> json) =>
      _$NetWorthPointFromJson(json);

  DateTime? get parsedDate => DateTime.tryParse(date);
}

/// Net worth over time.
///
/// The backend builds this from account opening dates and opening balances
/// rather than by walking backwards from today, so points before an account
/// existed are not filled in with a balance it never had.
@freezed
abstract class NetWorthTrend with _$NetWorthTrend {
  const factory NetWorthTrend({
    @Default(<NetWorthPoint>[]) List<NetWorthPoint> trend,
    @JsonKey(name: 'current_net_worth') @Default(0.0) double currentNetWorth,
    @Default('EUR') String currency,
  }) = _NetWorthTrend;

  const NetWorthTrend._();

  factory NetWorthTrend.fromJson(Map<String, dynamic> json) =>
      _$NetWorthTrendFromJson(json);

  bool get hasData => trend.length >= 2;

  double get minimum =>
      trend.map((p) => p.netWorth).reduce((a, b) => a < b ? a : b);

  double get maximum =>
      trend.map((p) => p.netWorth).reduce((a, b) => a > b ? a : b);

  /// Change from the first point to the last, or null when there is nothing to
  /// compare against.
  double? get change =>
      hasData ? trend.last.netWorth - trend.first.netWorth : null;
}

/// What came in against what went out, over an arbitrary range.
@freezed
abstract class IncomeVsExpenses with _$IncomeVsExpenses {
  const factory IncomeVsExpenses({
    @Default(0.0) double income,

    /// Positive, like [MonthlySummary.expenses].
    @Default(0.0) double expenses,
    @Default(0.0) double net,
    @JsonKey(name: 'income_categories')
    @Default(<CategorySpend>[])
    List<CategorySpend> incomeCategories,
    @Default('EUR') String currency,
  }) = _IncomeVsExpenses;

  const IncomeVsExpenses._();

  factory IncomeVsExpenses.fromJson(Map<String, dynamic> json) =>
      _$IncomeVsExpensesFromJson(json);

  bool get isPositive => net >= 0;
}

/// Spending grouped by category, over an arbitrary range.
@freezed
abstract class SpendingByCategory with _$SpendingByCategory {
  const factory SpendingByCategory({
    @Default(<CategorySpend>[]) List<CategorySpend> categories,
    @Default(0.0) double total,
    @Default('EUR') String currency,
  }) = _SpendingByCategory;

  const SpendingByCategory._();

  factory SpendingByCategory.fromJson(Map<String, dynamic> json) =>
      _$SpendingByCategoryFromJson(json);

  /// Largest first, which is the only order worth showing.
  List<CategorySpend> get ranked =>
      [...categories]..sort((a, b) => b.amount.compareTo(a.amount));

  /// Share of the total this category accounts for, in `[0, 1]`.
  double shareOf(CategorySpend c) => total > 0 ? c.amount / total : 0;
}
