import 'package:freezed_annotation/freezed_annotation.dart';

import 'converters.dart';

part 'transaction.freezed.dart';
part 'transaction.g.dart';

/// A ledger entry, as `/api/transactions/` returns it.
///
/// [amount] carries its sign — negative for an expense, positive for income —
/// and is in [accountCurrency], **not** converted. Do not sum these: the list
/// includes both legs of every transfer, and this dataset spans four
/// currencies. Totals come from the report endpoints.
@freezed
abstract class Transaction with _$Transaction implements Comparable<Transaction> {
  const factory Transaction({
    required int id,

    /// Canonical date field. The router also emits a `date` alias for the
    /// website; this ignores it so there is one source of truth.
    @JsonKey(name: 'transaction_date') @Default('') String transactionDate,
    @Default(0.0) double amount,

    /// Currency the amount is actually in.
    @JsonKey(name: 'account_currency') @Default('EUR') String accountCurrency,

    /// The payee or payer. Required in the schema, so it is the row's label.
    @Default('') String destinataire,
    String? description,
    @JsonKey(name: 'type_name') @Default('') String typeName,
    @JsonKey(name: 'subtype_name') String? subtypeName,

    /// `income`, `expense` or `transfer`.
    @Default('expense') String category,
    @Default('') String icon,
    @Default('') String color,
    @JsonKey(name: 'type_id') int? typeId,
    @JsonKey(name: 'account_id') int? accountId,
    @JsonKey(name: 'account_name') String? accountName,

    /// Nullable: bank_id is, and the join filling the name is a LEFT JOIN.
    @JsonKey(name: 'bank_name') String? bankName,

    /// `COALESCE(t.owner_id, a.owner_id)`. Use this, not `owner_id`, which is
    /// null whenever the transaction inherits its owner from the account.
    @JsonKey(name: 'effective_owner_id') int? effectiveOwnerId,
    @JsonKey(name: 'owner_name') String? ownerName,
    @JsonKey(name: 'is_transfer') @LenientBool() @Default(false) bool isTransfer,
    @JsonKey(name: 'transfer_account_name') String? transferAccountName,
    @LenientBool() @Default(true) bool confirmed,
    String? tags,
  }) = _Transaction;

  const Transaction._();

  factory Transaction.fromJson(Map<String, dynamic> json) =>
      _$TransactionFromJson(json);

  bool get isExpense => category == 'expense';
  bool get isIncome => category == 'income';

  /// Parsed date, or null if the backend ever sends something unparseable.
  /// One bad row must not take down the list.
  DateTime? get date => DateTime.tryParse(transactionDate);

  /// Tags as a list. Stored as a comma-separated string.
  List<String> get tagList => (tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .where((t) => t.isNotEmpty)
      .toList();

  /// Newest first, matching the order the server returns.
  @override
  int compareTo(Transaction other) =>
      other.transactionDate.compareTo(transactionDate);
}

/// One page of transactions.
///
/// [total] counts every row matching the filters, ignoring limit and offset,
/// which is what makes exact infinite scrolling possible.
@freezed
abstract class TransactionPage with _$TransactionPage {
  const factory TransactionPage({
    @Default(<Transaction>[]) List<Transaction> transactions,
    @Default(0) int count,
    @Default(0) int total,
  }) = _TransactionPage;

  const TransactionPage._();

  factory TransactionPage.fromJson(Map<String, dynamic> json) =>
      _$TransactionPageFromJson(json);

  /// Whether more rows exist beyond [offset] plus what was returned.
  bool hasMoreAfter(int offset) => offset + transactions.length < total;
}

/// The filters `/api/transactions/` accepts.
///
/// Deliberately a value type: it is a provider key, so it needs equality, and
/// changing one field has to produce a different key rather than mutating a
/// shared object.
@freezed
abstract class TransactionFilter with _$TransactionFilter {
  const factory TransactionFilter({
    int? accountId,
    int? ownerId,
    int? typeId,
    String? startDate,
    String? endDate,

    /// Matched against the recipient. The backend compares it exactly, not as
    /// a substring, so this is a picker rather than a search box.
    String? recipient,
    String? tag,
  }) = _TransactionFilter;

  const TransactionFilter._();

  bool get isEmpty =>
      accountId == null &&
      ownerId == null &&
      typeId == null &&
      startDate == null &&
      endDate == null &&
      recipient == null &&
      tag == null;

  /// How many filters are active, for the badge on the filter button.
  int get activeCount => [
        accountId,
        ownerId,
        typeId,
        startDate ?? endDate,
        recipient,
        tag,
      ].where((v) => v != null).length;

  Map<String, dynamic> toQuery() => {
        'account_id': ?accountId,
        'owner_id': ?ownerId,
        'type_id': ?typeId,
        'start_date': ?startDate,
        'end_date': ?endDate,
        'recipient': ?recipient,
        'tags': ?tag,
      };
}
