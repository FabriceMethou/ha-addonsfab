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
