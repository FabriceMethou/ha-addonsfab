import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/models/auth.dart';

/// Persists the server address and the session tokens.
///
/// Deliberately a plain class with no provider and no widget dependency: the
/// background sync that refreshes the home-screen widget runs in its own Dart
/// isolate, where nothing the app built at start-up exists. Everything from
/// here to a written snapshot has to be constructible cold.
///
/// It stores **tokens only**. The password is never written to the device, by
/// decision. The consequence is deliberate and visible: the refresh token lasts
/// 24 hours, so a widget left alone for longer cannot renew itself and says so
/// rather than showing stale figures as current.
class SessionStore {
  SessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Encryption is the default from v10 on: AES/GCM backed by the
              // Android Keystore. resetOnError is also the default, but it is
              // worth stating — a Keystore entry can be left undecryptable
              // after a device restore, and without it every read from then on
              // throws, stranding the app with no way back short of a
              // reinstall. Dropping the tokens costs one sign-in.
              aOptions: AndroidOptions(resetOnError: true),
            );

  final FlutterSecureStorage _storage;

  static const _kBaseUrl = 'base_url';
  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kUsername = 'username';
  static const _kIsAdmin = 'is_admin';

  /// Reads the whole session in one go.
  ///
  /// A half-written session — a server but no token, or a token with no server
  /// — is reported as the earliest stage it satisfies rather than trusted, so a
  /// crash mid-write cannot leave the app thinking it is signed in.
  Future<Session> read() async {
    final baseUrl = await _storage.read(key: _kBaseUrl);
    if (baseUrl == null || baseUrl.isEmpty) return Session.empty();

    final access = await _storage.read(key: _kAccess);
    final refresh = await _storage.read(key: _kRefresh);
    if (access == null || refresh == null) {
      return Session(stage: SessionStage.signedOut, baseUrl: baseUrl);
    }

    final username = await _storage.read(key: _kUsername) ?? '';
    final isAdmin = (await _storage.read(key: _kIsAdmin)) == 'true';

    return Session(
      stage: SessionStage.signedIn,
      baseUrl: baseUrl,
      accessToken: access,
      refreshToken: refresh,
      user: AuthUser(username: username, isAdmin: isAdmin),
    );
  }

  /// Records the server address, before anyone has signed in.
  Future<void> writeBaseUrl(String baseUrl) =>
      _storage.write(key: _kBaseUrl, value: normalizeBaseUrl(baseUrl));

  Future<String?> readBaseUrl() => _storage.read(key: _kBaseUrl);

  /// Reads just the bearer token.
  ///
  /// The HTTP layer wants this and nothing else. Going through [read] would
  /// make attaching a token depend on the server address also being on disk,
  /// which is a coupling with no reason to exist and one more way for a
  /// half-written session to produce unauthenticated requests.
  Future<String?> readAccessToken() => _storage.read(key: _kAccess);

  Future<String?> readRefreshToken() => _storage.read(key: _kRefresh);

  /// Stores a completed sign-in.
  ///
  /// Rejects a token pair that is still pending a second factor: those grant
  /// one call and would otherwise be persisted as if they were a real session.
  Future<void> writeTokens(AuthTokens tokens) async {
    final refresh = tokens.refreshToken;
    if (refresh == null) {
      throw StateError(
        'Refusing to persist a half-finished sign-in: this token still needs '
        'a second factor.',
      );
    }
    await _storage.write(key: _kAccess, value: tokens.accessToken);
    await _storage.write(key: _kRefresh, value: refresh);
    final user = tokens.user;
    if (user != null) {
      await _storage.write(key: _kUsername, value: user.username);
      await _storage.write(key: _kIsAdmin, value: user.isAdmin.toString());
    }
  }

  /// Replaces the access token alone, after a refresh.
  Future<void> writeAccessToken(String accessToken) =>
      _storage.write(key: _kAccess, value: accessToken);

  /// Clears the session but keeps the server address.
  ///
  /// Someone signing out, or a refresh token that has lapsed, should not have
  /// to type their server in again.
  Future<void> clearTokens() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kUsername);
    await _storage.delete(key: _kIsAdmin);
  }

  /// Forgets everything, including the server.
  Future<void> clearAll() => _storage.deleteAll();
}

/// Trims a typed-in server address into something safe to build URLs from.
///
/// Accepts what people actually paste — a trailing slash, stray whitespace, a
/// bare host — and defaults a scheme-less address to HTTPS rather than silently
/// falling back to plaintext against a public host.
String normalizeBaseUrl(String input) {
  var url = input.trim();
  if (url.isEmpty) return url;
  if (!url.contains('://')) url = 'https://$url';
  while (url.endsWith('/')) {
    url = url.substring(0, url.length - 1);
  }
  return url;
}
