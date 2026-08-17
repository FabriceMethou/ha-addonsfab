import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../bridge/widget_payload.dart';
import '../../bridge/widget_sync.dart';
import '../../core/format/money.dart';
import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/budget_pace.dart';
import '../../domain/models/budget.dart';
import '../../ui/pace_widgets.dart';
import '../../ui/theme.dart';
import '../../ui/views.dart';

/// Which month the screen is showing. Held as year and month rather than a
/// DateTime so stepping past a month boundary cannot land on the 31st of a
/// 30-day month.
class VisibleMonth extends Notifier<({int year, int month})> {
  @override
  ({int year, int month}) build() {
    final now = DateTime.now();
    return (year: now.year, month: now.month);
  }

  /// Moves [delta] months, normalising through DateTime so December rolls into
  /// January rather than becoming month 13.
  void step(int delta) {
    final shifted = DateTime(state.year, state.month + delta);
    state = (year: shifted.year, month: shifted.month);
  }
}

final visibleMonthProvider =
    NotifierProvider<VisibleMonth, ({int year, int month})>(VisibleMonth.new);

final budgetsProvider =
    FutureProvider.family<BudgetVsActual, ({int year, int month})>(
        (ref, month) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) {
    throw const ApiException(ApiFailure.unknown, 'No server configured.');
  }
  final data = await api.budgetVsActual(month.year, month.month);

  // Whenever the app has just fetched the month the widget shows, hand it the
  // same figures. Waiting for the widget's own cycle would leave the home
  // screen contradicting the app someone just closed.
  final now = DateTime.now();
  if (month.year == now.year && month.month == now.month) {
    await const WidgetSync()
        .publish(WidgetPayload.from(data, now: now));
  }
  return data;
});

class BudgetsScreen extends ConsumerWidget {
  const BudgetsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = ref.watch(visibleMonthProvider);
    final budgets = ref.watch(budgetsProvider(month));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Budgets'),
        actions: [
          const OpenOnWebsiteButton(path: '/budgets'),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => ref.read(sessionProvider.notifier).signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          _MonthBar(month: month),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(budgetsProvider(month).future),
              child: budgets.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => FailureView(
                  error: e,
                  onRetry: () => ref.invalidate(budgetsProvider(month)),
                ),
                data: (data) => _BudgetList(data: data),
              ),
            ),
          ),
        ],
      ),
    );
  }

}

class _MonthBar extends ConsumerWidget {
  const _MonthBar({required this.month});
  final ({int year, int month}) month;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final isCurrent = month.year == now.year && month.month == now.month;

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous month',
            onPressed: () => _step(ref, -1),
          ),
          Expanded(
            child: Center(
              child: Text(
                formatMonth(month.year, month.month),
                style: theme.textTheme.titleMedium,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next month',
            // There is nothing to show past the current month: budgets are
            // compared against spending, and the future has none.
            onPressed: isCurrent ? null : () => _step(ref, 1),
          ),
        ],
      ),
    );
  }

  void _step(WidgetRef ref, int delta) =>
      ref.read(visibleMonthProvider.notifier).step(delta);
}

class _BudgetList extends StatelessWidget {
  const _BudgetList({required this.data});
  final BudgetVsActual data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overview = data.overview(DateTime.now());

    if (!overview.hasData) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          Icon(Icons.pie_chart_outline,
              size: 40, color: theme.colorScheme.outline),
          const SizedBox(height: 16),
          Text(
            'Nothing budgeted for ${formatMonth(data.year, data.month)}.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 6),
          Text(
            'Budgets are created on the website.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      );
    }

    final categories = data.countedCategories
      ..sort((a, b) => b.percentage.compareTo(a.percentage));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _Summary(data: data, overview: overview),
        const SizedBox(height: 8),
        const Divider(height: 32),
        for (final category in categories)
          _CategoryTile(
            category: category,
            pace: overview.pace,
            currency: data.displayCurrency,
            converted: data.isConverted(category),
          ),
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.data, required this.overview});
  final BudgetVsActual data;
  final BudgetOverview overview;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final level = levelOf(overview.spent * 100);
    final verdictColor = switch (overview.verdict) {
      PaceVerdict.ahead => colorForLevel(BudgetLevel.close, theme.brightness),
      PaceVerdict.behind => colorForLevel(BudgetLevel.healthy, theme.brightness),
      PaceVerdict.onPace => theme.colorScheme.onSurfaceVariant,
    };
    final verdict = switch (overview.verdict) {
      PaceVerdict.ahead =>
        '${overview.deltaPoints.round()} points ahead of pace',
      PaceVerdict.behind =>
        '${overview.deltaPoints.abs().round()} points under pace',
      PaceVerdict.onPace => 'On pace',
    };

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        BudgetRing(
          spent: overview.spent,
          pace: overview.pace,
          level: level,
          label: formatPercent(overview.spent * 100),
          caption: 'spent',
        ),
        const SizedBox(width: 20),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                formatMoney(overview.actual, data.displayCurrency),
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              Text(
                'of ${formatMoney(overview.budget, data.displayCurrency)}',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
              Text(
                verdict,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: verdictColor, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 2),
              Text(
                overview.remaining >= 0
                    ? '${formatMoney(overview.remaining, data.displayCurrency)} left'
                    : '${formatMoney(overview.remaining.abs(), data.displayCurrency)} over',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              if (overview.droppedAsDuplicate > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    // Surfaced rather than hidden: the totals above exclude
                    // these, and an unexplained gap between this screen and
                    // the website would be worse than a line of explanation.
                    '${overview.droppedAsDuplicate} all-owner '
                    '${overview.droppedAsDuplicate == 1 ? 'budget' : 'budgets'} '
                    'left out of the total to avoid counting twice',
                    style: theme.textTheme.labelSmall
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.pace,
    required this.currency,
    required this.converted,
  });

  final BudgetCategory category;
  final double pace;
  final String currency;
  final bool converted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = colorForLevel(category.level, theme.brightness);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (category.icon.isNotEmpty) ...[
                Text(category.icon, style: const TextStyle(fontSize: 16)),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  category.typeName,
                  style: theme.textTheme.titleSmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                formatPercent(category.percentage),
                style: theme.textTheme.titleSmall
                    ?.copyWith(color: color, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 6),
          PacedBar(
            fraction: category.percentage / 100,
            pace: pace,
            level: category.level,
          ),
          const SizedBox(height: 4),
          DefaultTextStyle(
            style: theme.textTheme.bodySmall!
                .copyWith(color: theme.colorScheme.onSurfaceVariant),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${formatMoney(category.actual, currency)} '
                    'of ${formatMoney(category.budget, currency)}'
                    '${category.ownerName == null ? '' : ' · ${category.ownerName}'}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (converted)
                  // The stored limit is in another currency; showing only the
                  // converted figure would look wrong to whoever set it.
                  Text(
                    '${formatMoney(category.budgetOriginal, category.budgetCurrency)} '
                    'budgeted',
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

