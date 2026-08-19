import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../../core/auth/session_store.dart';

/// How long the app may sit in the background before it locks again.
///
/// Short enough that a borrowed phone is protected, long enough that switching
/// to a bank app to check a figure and coming straight back does not demand a
/// fingerprint. Re-prompting on every glance is how people turn the lock off.
const _graceperiod = Duration(seconds: 30);

/// Whether the lock is on, and whether the device can do it at all.
class LockSettings extends AsyncNotifier<bool> {
  static const _key = 'biometric_lock';

  @override
  Future<bool> build() async {
    if (!await isSupported()) return false;
    final stored = await SessionStore().readFlag(_key);
    // On by default. A phone left unlocked for thirty seconds otherwise exposes
    // the whole household's finances, and defaults are what most people keep.
    return stored ?? true;
  }

  Future<void> setEnabled(bool value) async {
    await SessionStore().writeFlag(_key, value);
    state = AsyncData(value);
  }

  /// Whether this device has a biometric or device credential set up.
  static Future<bool> isSupported() async {
    final auth = LocalAuthentication();
    try {
      return await auth.isDeviceSupported();
    } on Exception {
      return false;
    }
  }
}

final lockSettingsProvider =
    AsyncNotifierProvider<LockSettings, bool>(LockSettings.new);

/// Gates the app behind a device unlock.
///
/// Wraps the whole app rather than individual screens: the widget snapshot on
/// the home screen already shows headline figures by design, but everything
/// inside the app — balances, transactions, who spent what — should not be one
/// tap away on an unlocked phone someone else is holding.
class AppLock extends ConsumerStatefulWidget {
  const AppLock({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppLock> createState() => _AppLockState();
}

class _AppLockState extends ConsumerState<AppLock> with WidgetsBindingObserver {
  bool _unlocked = false;
  bool _prompting = false;
  DateTime? _backgroundedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _backgroundedAt = DateTime.now();
      case AppLifecycleState.resumed:
        final since = _backgroundedAt;
        if (since != null && DateTime.now().difference(since) > _graceperiod) {
          setState(() => _unlocked = false);
        }
        _backgroundedAt = null;
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  Future<void> _unlock() async {
    if (_prompting) return;
    setState(() => _prompting = true);
    try {
      final ok = await LocalAuthentication().authenticate(
        localizedReason: 'Unlock MyFinance',
        // Device PIN or pattern is accepted too: a fingerprint that stops
        // working must not lock someone out of their own figures.
        biometricOnly: false,
        // Survives the prompt itself sending the app to the background, which
        // otherwise reads as a cancellation on some devices.
        persistAcrossBackgrounding: true,
      );
      if (mounted && ok) setState(() => _unlocked = true);
    } on Exception {
      // Any platform failure — no enrolled biometric, hardware busy — must not
      // leave the app permanently unopenable.
      if (mounted) setState(() => _unlocked = true);
    } finally {
      if (mounted) setState(() => _prompting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = ref.watch(lockSettingsProvider);

    // While the setting is still being read, show the app rather than a lock
    // screen that might not be wanted: a flash of a padlock on every cold start
    // would be worse than the half-second of exposure.
    final locked = (enabled.value ?? false) && !_unlocked;
    if (!locked) return widget.child;

    return _LockScreen(busy: _prompting, onUnlock: _unlock);
  }
}

class _LockScreen extends StatefulWidget {
  const _LockScreen({required this.busy, required this.onUnlock});
  final bool busy;
  final VoidCallback onUnlock;

  @override
  State<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<_LockScreen> {
  @override
  void initState() {
    super.initState();
    // Prompt straight away: making someone tap a button first adds a step
    // without adding anything.
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onUnlock());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 44, color: theme.colorScheme.outline),
            const SizedBox(height: 20),
            Text('MyFinance is locked', style: theme.textTheme.titleMedium),
            const SizedBox(height: 20),
            if (!widget.busy)
              FilledButton.tonal(
                onPressed: widget.onUnlock,
                child: const Text('Unlock'),
              ),
          ],
        ),
      ),
    );
  }
}
