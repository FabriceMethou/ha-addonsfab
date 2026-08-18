import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/net/api_exception.dart';
import '../core/providers.dart';

/// Shows a failure in the wording the network layer produced, and offers a
/// retry only where one could actually work.
///
/// Scrollable so it still works as a RefreshIndicator child: a pull to refresh
/// has to remain possible on the very screen that failed to load.
class FailureView extends StatelessWidget {
  const FailureView({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final api = error is ApiException ? error as ApiException : null;
    final canRetry = onRetry != null && (api == null || api.isRetryable);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 48),
        Icon(
          api?.failure == ApiFailure.tls ? Icons.gpp_bad : Icons.cloud_off,
          size: 40,
          color: theme.colorScheme.outline,
        ),
        const SizedBox(height: 16),
        Text(api?.message ?? '$error', textAlign: TextAlign.center),
        const SizedBox(height: 16),
        if (canRetry)
          FilledButton.tonal(
            onPressed: onRetry,
            child: const Text('Try again'),
          ),
      ],
    );
  }
}

/// Empty state for a screen that loaded fine and simply has nothing to show.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    this.detail,
  });

  final IconData icon;
  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 40),
        Icon(icon, size: 40, color: theme.colorScheme.outline),
        const SizedBox(height: 16),
        Text(title, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
        if (detail != null) ...[
          const SizedBox(height: 6),
          Text(
            detail!,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

/// Hands off to the website.
///
/// This app only reads, so every change starts here: notice something on the
/// phone, open the page that can fix it. [path] is a route on the site, such as
/// `/budgets`.
class OpenOnWebsiteButton extends ConsumerWidget {
  const OpenOnWebsiteButton({super.key, required this.path});

  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      icon: const Icon(Icons.open_in_new),
      tooltip: 'Open on the website',
      onPressed: () async {
        final baseUrl = ref.read(sessionProvider).value?.baseUrl;
        if (baseUrl == null) return;

        final uri = Uri.parse('$baseUrl$path');
        final opened =
            await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (!opened && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not open $uri')),
          );
        }
      },
    );
  }
}

/// Says that what is on screen came off disk because the server was
/// unreachable, and how old it is.
///
/// Shown rather than hidden, and above the figures rather than below: someone
/// glancing at a balance has to know it might have moved. The alternative —
/// presenting yesterday's number as today's — is the one thing a finance app
/// must not do.
class StaleBanner extends StatelessWidget {
  const StaleBanner({super.key, required this.fetchedAt, this.onRetry});

  final DateTime fetchedAt;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Offline — showing figures from ${_ago(fetchedAt)}.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 10),
              ),
              child: const Text('Retry'),
            ),
        ],
      ),
    );
  }

  /// Rough is the point: "3 hours ago" answers the question people actually
  /// have, where a timestamp makes them do the subtraction themselves.
  static String _ago(DateTime then) {
    final d = DateTime.now().difference(then);
    if (d.inMinutes < 1) return 'a moment ago';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) {
      return '${d.inHours} ${d.inHours == 1 ? 'hour' : 'hours'} ago';
    }
    if (d.inDays < 30) {
      return '${d.inDays} ${d.inDays == 1 ? 'day' : 'days'} ago';
    }
    return 'over a month ago';
  }
}
