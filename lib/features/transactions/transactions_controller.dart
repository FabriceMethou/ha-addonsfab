import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/models/category.dart';
import '../../domain/models/transaction.dart';

/// The filters currently applied to the list.
class TransactionFilterController extends Notifier<TransactionFilter> {
  @override
  TransactionFilter build() => const TransactionFilter();

  void set(TransactionFilter filter) => state = filter;
  void clear() => state = const TransactionFilter();
}

final transactionFilterProvider =
    NotifierProvider<TransactionFilterController, TransactionFilter>(
        TransactionFilterController.new);

/// Categories, for the filter picker. Fetched once and kept.
final categoriesProvider = FutureProvider<List<CategoryType>>((ref) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) return const [];
  return api.categories();
});

/// A page of rows, plus enough state to know whether to fetch more.
class TransactionListState {
  const TransactionListState({
    this.rows = const [],
    this.total = 0,
    this.loadingMore = false,
  });

  final List<Transaction> rows;

  /// Rows matching the filters, ignoring paging.
  final int total;

  final bool loadingMore;

  bool get hasMore => rows.length < total;

  TransactionListState copyWith({
    List<Transaction>? rows,
    int? total,
    bool? loadingMore,
  }) =>
      TransactionListState(
        rows: rows ?? this.rows,
        total: total ?? this.total,
        loadingMore: loadingMore ?? this.loadingMore,
      );
}

/// Loads transactions a page at a time.
///
/// Rebuilt whenever the filters change, because the provider watches them: a
/// new filter is a different list, not a mutation of the current one.
class TransactionListController extends AsyncNotifier<TransactionListState> {
  static const _pageSize = 50;

  @override
  Future<TransactionListState> build() async {
    final api = ref.watch(financeApiProvider);
    if (api == null) {
      throw const ApiException(ApiFailure.unknown, 'No server configured.');
    }
    final filter = ref.watch(transactionFilterProvider);

    final page = await api.transactions(filter: filter, limit: _pageSize);
    return TransactionListState(rows: page.transactions, total: page.total);
  }

  /// Appends the next page.
  ///
  /// Guards on [TransactionListState.loadingMore] because a fast scroll fires
  /// the trigger repeatedly, and without it the same offset would be fetched
  /// several times and the rows duplicated.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore) return;

    final api = ref.read(financeApiProvider);
    if (api == null) return;

    state = AsyncData(current.copyWith(loadingMore: true));
    try {
      final page = await api.transactions(
        filter: ref.read(transactionFilterProvider),
        limit: _pageSize,
        offset: current.rows.length,
      );
      state = AsyncData(
        current.copyWith(
          rows: [...current.rows, ...page.transactions],
          total: page.total,
          loadingMore: false,
        ),
      );
    } catch (_) {
      // Keep what is already on screen: losing a loaded list because one extra
      // page failed would be a worse outcome than a missing page.
      state = AsyncData(current.copyWith(loadingMore: false));
    }
  }
}

final transactionListProvider =
    AsyncNotifierProvider<TransactionListController, TransactionListState>(
        TransactionListController.new);
