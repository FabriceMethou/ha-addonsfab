import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

import '../auth/session_store.dart';
import '../../domain/models/auth.dart';
import 'api_exception.dart';

/// Paths that must never carry a bearer token or trigger a refresh.
const _authFreePaths = {'/health', '/api/auth/token', '/api/auth/refresh'};

/// Marks a request that has already been retried once after a refresh, so a
/// server that keeps answering 401 cannot put us in a loop.
const _retriedKey = 'myfinance.retried';

/// Builds the HTTP client the whole app shares.
///
/// [onSessionLost] fires when the refresh token is spent or rejected. The app
/// uses it to drop to the signed-out state while keeping cached data on screen;
/// the widget isolate uses it to mark its snapshot stale rather than blanking
/// figures a person may be relying on.
Dio buildDio({
  required String baseUrl,
  required SessionStore store,
  void Function()? onSessionLost,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: normalizeBaseUrl(baseUrl),
      // Matched to the nginx in front of the backend rather than set tighter,
      // so the client never gives up on a request the server is still serving.
      connectTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 120),
      responseType: ResponseType.json,
      // Let every status through to the interceptor, which turns bodies into
      // readable messages before anything else sees them.
      validateStatus: (_) => true,
    ),
  );

  dio.interceptors.add(AuthInterceptor(
    store: store,
    dio: dio,
    onSessionLost: onSessionLost,
  ));
  dio.interceptors.add(ErrorInterceptor());
  return dio;
}

/// Attaches the bearer token and renews it once when the server says it is
/// stale.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.store,
    required this.dio,
    this.onSessionLost,
  });

  final SessionStore store;
  final Dio dio;
  final void Function()? onSessionLost;

  /// The refresh in flight, if any.
  ///
  /// Several screens usually load at once, so a lapsed access token produces a
  /// burst of 401s. Without this, each would spend the refresh token
  /// separately; the server rotates it on use, so all but the first would fail
  /// and the session would be thrown away while still perfectly valid.
  Future<String?>? _inFlight;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isAuthFree(options.path)) {
      final token = await store.readAccessToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onResponse(
    Response response,
    ResponseInterceptorHandler handler,
  ) async {
    if (response.statusCode != 401 ||
        _isAuthFree(response.requestOptions.path) ||
        response.requestOptions.extra[_retriedKey] == true) {
      handler.next(response);
      return;
    }

    final token = await _refreshOnce();
    if (token == null) {
      await store.clearTokens();
      onSessionLost?.call();
      handler.next(response);
      return;
    }

    try {
      final retried = await dio.fetch(
        response.requestOptions
          ..headers['Authorization'] = 'Bearer $token'
          ..extra[_retriedKey] = true,
      );
      handler.resolve(retried);
    } on DioException catch (e) {
      handler.next(e.response ?? response);
    }
  }

  /// Renews the token pair, collapsing concurrent callers onto one exchange.
  Future<String?> _refreshOnce() {
    final existing = _inFlight;
    if (existing != null) return existing;

    final attempt = _performRefresh();
    _inFlight = attempt;
    return attempt.whenComplete(() => _inFlight = null);
  }

  Future<String?> _performRefresh() async {
    final refresh = await store.readRefreshToken();
    if (refresh == null) return null;

    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/api/auth/refresh',
        data: {'refresh_token': refresh},
      );
      final body = response.data;
      if (response.statusCode != 200 || body == null) return null;

      // The backend rotates the refresh token on every exchange, so the new
      // one has to be stored or the next renewal fails.
      final tokens = AuthTokens.fromJson(body);
      if (tokens.refreshToken == null) return null;
      await store.writeTokens(tokens);
      return tokens.accessToken;
    } on DioException {
      return null;
    }
  }

  bool _isAuthFree(String path) =>
      _authFreePaths.any((p) => path == p || path.endsWith(p));
}

/// Converts transport failures and error statuses into [ApiException].
///
/// Runs last so it sees whatever the auth interceptor decided.
class ErrorInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final status = response.statusCode ?? 0;
    if (status >= 200 && status < 300) {
      handler.next(response);
      return;
    }
    final failure = failureFromStatus(status);
    handler.reject(
      DioException(
        requestOptions: response.requestOptions,
        response: response,
        error: ApiException(
          failure,
          messageFromBody(response.data) ?? defaultMessage(failure),
          statusCode: status,
        ),
      ),
    );
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.error is ApiException) {
      handler.next(err);
      return;
    }
    handler.next(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        error: _translate(err),
      ),
    );
  }

  ApiException _translate(DioException err) {
    // A bad certificate must be named as such. Reporting it as "no network"
    // sends people looking at their Wi-Fi for a problem that is on the server.
    final cause = err.error;
    if (cause is HandshakeException ||
        (cause is TlsException) ||
        (cause is SocketException && cause.osError?.message.contains('certificate') == true)) {
      return const ApiException(ApiFailure.tls, '', statusCode: null)
          ._withDefaultMessage();
    }

    final failure = switch (err.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.connectionError =>
        ApiFailure.offline,
      DioExceptionType.badCertificate => ApiFailure.tls,
      DioExceptionType.badResponse => failureFromStatus(err.response?.statusCode),
      // A wildcard rather than an exhaustive list: dio has added cases before
      // (transformTimeout in 5.x) and a new one should degrade to a generic
      // message, not stop the app compiling.
      _ => ApiFailure.unknown,
    };

    return ApiException(
      failure,
      messageFromBody(err.response?.data) ?? defaultMessage(failure),
      statusCode: err.response?.statusCode,
    );
  }
}

extension on ApiException {
  ApiException _withDefaultMessage() =>
      ApiException(failure, defaultMessage(failure), statusCode: statusCode);
}
