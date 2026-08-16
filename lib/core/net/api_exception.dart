/// Turns whatever the backend returned into something worth showing a person.
library;

/// What went wrong, at the granularity the UI actually reacts to.
enum ApiFailure {
  /// The server could not be reached at all.
  offline,

  /// The connection was refused or the handshake failed.
  ///
  /// Kept separate from [offline] because a bad or expired certificate must
  /// never be reported as "no network" — that sends people hunting the wrong
  /// problem for hours.
  tls,

  /// Credentials rejected, or the session has lapsed.
  unauthorized,

  /// Authenticated, but not allowed.
  forbidden,

  notFound,

  /// The request was malformed. Means a client bug, not a user mistake.
  validation,

  server,

  /// Anything not recognised.
  unknown,
}

/// A backend error carrying a message fit to display.
class ApiException implements Exception {
  const ApiException(this.failure, this.message, {this.statusCode});

  final ApiFailure failure;

  /// Already human-readable. Never a raw stack trace or a JSON blob.
  final String message;

  final int? statusCode;

  /// Whether retrying the same request could plausibly succeed.
  bool get isRetryable =>
      failure == ApiFailure.offline || failure == ApiFailure.server;

  /// Whether the session needs re-establishing.
  bool get needsSignIn => failure == ApiFailure.unauthorized;

  @override
  String toString() => 'ApiException($failure, $statusCode): $message';
}

/// Extracts a readable message from a FastAPI error body.
///
/// FastAPI is inconsistent here, and the inconsistency bites at the worst
/// moment. A normal error is `{"detail": "Budget not found"}`, but a validation
/// error is `{"detail": [{"loc": [...], "msg": "field required", ...}]}`.
/// Declaring `detail` as a string throws while already handling an error, which
/// replaces a clear message with a parsing crash.
///
/// Returns null when the body carries nothing usable, so the caller can fall
/// back to something based on the status code.
String? messageFromBody(Object? body) {
  if (body is String) {
    final trimmed = body.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  if (body is! Map) return null;

  final detail = body['detail'];

  if (detail is String && detail.trim().isNotEmpty) return detail.trim();

  if (detail is List) {
    final parts = <String>[];
    for (final item in detail) {
      if (item is Map) {
        final msg = item['msg'];
        final loc = item['loc'];
        if (msg is String && msg.isNotEmpty) {
          // 'loc' is like ["body", "username"]; the last hop names the field.
          final field = (loc is List && loc.isNotEmpty) ? loc.last : null;
          parts.add(field == null ? msg : '$field: $msg');
        }
      } else if (item is String && item.isNotEmpty) {
        parts.add(item);
      }
    }
    if (parts.isNotEmpty) return parts.join(', ');
  }

  final message = body['message'];
  if (message is String && message.trim().isNotEmpty) return message.trim();

  return null;
}

/// Maps an HTTP status onto a failure kind.
ApiFailure failureFromStatus(int? status) {
  if (status == null) return ApiFailure.unknown;
  if (status == 401) return ApiFailure.unauthorized;
  if (status == 403) return ApiFailure.forbidden;
  if (status == 404) return ApiFailure.notFound;
  if (status == 422) return ApiFailure.validation;
  if (status >= 500) return ApiFailure.server;
  if (status >= 400) return ApiFailure.unknown;
  return ApiFailure.unknown;
}

/// Default wording when the server said nothing useful.
String defaultMessage(ApiFailure failure) => switch (failure) {
      ApiFailure.offline =>
        'Cannot reach the server. Check your connection, then try again.',
      ApiFailure.tls =>
        'The server\'s security certificate could not be verified. '
            'The connection was refused.',
      ApiFailure.unauthorized => 'Your session has expired. Sign in to continue.',
      ApiFailure.forbidden => 'This account is not allowed to see that.',
      ApiFailure.notFound => 'That is not on the server.',
      ApiFailure.validation => 'The app sent something the server rejected.',
      ApiFailure.server => 'The server ran into a problem. Try again shortly.',
      ApiFailure.unknown => 'Something went wrong.',
    };
