import 'package:freezed_annotation/freezed_annotation.dart';

import '../budget_pace.dart';

part 'budget.freezed.dart';
part 'budget.g.dart';

/// One budget row for a month, as `/api/budgets/vs-actual/{year}/{month}`
/// returns it.
///
/// [budget], [actual] and [difference] are in the display currency, already
/// converted server-side. [budgetOriginal] and [actualOriginal] are the same
/// figures in the budget's own currency, kept for showing "410 DKK" beside a
/// converted total.
@freezed
abstract class BudgetCategory with _$BudgetCategory implements BudgetLine {
  const factory BudgetCategory({
    @JsonKey(name: 'budget_id') required int budgetId,
    @JsonKey(name: 'type_id') required int typeId,
    @JsonKey(name: 'type_name') @Default('') String typeName,
    @Default('') String icon,
    @Default('') String color,

    /// Null means the budget covers every owner. Load-bearing: see
    /// [withoutDoubleCounting].
    @JsonKey(name: 'owner_id') int? ownerId,
    @JsonKey(name: 'owner_name') String? ownerName,
    @Default(0.0) double budget,
    @Default(0.0) double actual,
    @Default(0.0) double difference,

    /// Share of the limit used. Computed by the server before currency
    /// conversion — never recompute it from [actual] and [budget].
    @Default(0.0) double percentage,

    /// `over`, `under` or `exact`, on the raw difference. The colour comes from
    /// [levelOf] instead, which matches the website's thresholds.
    @Default('under') String status,
    @JsonKey(name: 'budget_currency') @Default('EUR') String budgetCurrency,
    @JsonKey(name: 'budget_original') @Default(0.0) double budgetOriginal,
    @JsonKey(name: 'actual_original') @Default(0.0) double actualOriginal,
  }) = _BudgetCategory;

  const BudgetCategory._();

  factory BudgetCategory.fromJson(Map<String, dynamic> json) =>
      _$BudgetCategoryFromJson(json);

  /// Severity, on the same thresholds the website uses.
  BudgetLevel get level => levelOf(percentage);

  /// Whether this budget covers every owner rather than one person.
  bool get isAllOwners => ownerId == null;

  /// Limit left. Negative once overspent.
  double get remaining => budget - actual;
}

/// A month of budgets, with the currency its amounts are expressed in.
@freezed
abstract class BudgetVsActual with _$BudgetVsActual {
  const factory BudgetVsActual({
    required int year,
    required int month,
    @Default(<BudgetCategory>[]) List<BudgetCategory> categories,
    @JsonKey(name: 'display_currency') @Default('EUR') String displayCurrency,
  }) = _BudgetVsActual;

  const BudgetVsActual._();

  factory BudgetVsActual.fromJson(Map<String, dynamic> json) =>
      _$BudgetVsActualFromJson(json);

  /// Rows that count towards the headline ring, duplicates already removed.
  List<BudgetCategory> get countedCategories =>
      withoutDoubleCounting(categories).where((c) => c.budget > 0).toList();

  /// The headline figures, for [now].
  BudgetOverview overview(DateTime now) =>
      overviewOf(categories, now: now, year: year, month: month);

  /// The rows the widget has room for, worst first.
  List<BudgetCategory> critical({int take = 3}) =>
      mostCritical(countedCategories, take: take);

  /// Whether [category]'s amounts were converted to reach [displayCurrency].
  ///
  /// Lives here rather than on the row because the response states the display
  /// currency once, at the top.
  bool isConverted(BudgetCategory category) =>
      category.budgetCurrency != displayCurrency;
}
