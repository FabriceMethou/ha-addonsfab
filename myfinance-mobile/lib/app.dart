import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'domain/models/auth.dart';
import 'features/lock/app_lock.dart';
import 'features/shell/home_shell.dart';
import 'features/setup/setup_screen.dart';
import 'ui/theme.dart';

/// Turns a change of session stage into something GoRouter will listen to.
///
/// GoRouter re-runs its redirect when a [Listenable] fires, not when the widget
/// around it rebuilds, and it holds one router for the life of the app. Without
/// this bridge the redirect below runs once at startup and never again: signing
/// in leaves the setup screen on display, already signed in, with no way out.
///
/// Only the stage is worth a refresh. Tokens rotate underneath an unchanged
/// stage, and re-running every redirect for that would be churn.
class _SessionStageRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

/// The router, re-evaluated whenever the session stage changes.
///
/// Access is gated in one place rather than screen by screen, so a session that
/// lapses while a screen is open cannot leave that screen reachable.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionStageRefresh();
  ref.onDispose(refresh.dispose);
  ref.listen<AsyncValue<Session>>(sessionProvider, (previous, next) {
    if (previous?.value?.stage != next.value?.stage) refresh.ping();
  });

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider).value;
      // Still reading encrypted storage: hold position rather than bouncing
      // through the setup screen for a frame.
      if (session == null) return null;

      final signedIn = session.stage == SessionStage.signedIn;
      final atSetup = state.matchedLocation == '/setup';

      if (!signedIn && !atSetup) return '/setup';
      if (signedIn && atSetup) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const HomeShell()),
      GoRoute(path: '/setup', builder: (_, _) => const SetupScreen()),
    ],
  );
});

class MyFinanceApp extends ConsumerWidget {
  const MyFinanceApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'MyFinance',
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.system,
      routerConfig: ref.watch(routerProvider),
      // Wraps whatever the router built, so the gate covers every screen
      // including the sign-in flow.
      builder: (context, child) => AppLock(child: child ?? const SizedBox()),
    );
  }
}
