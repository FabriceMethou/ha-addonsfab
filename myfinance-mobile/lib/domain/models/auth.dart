import 'package:freezed_annotation/freezed_annotation.dart';

import 'converters.dart';

part 'auth.freezed.dart';
part 'auth.g.dart';

/// The signed-in account, as `/api/auth/token` and `/api/auth/me` describe it.
///
/// The boolean fields go through [LenientBool] because they do not all arrive
/// as booleans: `is_admin` is computed in Python and serialises as one, while
/// `mfa_enabled` comes straight off a SQLite row and arrives as 0 or 1.
@freezed
abstract class AuthUser with _$AuthUser {
  const factory AuthUser({
    @Default('') String username,
    @JsonKey(name: 'is_admin') @LenientBool() @Default(false) bool isAdmin,

    /// Present on the login response, absent from `/me`.
    @JsonKey(name: 'mfa_enabled') @LenientBool() @Default(false) bool mfaEnabled,

    /// Set only when the server is holding the session pending a second factor.
    @JsonKey(name: 'mfa_required')
    @LenientBool()
    @Default(false)
    bool mfaRequired,
  }) = _AuthUser;

  factory AuthUser.fromJson(Map<String, dynamic> json) =>
      _$AuthUserFromJson(json);
}

/// A token response.
///
/// When the account has a second factor, the server answers the password step
/// with a short-lived token carrying `mfa_pending` and **no refresh token**;
/// that token authorises exactly one call, to `/api/auth/mfa/verify`. So
/// [refreshToken] being null is not a malformed response — it is the signal
/// that the sign-in is only half done.
@freezed
abstract class AuthTokens with _$AuthTokens {
  const factory AuthTokens({
    @JsonKey(name: 'access_token') required String accessToken,
    @JsonKey(name: 'refresh_token') String? refreshToken,
    @JsonKey(name: 'token_type') @Default('bearer') String tokenType,
    AuthUser? user,
  }) = _AuthTokens;

  const AuthTokens._();

  factory AuthTokens.fromJson(Map<String, dynamic> json) =>
      _$AuthTokensFromJson(json);

  /// Whether a second factor still has to be supplied.
  bool get awaitingMfa => user?.mfaRequired == true || refreshToken == null;
}

/// How far along the session is.
enum SessionStage {
  /// No server configured yet.
  unconfigured,

  /// Server known, nobody signed in.
  signedOut,

  /// Password accepted, second factor outstanding.
  awaitingMfa,

  signedIn,
}

/// Everything needed to talk to a server, and how far in we are.
@freezed
abstract class Session with _$Session {
  const factory Session({
    required SessionStage stage,

    /// Base URL, without a trailing slash.
    String? baseUrl,
    String? accessToken,
    String? refreshToken,
    AuthUser? user,
  }) = _Session;

  const Session._();

  /// Nothing configured yet — the state a fresh install starts in.
  factory Session.empty() => const Session(stage: SessionStage.unconfigured);

  bool get canCallApi => accessToken != null && baseUrl != null;

  /// Whether cached data may be shown but cannot be refreshed.
  bool get isStale => stage != SessionStage.signedIn && baseUrl != null;
}
