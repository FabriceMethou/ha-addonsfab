import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money.dart';
import '../../domain/models/account.dart';
import '../../domain/models/transaction.dart';
import '../../ui/theme.dart';
import '../../ui/views.dart';
import '../accounts/accounts_screen.dart';
import 'transactions_controller.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Fetches before the list actually runs out, so scrolling stays continuous
    // instead of stalling at the bottom.
    if (!_scroll.hasClients) return;
    final remaining = _scroll.position.maxScrollExtent - _scroll.position.pixels;
    if (remaining < 600) {
      ref.read(transactionListProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(transactionListProvider);
    final filter = ref.watch(transactionFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Transactions'),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: filter.activeCount > 0,
              label: Text('${filter.activeCount}'),
              child: const Icon(Icons.filter_list),
            ),
            tooltip: 'Filter',
            onPressed: () => _openFilters(context),
          ),
          const OpenOnWebsiteButton(path: '/transactions'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(transactionListProvider),
        child: list.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => FailureView(
            error: e,
            onRetry: () => ref.invalidate(transactionListProvider),
          ),
          data: (state) => state.rows.isEmpty
              ? EmptyView(
                  icon: Icons.receipt_long_outlined,
                  title: filter.isEmpty
                      ? 'No transactions yet.'
                      : 'Nothing matches these filters.',
                  detail: filter.isEmpty
                      ? 'They are entered on the website.'
                      : 'Try widening or clearing them.',
                )
              : _TransactionList(
                  state: state,
                  scroll: _scroll,
                  onRetry: () => ref.invalidate(transactionListProvider),
                ),
        ),
      ),
    );
  }

  Future<void> _openFilters(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const _FilterSheet(),
      );
}

class _TransactionList extends StatelessWidget {
  const _TransactionList({
    required this.state,
    required this.scroll,
    required this.onRetry,
  });
  final TransactionListState state;
  final ScrollController scroll;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Rows arrive newest first, so a date header appears whenever the day
    // changes rather than needing the list grouped up front.
    return ListView.builder(
      controller: scroll,
      padding: const EdgeInsets.only(bottom: 24),
      // One extra slot at each end: the stale banner on top, the count below.
      itemCount: state.rows.length + 2,
      itemBuilder: (context, index) {
        if (index == 0) {
          final at = state.fetchedAt;
          return state.stale && at != null
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: StaleBanner(fetchedAt: at, onRetry: onRetry),
                )
              : const SizedBox.shrink();
        }
        final i = index - 1;
        if (i == state.rows.length) {
          return _Footer(state: state);
        }
        final row = state.rows[i];
        final previous = i == 0 ? null : state.rows[i - 1];
        final newDay = previous?.transactionDate != row.transactionDate;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (newDay)
              Padding(
                padding: EdgeInsets.fromLTRB(16, i == 0 ? 8 : 18, 16, 4),
                child: Text(
                  row.date == null
                      ? row.transactionDate
                      : formatDate(row.date!),
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            _TransactionRow(transaction: row),
          ],
        );
      },
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.state});
  final TransactionListState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Center(
        child: state.loadingMore
            ? const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(
                // Says how much of the set is on screen: an infinite list with
                // no end in sight gives no sense of scale.
                state.hasMore
                    ? '${state.rows.length} of ${state.total}'
                    : '${state.total} '
                        '${state.total == 1 ? 'transaction' : 'transactions'}',
                style: theme.textTheme.labelSmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
      ),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  const _TransactionRow({required this.transaction});
  final Transaction transaction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = transaction;

    // Transfers are neither income nor spending: they move money between the
    // household's own accounts, and colouring them either way would misread.
    final tone = t.isTransfer || t.category == 'transfer'
        ? null
        : t.amount >= 0
            ? SemanticTone.positive
            : null;
    final amountColor = tone == null
        ? theme.colorScheme.onSurface
        : colorForTone(tone, theme.brightness);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      child: Row(
        children: [
          if (t.icon.isNotEmpty)
            Text(t.icon, style: const TextStyle(fontSize: 17))
          else
            Icon(Icons.circle, size: 8, color: theme.colorScheme.outline),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.destinataire.isEmpty ? t.typeName : t.destinataire,
                        style: theme.textTheme.bodyLarge,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (!t.confirmed)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Icon(
                          Icons.schedule,
                          size: 14,
                          color: colorForTone(
                              SemanticTone.caution, theme.brightness),
                        ),
                      ),
                  ],
                ),
                Text(
                  [
                    t.typeName,
                    if (t.subtypeName != null) t.subtypeName!,
                    if (t.transferAccountName != null)
                      '→ ${t.transferAccountName}'
                    else if (t.accountName != null)
                      t.accountName!,
                  ].join(' · '),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            // Its own currency, sign as stored. Normalising to absolute and
            // inferring direction from the category is how an expense ends up
            // displayed as income.
            formatSignedMoney(t.amount, t.accountCurrency),
            style: theme.textTheme.bodyLarge
                ?.copyWith(fontWeight: FontWeight.w600, color: amountColor),
          ),
        ],
      ),
    );
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet();

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late TransactionFilter _draft;

  @override
  void initState() {
    super.initState();
    // Edited as a draft so closing without applying leaves the list alone.
    _draft = ref.read(transactionFilterProvider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categories = ref.watch(categoriesProvider).value ?? const [];
    // The accounts screen caches its payload, so the filter pickers stay
    // populated offline instead of silently losing their options.
    final accountsData = ref.watch(accountsProvider).value?.value;
    final accounts = accountsData?.accounts ?? const <Account>[];
    final owners = accountsData?.balances.owners ?? const <OwnerBalance>[];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Filter', style: theme.textTheme.titleLarge),
                  ),
                  TextButton(
                    onPressed: () =>
                        setState(() => _draft = const TransactionFilter()),
                    child: const Text('Clear all'),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              _Label('Category'),
              _ChipRow(
                options: [
                  for (final c in categories.where((c) => c.isExpense))
                    (id: c.id, label: c.name),
                ],
                selected: _draft.typeId,
                onSelect: (id) => setState(
                    () => _draft = _draft.copyWith(typeId: id)),
              ),

              if (owners.isNotEmpty) ...[
                const SizedBox(height: 16),
                _Label('Owner'),
                _ChipRow(
                  options: [
                    for (final o in owners) (id: o.ownerId, label: o.ownerName),
                  ],
                  selected: _draft.ownerId,
                  onSelect: (id) => setState(
                      () => _draft = _draft.copyWith(ownerId: id)),
                ),
              ],

              if (accounts.isNotEmpty) ...[
                const SizedBox(height: 16),
                _Label('Account'),
                _ChipRow(
                  options: [
                    for (final a in accounts) (id: a.id, label: a.name),
                  ],
                  selected: _draft.accountId,
                  onSelect: (id) => setState(
                      () => _draft = _draft.copyWith(accountId: id)),
                ),
              ],

              const SizedBox(height: 16),
              _Label('Period'),
              _PeriodPicker(
                startDate: _draft.startDate,
                endDate: _draft.endDate,
                onChanged: (start, end) => setState(
                  () => _draft =
                      _draft.copyWith(startDate: start, endDate: end),
                ),
              ),

              const SizedBox(height: 24),
              FilledButton(
                onPressed: () {
                  ref.read(transactionFilterProvider.notifier).set(_draft);
                  Navigator.of(context).pop();
                },
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text.toUpperCase(),
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          letterSpacing: 1.1,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// A row of single-select chips. Tapping the selected one clears it.
class _ChipRow extends StatelessWidget {
  const _ChipRow({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final List<({int id, String label})> options;
  final int? selected;
  final void Function(int? id) onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in options)
          FilterChip(
            label: Text(option.label),
            selected: selected == option.id,
            onSelected: (_) =>
                onSelect(selected == option.id ? null : option.id),
          ),
      ],
    );
  }
}

class _PeriodPicker extends StatelessWidget {
  const _PeriodPicker({
    required this.startDate,
    required this.endDate,
    required this.onChanged,
  });

  final String? startDate;
  final String? endDate;
  final void Function(String? start, String? end) onChanged;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    String iso(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';

    final presets = <({String label, String? start, String? end})>[
      (label: 'Any time', start: null, end: null),
      (
        label: 'This month',
        start: iso(DateTime(now.year, now.month, 1)),
        end: iso(DateTime(now.year, now.month + 1, 0)),
      ),
      (
        label: 'Last month',
        start: iso(DateTime(now.year, now.month - 1, 1)),
        end: iso(DateTime(now.year, now.month, 0)),
      ),
      (
        label: 'This year',
        start: iso(DateTime(now.year, 1, 1)),
        end: iso(DateTime(now.year, 12, 31)),
      ),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final preset in presets)
          FilterChip(
            label: Text(preset.label),
            selected: startDate == preset.start && endDate == preset.end,
            onSelected: (_) => onChanged(preset.start, preset.end),
          ),
      ],
    );
  }
}
