import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money.dart';
import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/budget_pace.dart';
import '../../domain/models/budget.dart';
import '../../ui/theme.dart';

/// Fetches the current month's budgets.
///
/// A placeholder home for now: the designed budget screen and the home-screen
/// widget both arrive next. What it proves today is the whole chain — stored
/// tokens, HTTP with refresh, parsing, and the pace engine — against a real
/// server.
final currentMonthBudgetProvider = FutureProvider<BudgetVsActual>((ref) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) {
    throw const ApiException(ApiFailure.unknown, 'No server configured.');
  }
  final now = DateTime.now();
  return api.budgetVsActual(now.year, now.month);
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budget = ref.watch(currentMonthBudgetProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('This month'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => ref.read(sessionProvider.notifier).signOut(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(currentMonthBudgetProvider.future),
        child: budget.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(
            error: e,
            onRetry: () => ref.invalidate(currentMonthBudgetProvider),
          ),
          data: (data) => _Overview(data: data),
        ),
      ),
    );
  }
}

class _Overview extends StatelessWidget {
  const _Overview({required this.data});
  final BudgetVsActual data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overview = data.overview(DateTime.now());

    if (!overview.hasData) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text('No active budgets for ${formatMonth(data.year, data.month)}.',
              style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            'Create one on the website and it will appear here.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      );
    }

    final verdict = switch (overview.verdict) {
      PaceVerdict.ahead =>
        '${overview.deltaPoints.round()} points ahead of pace',
      PaceVerdict.behind =>
        '${overview.deltaPoints.abs().round()} points under pace',
      PaceVerdict.onPace => 'On pace',
    };

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(formatMonth(data.year, data.month),
            style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          '${formatPercent(overview.spent * 100)} spent · '
          '${formatPercent(overview.pace * 100)} of the month gone · $verdict',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        Text(
          '${formatMoney(overview.actual, data.displayCurrency)} '
          'of ${formatMoney(overview.budget, data.displayCurrency)}',
          style: theme.textTheme.headlineSmall,
        ),
        Text(
          '${formatMoney(overview.remaining, data.displayCurrency)} left',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 20),
        for (final category in data.countedCategories)
          _CategoryRow(category: category, currency: data.displayCurrency),
      ],
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.category, required this.currency});
  final BudgetCategory category;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = colorForLevel(category.level, theme.brightness);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.typeName,
                  style: theme.textTheme.bodyLarge,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                formatPercent(category.percentage),
                style: theme.textTheme.bodyLarge
                    ?.copyWith(fontWeight: FontWeight.w600, color: color),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              // The bar stops at full while the figure beside it keeps the real
              // number: a bar cannot show 443 %, but hiding it would be a lie.
              value: (category.percentage / 100).clamp(0.0, 1.0),
              minHeight: 6,
              color: color,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${formatMoney(category.actual, currency)} '
            'of ${formatMoney(category.budget, currency)}'
            '${category.ownerName == null ? '' : ' · ${category.ownerName}'}',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final message =
        error is ApiException ? (error as ApiException).message : '$error';
    final retryable = error is! ApiException || (error as ApiException).isRetryable;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 48),
        Icon(Icons.cloud_off, size: 40, color: Theme.of(context).colorScheme.outline),
        const SizedBox(height: 16),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        if (retryable)
          FilledButton.tonal(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}
