import 'package:freezed_annotation/freezed_annotation.dart';

/// Reads a boolean that may not arrive as one.
///
/// SQLite has no boolean type, so it stores these as 0 and 1. Some fields are
/// re-derived in Python before serialising and come back as real JSON booleans
/// (`is_admin` is computed from the role), while others are handed straight
/// from a row and arrive as integers (`mfa_enabled`, `confirmed`,
/// `is_transfer`, `is_active`). Which is which is not something a client should
/// have to track, and a hard cast turns the difference into a crash at sign-in.
///
/// Accepts booleans, 0/1, and the string spellings, and treats anything else as
/// false rather than throwing — one odd row must not take out a whole screen.
class LenientBool implements JsonConverter<bool, Object?> {
  const LenientBool();

  @override
  bool fromJson(Object? json) => switch (json) {
        bool b => b,
        num n => n != 0,
        String s => s.toLowerCase() == 'true' || s == '1',
        _ => false,
      };

  @override
  Object? toJson(bool object) => object;
}

/// [LenientBool] for a field that may legitimately be absent.
class LenientNullableBool implements JsonConverter<bool?, Object?> {
  const LenientNullableBool();

  @override
  bool? fromJson(Object? json) =>
      json == null ? null : const LenientBool().fromJson(json);

  @override
  Object? toJson(bool? object) => object;
}

/// Reads a number that may arrive as an integer where a decimal was expected.
///
/// Same root cause: SQLite hands back a bare int whenever a stored REAL lands
/// on a whole number, so the wire type of any amount is not stable.
class LenientDouble implements JsonConverter<double, Object?> {
  const LenientDouble();

  @override
  double fromJson(Object? json) => switch (json) {
        num n => n.toDouble(),
        String s => double.tryParse(s) ?? 0,
        _ => 0,
      };

  @override
  Object? toJson(double object) => object;
}
