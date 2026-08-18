import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money.dart';
import '../../core/cache/cached.dart';
import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/models/reports.dart';
import '../../ui/theme.dart';
import '../../ui/views.dart';

/// How far back the charts look.
enum ReportRange {
  threeMonths(3, '3 months'),
  sixMonths(6, '6 months'),
  twelveMonths(12, '12 months');

  const ReportRange(this.months, this.label);
  final int months;
  final String label;
}

class ReportRangeController extends Notifier<ReportRange> {
  @override
  ReportRange build() => ReportRange.sixMonths;
  void set(ReportRange range) => state = range;
}

final reportRangeProvider =
    NotifierProvider<ReportRangeController, ReportRange>(
        ReportRangeController.new);

typedef ReportsData = ({
  NetWorthTrend trend,
  SpendingByCategory spending,
  IncomeVsExpenses flow,
});

final reportsProvider = FutureProvider<Cached<ReportsData>>((ref) async {
  final api = ref.watch(financeApiProvider);
  if (api == null) {
    throw const ApiException(ApiFailure.unknown, 'No server configured.');
  }
  final range = ref.watch(reportRangeProvider);

  final now = DateTime.now();
  final from = DateTime(now.year, now.month - (range.months - 1), 1);
  String iso(DateTime d) => '${d.year}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
  // The range ends today, not at month end: a future date would ask the server
  // for spending that has not happened.
  final start = iso(from);
  final end = iso(now);

  return withCache<ReportsData>(
    store: ref.watch(snapshotStoreProvider),
    // Keyed by range, so switching to 12 months offline shows the 12-month
    // figures if they were ever loaded rather than the 3-month ones relabelled.
    key: 'reports-${range.months}',
    fetch: () async {
      final results = await Future.wait([
        api.netWorthTrend(months: range.months),
        api.spendingByCategory(startDate: start, endDate: end),
        api.incomeVsExpenses(startDate: start, endDate: end),
      ]);
      return (
        trend: results[0] as NetWorthTrend,
        spending: results[1] as SpendingByCategory,
        flow: results[2] as IncomeVsExpenses,
      );
    },
    encode: (d) => {
      'trend': d.trend.toJson(),
      'spending': d.spending.toJson(),
      'flow': d.flow.toJson(),
    },
    decode: (j) => (
      trend: NetWorthTrend.fromJson(j['trend'] as Map<String, dynamic>),
      spending: SpendingByCategory.fromJson(j['spending'] as Map<String, dynamic>),
      flow: IncomeVsExpenses.fromJson(j['flow'] as Map<String, dynamic>),
    ),
  );
});

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(reportsProvider);
    final range = ref.watch(reportRangeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: const [OpenOnWebsiteButton(path: '/reports')],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: SegmentedButton<ReportRange>(
              segments: [
                for (final r in ReportRange.values)
                  ButtonSegment(value: r, label: Text(r.label)),
              ],
              selected: {range},
              showSelectedIcon: false,
              onSelectionChanged: (s) =>
                  ref.read(reportRangeProvider.notifier).set(s.first),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(reportsProvider.future),
              child: data.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => FailureView(
                  error: e,
                  onRetry: () => ref.invalidate(reportsProvider),
                ),
                data: (cached) => _Reports(
                  data: cached.value,
                  cached: cached,
                  onRetry: () => ref.invalidate(reportsProvider),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Reports extends StatelessWidget {
  const _Reports({
    required this.data,
    required this.cached,
    required this.onRetry,
  });
  final ReportsData data;
  final Cached<ReportsData> cached;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (cached.isStale)
          StaleBanner(fetchedAt: cached.fetchedAt, onRetry: onRetry),
        _NetWorthChart(trend: data.trend),
        const Divider(height: 36),
        _FlowSummary(flow: data.flow),
        const Divider(height: 36),
        _SpendingBreakdown(spending: data.spending),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(text, style: theme.textTheme.titleMedium)),
          ?trailing,
        ],
      ),
    );
  }
}

class _NetWorthChart extends StatelessWidget {
  const _NetWorthChart({required this.trend});
  final NetWorthTrend trend;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (!trend.hasData) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Net worth'),
          Text(
            // One point is not a trend. Drawing a line through it would imply
            // a direction the data does not support.
            'Not enough history yet to draw a trend.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      );
    }

    final change = trend.change ?? 0;
    final tone = change >= 0 ? SemanticTone.positive : SemanticTone.negative;
    final lineColor = colorForTone(tone, theme.brightness);

    // Padded so the curve never touches the frame, which reads as clipped.
    final span = (trend.maximum - trend.minimum).abs();
    final pad = span == 0 ? (trend.maximum.abs() * 0.1 + 1) : span * 0.15;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(
          'Net worth',
          trailing: Text(
            '${change >= 0 ? '+' : ''}'
            '${formatMoney(change, trend.currency)}',
            style: theme.textTheme.titleSmall
                ?.copyWith(color: lineColor, fontWeight: FontWeight.w600),
          ),
        ),
        Text(
          formatMoney(trend.currentNetWorth, trend.currency),
          style: theme.textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 170,
          child: LineChart(
            LineChartData(
              minY: trend.minimum - pad,
              maxY: trend.maximum + pad,
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: (span == 0 ? 1 : span) / 2,
                getDrawingHorizontalLine: (_) => FlLine(
                  color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
                  strokeWidth: 1,
                ),
              ),
              titlesData: FlTitlesData(
                topTitles: const AxisTitles(),
                rightTitles: const AxisTitles(),
                leftTitles: const AxisTitles(),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 26,
                    // Only the ends are labelled: a dozen month names at this
                    // width would overlap into noise.
                    interval: (trend.trend.length - 1).toDouble(),
                    getTitlesWidget: (value, meta) {
                      final i = value.round();
                      if (i < 0 || i >= trend.trend.length) {
                        return const SizedBox.shrink();
                      }
                      final label = trend.trend[i].month.split(' ').first;
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          label.length > 3 ? label.substring(0, 3) : label,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              borderData: FlBorderData(show: false),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipItems: (spots) => [
                    for (final s in spots)
                      LineTooltipItem(
                        '${trend.trend[s.x.round()].month}\n'
                        '${formatMoney(s.y, trend.currency)}',
                        theme.textTheme.bodySmall ?? const TextStyle(),
                      ),
                  ],
                ),
              ),
              lineBarsData: [
                LineChartBarData(
                  spots: [
                    for (var i = 0; i < trend.trend.length; i++)
                      FlSpot(i.toDouble(), trend.trend[i].netWorth),
                  ],
                  isCurved: true,
                  curveSmoothness: 0.2,
                  color: lineColor,
                  barWidth: 2.5,
                  dotData: FlDotData(
                    // Only the latest point is marked: it is the one that is
                    // actually a fact rather than a step along the way.
                    show: true,
                    checkToShowDot: (spot, _) =>
                        spot.x == trend.trend.length - 1,
                  ),
                  belowBarData: BarAreaData(
                    show: true,
                    color: lineColor.withValues(alpha: 0.12),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FlowSummary extends StatelessWidget {
  const _FlowSummary({required this.flow});
  final IncomeVsExpenses flow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = flow.income + flow.expenses;
    final incomeShare = total > 0 ? flow.income / total : 0.5;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(
          'In and out',
          trailing: Text(
            '${flow.isPositive ? '+' : ''}${formatMoney(flow.net, flow.currency)}',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: colorForTone(
                flow.isPositive ? SemanticTone.positive : SemanticTone.negative,
                theme.brightness,
              ),
            ),
          ),
        ),
        // A single split bar rather than two: the comparison is the point, and
        // side-by-side bars make it something to work out rather than see.
        if (total > 0)
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: Row(
              children: [
                Expanded(
                  flex: (incomeShare * 1000).round().clamp(1, 999),
                  child: Container(
                    height: 10,
                    color:
                        colorForTone(SemanticTone.positive, theme.brightness),
                  ),
                ),
                Expanded(
                  flex: ((1 - incomeShare) * 1000).round().clamp(1, 999),
                  child: Container(
                    height: 10,
                    color:
                        colorForTone(SemanticTone.negative, theme.brightness),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _Legend(
                label: 'In',
                value: formatMoney(flow.income, flow.currency),
                tone: SemanticTone.positive,
              ),
            ),
            Expanded(
              child: _Legend(
                label: 'Out',
                value: formatMoney(flow.expenses, flow.currency),
                tone: SemanticTone.negative,
                alignEnd: true,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({
    required this.label,
    required this.value,
    required this.tone,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final SemanticTone tone;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment:
              alignEnd ? MainAxisAlignment.end : MainAxisAlignment.start,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: colorForTone(tone, theme.brightness),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: theme.textTheme.labelMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
        Text(
          value,
          style:
              theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _SpendingBreakdown extends StatelessWidget {
  const _SpendingBreakdown({required this.spending});
  final SpendingByCategory spending;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ranked = spending.ranked;

    if (ranked.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Where it went'),
          Text(
            'No spending in this period.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(
          'Where it went',
          trailing: Text(
            formatMoney(spending.total, spending.currency),
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        for (final category in ranked)
          _CategoryBar(
            category: category,
            share: spending.shareOf(category),
            currency: spending.currency,
          ),
      ],
    );
  }
}

class _CategoryBar extends StatelessWidget {
  const _CategoryBar({
    required this.category,
    required this.share,
    required this.currency,
  });

  final CategorySpend category;
  final double share;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.category,
                  style: theme.textTheme.bodyMedium,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '${(share * 100).round()}%',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 10),
              Text(
                formatMoney(category.amount, currency),
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              // Share of total spending, not of a budget: no threshold applies,
              // so this stays a neutral accent rather than borrowing the
              // red/amber/green that means "against a limit".
              value: share.clamp(0.0, 1.0),
              minHeight: 6,
              color: theme.colorScheme.primary,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
            ),
          ),
        ],
      ),
    );
  }
}
