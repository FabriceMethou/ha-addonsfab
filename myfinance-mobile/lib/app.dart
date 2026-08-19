import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'domain/models/auth.dart';
import 'features/lock/app_lock.dart';
import 'features/shell/home_shell.dart';
import 'features/setup/setup_screen.dart';
import 'ui/theme.dart';

/// The router, rebuilt whenever the session stage changes.
///
/// Access is gated in one place rather than screen by screen, so a session that
/// lapses while a screen is open cannot leave that screen reachable.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
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
    // Watched rather than read so a change of stage rebuilds the router and the
    // redirect above runs again.
    ref.watch(sessionProvider);

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
