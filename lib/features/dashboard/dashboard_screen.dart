import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money.dart';
import '../../core/cache/cached.dart';
import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/models/account.dart';
import '../../domain/models/reports.dart';
import '../../ui/theme.dart';
import '../../ui/views.dart';

/// Everything the dashboard shows, fetched together.
///
/// One record rather than three providers so the screen has a single loading
/// state. Three would let the page assemble itself in pieces, which reads as
/// jitter rather than progress.
typedef DashboardData = ({
  NetWorth netWorth,
  MonthlySummary month,
  BalancesSummary balances,
});

final dashboardProvider = FutureProvider<Cached<DashboardData>>((ref) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) {
    throw const ApiException(ApiFailure.unknown, 'No server configured.');
  }
  final now = DateTime.now();

  return withCache<DashboardData>(
    store: ref.watch(snapshotStoreProvider),
    key: 'dashboard',
    fetch: () async {
      // Issued together: they are independent reads, and running them in
      // sequence would make the screen three round trips slow for no reason.
      final results = await Future.wait([
        api.netWorth(),
        api.monthlySummary(now.year, now.month),
        api.balances(),
      ]);
      return (
        netWorth: results[0] as NetWorth,
        month: results[1] as MonthlySummary,
        balances: results[2] as BalancesSummary,
      );
    },
    encode: (d) => {
      'netWorth': d.netWorth.toJson(),
      'month': d.month.toJson(),
      'balances': d.balances.toJson(),
    },
    decode: (j) => (
      netWorth: NetWorth.fromJson(j['netWorth'] as Map<String, dynamic>),
      month: MonthlySummary.fromJson(j['month'] as Map<String, dynamic>),
      balances: BalancesSummary.fromJson(j['balances'] as Map<String, dynamic>),
    ),
  );
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(dashboardProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Overview'),
        actions: [
          OpenOnWebsiteButton(path: '/'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dashboardProvider.future),
        child: data.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => FailureView(
            error: e,
            onRetry: () => ref.invalidate(dashboardProvider),
          ),
          data: (cached) => _Dashboard(
            data: cached.value,
            cached: cached,
            onRetry: () => ref.invalidate(dashboardProvider),
          ),
        ),
      ),
    );
  }
}

class _Dashboard extends StatelessWidget {
  const _Dashboard({
    required this.data,
    required this.cached,
    required this.onRetry,
  });
  final DashboardData data;
  final Cached<DashboardData> cached;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final worth = data.netWorth;
    final month = data.month;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (cached.isStale)
          StaleBanner(fetchedAt: cached.fetchedAt, onRetry: onRetry),
        _SectionLabel('Net worth'),
        Text(
          formatMoney(worth.netWorth, worth.currency),
          style: theme.textTheme.displaySmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: worth.isNegative
                ? colorForTone(SemanticTone.negative, theme.brightness)
                : null,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _Figure(
                label: 'Assets',
                value: formatMoney(worth.totalAssets, worth.currency),
                caption: '${worth.accountCount} '
                    '${worth.accountCount == 1 ? 'account' : 'accounts'}',
                tone: SemanticTone.positive,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Figure(
                label: 'Debts',
                value: formatMoney(worth.totalDebts, worth.currency),
                caption: worth.hasDebts
                    ? '${worth.debtCount} '
                        '${worth.debtCount == 1 ? 'debt' : 'debts'}'
                    : 'none',
                tone: worth.hasDebts ? SemanticTone.negative : null,
              ),
            ),
          ],
        ),

        const Divider(height: 40),

        _SectionLabel(formatMonth(now.year, now.month)),
        Row(
          children: [
            Expanded(
              child: _Figure(
                label: 'In',
                value: formatMoney(month.income, month.currency),
                tone: SemanticTone.positive,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Figure(
                label: 'Out',
                value: formatMoney(month.expenses, month.currency),
                tone: SemanticTone.negative,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _Figure(
          label: month.isPositive ? 'Put aside' : 'Overspent by',
          value: formatMoney(month.net.abs(), month.currency),
          caption: '${month.transactionCount} '
              '${month.transactionCount == 1 ? 'transaction' : 'transactions'}',
          tone: month.isPositive ? SemanticTone.positive : SemanticTone.negative,
          wide: true,
        ),

        const Divider(height: 40),

        _SectionLabel('By owner'),
        for (final owner in data.balances.owners)
          _OwnerRow(owner: owner, currency: data.balances.currency),
        if (data.balances.owners.isEmpty)
          Text(
            'No accounts yet.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
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

class _Figure extends StatelessWidget {
  const _Figure({
    required this.label,
    required this.value,
    this.caption,
    this.tone,
    this.wide = false,
  });

  final String label;
  final String value;
  final String? caption;
  final SemanticTone? tone;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = tone == null ? null : colorForTone(tone!, theme.brightness);

    return Container(
      width: wide ? double.infinity : null,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w600, color: color),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (caption != null)
            Text(
              caption!,
              style: theme.textTheme.labelSmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }
}

class _OwnerRow extends StatelessWidget {
  const _OwnerRow({required this.owner, required this.currency});
  final OwnerBalance owner;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(owner.ownerName, style: theme.textTheme.bodyLarge),
                Text(
                  '${owner.accountCount} '
                  '${owner.accountCount == 1 ? 'account' : 'accounts'}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          Text(
            formatMoney(owner.totalBalance, currency),
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
