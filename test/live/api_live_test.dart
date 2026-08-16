@Tags(['live'])
library;

import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/core/auth/session_store.dart';
import 'package:myfinance/core/net/api_exception.dart';
import 'package:myfinance/core/net/dio_client.dart';
import 'package:myfinance/data/finance_api.dart';
import 'package:myfinance/domain/budget_pace.dart';

/// Exercises the real network stack against a real backend.
///
/// Skipped unless `MYFINANCE_LIVE` names a server, so the ordinary suite stays
/// hermetic. Run it after touching the HTTP layer, where a fixture cannot tell
/// you whether the wire format is still right:
///
/// ```
/// MYFINANCE_LIVE=http://127.0.0.1:8199 \
/// MYFINANCE_USER=… MYFINANCE_PASS=… flutter test test/live
/// ```
///
/// It only ever reads, and signs in as whatever account you point it at.
void main() {
  final baseUrl = Platform.environment['MYFINANCE_LIVE'];
  final username = Platform.environment['MYFINANCE_USER'];
  final password = Platform.environment['MYFINANCE_PASS'];

  if (baseUrl == null || username == null || password == null) {
    test('live API checks', () {}, skip: 'set MYFINANCE_LIVE, _USER and _PASS');
    return;
  }

  late FinanceApi api;
  late SessionStore store;

  setUpAll(() {
    FlutterSecureStorage.setMockInitialValues({});
    store = SessionStore();
    api = FinanceApi(buildDio(baseUrl: baseUrl, store: store));
    return store.writeBaseUrl(baseUrl);
  });

  test('the health probe answers without a token', () async {
    final health = await api.health();
    expect(health.isHealthy, isTrue);
    expect(health.database, 'connected');
  });

  test('sign-in goes through as a form, not as JSON', () async {
    final tokens = await api.signIn(username: username, password: password);
    expect(tokens.accessToken, isNotEmpty);
    expect(tokens.awaitingMfa, isFalse,
        reason: 'this account is expected to have no second factor');
    expect(tokens.refreshToken, isNotNull);
    await store.writeTokens(tokens);
  });

  test('bad credentials come back as an unauthorized failure, readably',
      () async {
    try {
      await api.signIn(username: username, password: 'definitely-not-it');
      fail('expected the server to refuse');
    } on ApiException catch (e) {
      expect(e.failure, ApiFailure.unauthorized);
      expect(e.message, isNotEmpty);
      expect(e.needsSignIn, isTrue);
    }
  });

  test('the token is accepted on an authenticated endpoint', () async {
    final me = await api.me();
    expect(me.username, username);
  });

  test('the display currency is readable', () async {
    final settings = await api.settings();
    expect(settings.displayCurrency, isNotEmpty);
  });

  test('a month of budgets parses and paces', () async {
    final now = DateTime.now();
    final data = await api.budgetVsActual(now.year, now.month);

    expect(data.year, now.year);
    expect(data.month, now.month);
    expect(data.displayCurrency, isNotEmpty);

    final overview = data.overview(now);
    expect(overview.pace, closeTo(now.day / daysInMonth(now.year, now.month), 1e-9));
    for (final c in data.categories) {
      expect(c.level, levelOf(c.percentage));
      expect(c.percentage.isFinite, isTrue);
    }
  });

  test('an expired token is renewed and the call replayed', () async {
    // Poison the stored access token. The next call gets a 401, the
    // interceptor spends the refresh token, and the request is replayed —
    // all of which should be invisible from here.
    await store.writeAccessToken('not-a-valid-token');

    final me = await api.me();
    expect(me.username, username);

    final session = await store.read();
    expect(session.accessToken, isNot('not-a-valid-token'),
        reason: 'the renewed token should have been written back');
  });
}
