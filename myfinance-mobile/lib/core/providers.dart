import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/finance_api.dart';
import '../domain/models/auth.dart';
import 'auth/session_store.dart';
import 'cache/snapshot_store.dart';
import 'net/api_exception.dart';
import 'net/dio_client.dart';

/// Persistent session storage. Plain object, no widget dependency, so the same
/// instance construction works inside the widget's background isolate.
final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore());

/// Cached screen payloads, so the app opens on its last figures when offline.
final snapshotStoreProvider =
    Provider<SnapshotStore>((ref) => const SnapshotStore());

/// The current session. Async because the first read comes off encrypted disk.
final sessionProvider =
    AsyncNotifierProvider<SessionController, Session>(SessionController.new);

/// The HTTP client, rebuilt whenever the server address changes.
///
/// Null until a server has been configured — there is nothing to point a client
/// at before then.
final dioProvider = Provider<Dio?>((ref) {
  final session = ref.watch(sessionProvider).value;
  final baseUrl = session?.baseUrl;
  if (baseUrl == null || baseUrl.isEmpty) return null;

  return buildDio(
    baseUrl: baseUrl,
    store: ref.watch(sessionStoreProvider),
    // Fired from inside the interceptor when the refresh token is spent. The
    // session drops to signed-out; cached screens stay on display, clearly
    // marked, rather than emptying under someone mid-glance.
    onSessionLost: () => ref.read(sessionProvider.notifier).markSignedOut(),
  );
});

/// The API surface. Null while no server is configured.
final financeApiProvider = Provider<FinanceApi?>((ref) {
  final dio = ref.watch(dioProvider);
  return dio == null ? null : FinanceApi(dio);
});

/// Drives the sign-in flow and holds the tokens.
class SessionController extends AsyncNotifier<Session> {
  /// The short-lived token handed back when a second factor is outstanding.
  ///
  /// Deliberately kept in memory only: it lasts five minutes, authorises
  /// exactly one call, and writing it to disk would leave a half-finished
  /// sign-in looking like a real session after a crash.
  String? _pendingMfaToken;

  SessionStore get _store => ref.read(sessionStoreProvider);

  @override
  Future<Session> build() => _store.read();

  /// Records a server address after checking something is actually there.
  ///
  /// Throws [ApiException] if the address cannot be reached, so the setup
  /// screen can say what went wrong instead of failing later behind a password
  /// prompt.
  Future<void> connect(String baseUrl) async {
    final normalized = normalizeBaseUrl(baseUrl);
    if (normalized.isEmpty) {
      throw const ApiException(ApiFailure.unknown, 'Enter a server address.');
    }

    // A throwaway client: the shared one is wired to the address that is being
    // replaced, which may be none at all.
    final probe = buildDio(baseUrl: normalized, store: _store);
    try {
      final health = await FinanceApi(probe).health();
      if (!health.isHealthy) {
        throw const ApiException(
          ApiFailure.server,
          'The server answered, but reports it is not healthy.',
        );
      }
    } finally {
      probe.close();
    }

    await _store.writeBaseUrl(normalized);
    state = AsyncData(
      Session(stage: SessionStage.signedOut, baseUrl: normalized),
    );
  }

  /// Exchanges credentials for a session.
  ///
  /// Returns true when signed in, false when a second factor is still needed —
  /// at which point the state moves to [SessionStage.awaitingMfa] and
  /// [submitMfaCode] finishes the job.
  Future<bool> signIn({
    required String username,
    required String password,
  }) async {
    final api = ref.read(financeApiProvider);
    final current = state.value;
    if (api == null || current?.baseUrl == null) {
      throw const ApiException(ApiFailure.unknown, 'Choose a server first.');
    }

    final tokens = await api.signIn(username: username, password: password);

    if (tokens.awaitingMfa) {
      _pendingMfaToken = tokens.accessToken;
      state = AsyncData(current!.copyWith(stage: SessionStage.awaitingMfa));
      return false;
    }

    await _adopt(tokens, current!.baseUrl!);
    return true;
  }

  /// Completes a sign-in that was waiting on a second factor.
  Future<void> submitMfaCode(String code) async {
    final api = ref.read(financeApiProvider);
    final pending = _pendingMfaToken;
    final current = state.value;
    if (api == null || pending == null || current?.baseUrl == null) {
      throw const ApiException(
        ApiFailure.unauthorized,
        'That sign-in attempt has expired. Start again.',
      );
    }

    final tokens = await api.verifyMfa(pendingToken: pending, code: code);
    await _adopt(tokens, current!.baseUrl!);
  }

  /// Drops the tokens but keeps the server, so signing back in is one step.
  Future<void> signOut() async {
    _pendingMfaToken = null;
    await _store.clearTokens();
    // Cached figures go with the session: the next person to sign in must not
    // find the previous account's balances waiting behind the lock screen.
    await ref.read(snapshotStoreProvider).clear();
    final baseUrl = await _store.readBaseUrl();
    state = AsyncData(
      baseUrl == null
          ? Session.empty()
          : Session(stage: SessionStage.signedOut, baseUrl: baseUrl),
    );
  }

  /// Forgets the server too.
  Future<void> forgetServer() async {
    _pendingMfaToken = null;
    await _store.clearAll();
    await ref.read(snapshotStoreProvider).clear();
    state = AsyncData(Session.empty());
  }

  /// Called by the HTTP layer when a refresh token is refused.
  ///
  /// Does not clear the cache: the point of this state is that figures stay
  /// visible and are labelled stale, rather than vanishing.
  void markSignedOut() {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        stage: SessionStage.signedOut,
        accessToken: null,
        refreshToken: null,
      ),
    );
  }

  Future<void> _adopt(AuthTokens tokens, String baseUrl) async {
    await _store.writeTokens(tokens);
    _pendingMfaToken = null;
    state = AsyncData(
      Session(
        stage: SessionStage.signedIn,
        baseUrl: baseUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
      ),
    );
  }
}
