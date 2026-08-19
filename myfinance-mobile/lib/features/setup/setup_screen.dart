import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/net/api_exception.dart';
import '../../core/providers.dart';
import '../../domain/models/auth.dart';

/// Server address, then credentials, then a second factor if the account has
/// one. Which step shows follows the session state rather than local flags, so
/// a session that lapses mid-flow lands somewhere coherent.
class SetupScreen extends ConsumerWidget {
  const SetupScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: session.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _Message(text: '$e'),
                data: (s) => switch (s.stage) {
                  SessionStage.unconfigured => const _ServerStep(),
                  SessionStage.signedOut => _CredentialsStep(baseUrl: s.baseUrl!),
                  SessionStage.awaitingMfa => const _MfaStep(),
                  SessionStage.signedIn => const _Message(text: 'Signed in.'),
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text(text);
}

/// Shows a failure in the wording the network layer produced.
class _Failure extends StatelessWidget {
  const _Failure(this.error);
  final Object error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final message =
        error is ApiException ? (error as ApiException).message : '$error';
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: TextStyle(color: scheme.onErrorContainer),
      ),
    );
  }
}

class _ServerStep extends ConsumerStatefulWidget {
  const _ServerStep();
  @override
  ConsumerState<_ServerStep> createState() => _ServerStepState();
}

class _ServerStepState extends ConsumerState<_ServerStep> {
  final _controller = TextEditingController();
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).connect(_controller.text);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Header(
          title: 'Connect to your tracker',
          subtitle: 'The same address you open MyFinance at in a browser.',
        ),
        if (_error != null) _Failure(_error!),
        TextField(
          controller: _controller,
          autofocus: true,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Server address',
            hintText: 'finance.example.com',
            helperText: 'Uses HTTPS unless you type http:// yourself.',
          ),
          onSubmitted: (_) => _busy ? null : _submit(),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Test connection'),
        ),
      ],
    );
  }
}

class _CredentialsStep extends ConsumerStatefulWidget {
  const _CredentialsStep({required this.baseUrl});
  final String baseUrl;
  @override
  ConsumerState<_CredentialsStep> createState() => _CredentialsStepState();
}

class _CredentialsStepState extends ConsumerState<_CredentialsStep> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  Object? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).signIn(
            username: _username.text.trim(),
            password: _password.text,
          );
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Header(title: 'Sign in', subtitle: widget.baseUrl),
        if (_error != null) _Failure(_error!),
        TextField(
          controller: _username,
          autofocus: true,
          autocorrect: false,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Username'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: _obscure,
          decoration: InputDecoration(
            labelText: 'Password',
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
              onPressed: () => setState(() => _obscure = !_obscure),
              tooltip: _obscure ? 'Show password' : 'Hide password',
            ),
          ),
          onSubmitted: (_) => _busy ? null : _submit(),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Sign in'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy
              ? null
              : () => ref.read(sessionProvider.notifier).forgetServer(),
          child: const Text('Use a different server'),
        ),
      ],
    );
  }
}

class _MfaStep extends ConsumerStatefulWidget {
  const _MfaStep();
  @override
  ConsumerState<_MfaStep> createState() => _MfaStepState();
}

class _MfaStepState extends ConsumerState<_MfaStep> {
  final _code = TextEditingController();
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).submitMfaCode(_code.text.trim());
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Header(
          title: 'Two-factor code',
          subtitle: 'Enter the six-digit code from your authenticator app. '
              'This step expires after five minutes.',
        ),
        if (_error != null) _Failure(_error!),
        TextField(
          controller: _code,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: 'Code', counterText: ''),
          onSubmitted: (_) => _busy ? null : _submit(),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Verify'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed:
              _busy ? null : () => ref.read(sessionProvider.notifier).signOut(),
          child: const Text('Start over'),
        ),
      ],
    );
  }
}
