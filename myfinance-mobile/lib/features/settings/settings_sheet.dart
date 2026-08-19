import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../lock/app_lock.dart';

/// The few things worth changing on the phone.
///
/// Everything else — currencies, categories, budgets — belongs to the website,
/// which owns the data. This holds only what is a property of *this device*.
class SettingsSheet extends ConsumerWidget {
  const SettingsSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        builder: (_) => const SettingsSheet(),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final session = ref.watch(sessionProvider).value;
    final lock = ref.watch(lockSettingsProvider);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
            child: Text('Settings', style: theme.textTheme.titleLarge),
          ),

          FutureBuilder<bool>(
            future: LockSettings.isSupported(),
            builder: (context, snapshot) {
              final supported = snapshot.data;
              // Until the device has answered, show the switch rather than
              // flashing a "not available" line that then disappears.
              if (supported == false) {
                return ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: const Text('Lock with biometrics'),
                  subtitle: const Text(
                    'This device has no fingerprint, face unlock or screen lock '
                    'set up.',
                  ),
                  enabled: false,
                );
              }
              return SwitchListTile(
                secondary: const Icon(Icons.lock_outline),
                title: const Text('Lock with biometrics'),
                subtitle: const Text(
                  'Ask to unlock when the app has been in the background for '
                  'more than 30 seconds.',
                ),
                value: lock.value ?? false,
                onChanged: lock.isLoading
                    ? null
                    : (v) =>
                        ref.read(lockSettingsProvider.notifier).setEnabled(v),
              );
            },
          ),

          const Divider(height: 1),

          ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: const Text('Server'),
            subtitle: Text(session?.baseUrl ?? 'Not configured'),
          ),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Signed in as'),
            subtitle: Text(session?.user?.username ?? 'Unknown'),
          ),

          const Divider(height: 1),

          ListTile(
            leading: Icon(Icons.logout, color: theme.colorScheme.error),
            title: Text('Sign out', style: TextStyle(color: theme.colorScheme.error)),
            subtitle: const Text('Keeps the server address for next time.'),
            onTap: () {
              Navigator.of(context).pop();
              ref.read(sessionProvider.notifier).signOut();
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
