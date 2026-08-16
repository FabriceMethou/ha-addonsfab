import 'package:dio/dio.dart';

import '../core/net/api_exception.dart';
import '../domain/models/auth.dart';
import '../domain/models/budget.dart';
import '../domain/models/settings.dart';

/// Runs a call and lets [ApiException] through instead of dio's wrapper.
///
/// Dio can only ever throw `DioException`, so the readable error the
/// interceptor built ends up buried in its `error` field. Without unwrapping
/// here every `catch (e) { if (e is ApiException) … }` upstream — including the
/// error views — silently takes the fallback branch and shows a stack trace
/// where a sentence belonged.
Future<T> _unwrapped<T>(Future<T> Function() body) async {
  try {
    return await body();
  } on DioException catch (e) {
    final inner = e.error;
    if (inner is ApiException) throw inner;
    throw ApiException(
      ApiFailure.unknown,
      e.message ?? defaultMessage(ApiFailure.unknown),
    );
  }
}

/// The only way this app talks to the backend.
///
/// Financial data is reachable through `GET` alone. The three `POST`s below all
/// concern authentication, and there is deliberately no method here that could
/// create, change or delete a transaction, account or budget — the read-only
/// promise is held by the shape of this class rather than by remembering to
/// keep it.
class FinanceApi {
  const FinanceApi(this._dio);

  final Dio _dio;

  // ---------------------------------------------------------------- auth

  /// Checks a server address without needing credentials.
  ///
  /// `/health` is the one unauthenticated endpoint, which makes it exactly
  /// right for the "test connection" step before anyone types a password.
  Future<HealthStatus> health() => _unwrapped(() async {
        final r = await _dio.get<Map<String, dynamic>>('/health');
        return HealthStatus.fromJson(r.data ?? const {});
      });

  /// Exchanges a username and password for tokens.
  ///
  /// This endpoint — and only this one — expects
  /// `application/x-www-form-urlencoded`, because the backend wires it to
  /// FastAPI's `OAuth2PasswordRequestForm`. Sending JSON here returns a 422
  /// whose message does not point at the cause.
  ///
  /// When the account carries a second factor, the response has no refresh
  /// token: see [AuthTokens.awaitingMfa].
  Future<AuthTokens> signIn({
    required String username,
    required String password,
  }) =>
      _unwrapped(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/api/auth/token',
          data: FormData.fromMap({'username': username, 'password': password}),
        );
        return AuthTokens.fromJson(r.data ?? const {});
      });

  /// Completes a sign-in that is waiting on a second factor.
  ///
  /// [pendingToken] is the short-lived token from [signIn]; it authorises this
  /// call and nothing else.
  Future<AuthTokens> verifyMfa({
    required String pendingToken,
    required String code,
  }) =>
      _unwrapped(() async {
        final r = await _dio.post<Map<String, dynamic>>(
          '/api/auth/mfa/verify',
          data: {'token': code},
          options: Options(headers: {'Authorization': 'Bearer $pendingToken'}),
        );
        return AuthTokens.fromJson(r.data ?? const {});
      });

  Future<AuthUser> me() => _unwrapped(() async {
        final r = await _dio.get<Map<String, dynamic>>('/api/auth/me');
        return AuthUser.fromJson(r.data ?? const {});
      });

  // ------------------------------------------------------------- settings

  /// The server-side preferences, chiefly the display currency every report
  /// and budget figure is already expressed in.
  Future<AppSettings> settings() => _unwrapped(() async {
        final r = await _dio.get<Map<String, dynamic>>('/api/settings/');
        return SettingsResponse.fromJson(r.data ?? const {}).settings;
      });

  // -------------------------------------------------------------- budgets

  /// A month of budgets against actual spending.
  ///
  /// One call fills the entire home-screen widget: the server has already
  /// aggregated spending, converted currencies and computed each percentage.
  Future<BudgetVsActual> budgetVsActual(int year, int month) =>
      _unwrapped(() async {
        final r = await _dio.get<Map<String, dynamic>>(
          '/api/budgets/vs-actual/$year/$month',
        );
        return BudgetVsActual.fromJson(r.data ?? const {});
      });
}
