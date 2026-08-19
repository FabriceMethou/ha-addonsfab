import 'package:freezed_annotation/freezed_annotation.dart';

part 'category.freezed.dart';
part 'category.g.dart';

/// A top-level category, as `/api/categories/hierarchy` returns it.
///
/// These are what budgets are set against, so [id] is the `type_id` the budget
/// endpoints report and the transaction filter takes.
@freezed
abstract class CategoryType with _$CategoryType {
  const factory CategoryType({
    required int id,
    @Default('') String name,

    /// `income`, `expense` or `transfer`.
    @Default('expense') String category,
    @Default('') String icon,
    @Default('') String color,
    @Default(<CategorySubtype>[]) List<CategorySubtype> subtypes,
  }) = _CategoryType;

  const CategoryType._();

  factory CategoryType.fromJson(Map<String, dynamic> json) =>
      _$CategoryTypeFromJson(json);

  bool get isExpense => category == 'expense';
}

@freezed
abstract class CategorySubtype with _$CategorySubtype {
  const factory CategorySubtype({
    required int id,
    @Default('') String name,
    @JsonKey(name: 'type_id') int? typeId,
  }) = _CategorySubtype;

  factory CategorySubtype.fromJson(Map<String, dynamic> json) =>
      _$CategorySubtypeFromJson(json);
}

@freezed
abstract class CategoryHierarchy with _$CategoryHierarchy {
  const factory CategoryHierarchy({
    @Default(<CategoryType>[]) List<CategoryType> categories,
  }) = _CategoryHierarchy;

  factory CategoryHierarchy.fromJson(Map<String, dynamic> json) =>
      _$CategoryHierarchyFromJson(json);
}
