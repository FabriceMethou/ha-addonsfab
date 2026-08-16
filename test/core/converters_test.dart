import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/domain/models/auth.dart';
import 'package:myfinance/domain/models/converters.dart';

void main() {
  group('LenientBool', () {
    const c = LenientBool();

    test('accepts the integers SQLite actually returns', () {
      // The reason this converter exists: `mfa_enabled` comes straight off a
      // row and arrives as 0 or 1, which a plain bool cast rejects — at
      // sign-in, before anything else can go right.
      expect(c.fromJson(1), isTrue);
      expect(c.fromJson(0), isFalse);
    });

    test('accepts real booleans', () {
      expect(c.fromJson(true), isTrue);
      expect(c.fromJson(false), isFalse);
    });

    test('accepts the string spellings', () {
      expect(c.fromJson('true'), isTrue);
      expect(c.fromJson('True'), isTrue);
      expect(c.fromJson('1'), isTrue);
      expect(c.fromJson('false'), isFalse);
      expect(c.fromJson('0'), isFalse);
    });

    test('treats anything else as false instead of throwing', () {
      expect(c.fromJson(null), isFalse);
      expect(c.fromJson([]), isFalse);
      expect(c.fromJson({}), isFalse);
    });
  });

  group('LenientDouble', () {
    const c = LenientDouble();

    test('widens the integer SQLite returns for a whole amount', () {
      expect(c.fromJson(1000), 1000.0);
      expect(c.fromJson(0), 0.0);
    });

    test('keeps decimals', () => expect(c.fromJson(44.2), 44.2));

    test('parses a numeric string and shrugs at the rest', () {
      expect(c.fromJson('12.5'), 12.5);
      expect(c.fromJson('nonsense'), 0.0);
      expect(c.fromJson(null), 0.0);
    });
  });

  group('AuthUser with integer booleans', () {
    test('parses the shape the login endpoint really sends', () {
      final u = AuthUser.fromJson({
        'username': 'demo',
        'is_admin': true,
        'mfa_enabled': 0,
      });
      expect(u.isAdmin, isTrue);
      expect(u.mfaEnabled, isFalse);
    });

    test('parses an account that does have a second factor', () {
      final u = AuthUser.fromJson({'username': 'demo', 'mfa_enabled': 1});
      expect(u.mfaEnabled, isTrue);
    });
  });
}
