import 'package:freezed_annotation/freezed_annotation.dart';

part 'settings.freezed.dart';
part 'settings.g.dart';

/// Server-side preferences the app has to honour to stay in step with the
/// website.
///
/// Only [displayCurrency] matters here: every report and budget figure arrives
/// already converted into it, so formatting with anything else would label
/// correct numbers with the wrong unit. The debug flags are returned by the
/// same endpoint and parsed so the response round-trips, but this client does
/// not act on them.
@freezed
abstract class AppSettings with _$AppSettings {
  const factory AppSettings({
    @JsonKey(name: 'display_currency') @Default('EUR') String displayCurrency,
    @JsonKey(name: 'debug_mode') @Default(false) bool debugMode,
  }) = _AppSettings;

  factory AppSettings.fromJson(Map<String, dynamic> json) =>
      _$AppSettingsFromJson(json);
}

/// The envelope `/api/settings/` returns.
@freezed
abstract class SettingsResponse with _$SettingsResponse {
  const factory SettingsResponse({
    @Default(AppSettings()) AppSettings settings,
  }) = _SettingsResponse;

  factory SettingsResponse.fromJson(Map<String, dynamic> json) =>
      _$SettingsResponseFromJson(json);
}

/// The unauthenticated `/health` probe, used to test a server address before
/// asking anyone for a password.
@freezed
abstract class HealthStatus with _$HealthStatus {
  const factory HealthStatus({
    @Default('') String status,
    @Default('') String database,
    String? timestamp,
  }) = _HealthStatus;

  const HealthStatus._();

  factory HealthStatus.fromJson(Map<String, dynamic> json) =>
      _$HealthStatusFromJson(json);

  bool get isHealthy => status == 'healthy';
}
