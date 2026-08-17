import 'package:freezed_annotation/freezed_annotation.dart';

part 'account.freezed.dart';
part 'account.g.dart';

/// A bank account, as `/api/accounts/` returns it.
///
/// [balance] is in the account's own [currency] and is **not** converted.
/// Summing these across accounts would be wrong the moment two currencies are
/// involved — which they are here, across EUR, DKK, SEK and NOK. Converted
/// totals come from `/api/accounts/summary/balances` instead.
@freezed
abstract class Account with _$Account {
  const factory Account({
    required int id,
    @Default('') String name,

    /// `cash`, `checking`, `savings` or `investment`.
    @JsonKey(name: 'account_type') @Default('checking') String accountType,
    @Default('EUR') String currency,
    @Default(0.0) double balance,
    @JsonKey(name: 'owner_id') int? ownerId,
    @JsonKey(name: 'owner_name') String? ownerName,

    /// Nullable in the schema, and the join that fills the name is a LEFT JOIN.
    @JsonKey(name: 'bank_id') int? bankId,
    @JsonKey(name: 'bank_name') String? bankName,
    @JsonKey(name: 'opening_date') String? openingDate,
    @JsonKey(name: 'opening_balance') @Default(0.0) double openingBalance,

    /// Set on investment accounts, pointing at the cash account they settle to.
    @JsonKey(name: 'linked_account_id') int? linkedAccountId,
  }) = _Account;

  const Account._();

  factory Account.fromJson(Map<String, dynamic> json) =>
      _$AccountFromJson(json);

  bool get isInvestment => accountType == 'investment';
}

/// The envelope `/api/accounts/` returns.
@freezed
abstract class AccountList with _$AccountList {
  const factory AccountList({
    @Default(<Account>[]) List<Account> accounts,
  }) = _AccountList;

  factory AccountList.fromJson(Map<String, dynamic> json) =>
      _$AccountListFromJson(json);
}

/// One owner's holdings, already converted into the display currency.
@freezed
abstract class OwnerBalance with _$OwnerBalance {
  const factory OwnerBalance({
    @JsonKey(name: 'owner_id') required int ownerId,
    @JsonKey(name: 'owner_name') @Default('') String ownerName,

    /// Sum across this owner's accounts, converted server-side.
    @JsonKey(name: 'total_balance') @Default(0.0) double totalBalance,
    @JsonKey(name: 'account_count') @Default(0) int accountCount,
    @Default(<Account>[]) List<Account> accounts,
  }) = _OwnerBalance;

  const OwnerBalance._();

  factory OwnerBalance.fromJson(Map<String, dynamic> json) =>
      _$OwnerBalanceFromJson(json);

  /// Owners exist independently of accounts, so some have none. Showing an
  /// empty owner would be a row that never says anything.
  bool get hasAccounts => accountCount > 0;
}

/// The envelope `/api/accounts/summary/balances` returns.
@freezed
abstract class BalancesSummary with _$BalancesSummary {
  const factory BalancesSummary({
    @Default(<OwnerBalance>[]) List<OwnerBalance> summary,
    @Default('EUR') String currency,
  }) = _BalancesSummary;

  const BalancesSummary._();

  factory BalancesSummary.fromJson(Map<String, dynamic> json) =>
      _$BalancesSummaryFromJson(json);

  /// Owners who actually hold something.
  List<OwnerBalance> get owners =>
      summary.where((o) => o.hasAccounts).toList();

  /// Household total, in [currency].
  ///
  /// Safe to add up here, unlike raw account balances: the server converted
  /// every owner's figure into the same currency first.
  double get total =>
      summary.fold(0.0, (sum, owner) => sum + owner.totalBalance);
}
