import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/core/net/api_exception.dart';

void main() {
  group('messageFromBody', () {
    test('reads the string form returned by ordinary errors', () {
      expect(messageFromBody({'detail': 'Budget not found'}), 'Budget not found');
    });

    test('reads the list form returned by validation errors', () {
      // FastAPI switches the type of `detail` on 422. A parser that assumes a
      // string throws here — while already handling an error, which is how a
      // clear message turns into an unexplained crash.
      final body = {
        'detail': [
          {
            'loc': ['body', 'username'],
            'msg': 'field required',
            'type': 'value_error.missing',
          },
          {
            'loc': ['body', 'password'],
            'msg': 'field required',
            'type': 'value_error.missing',
          },
        ],
      };
      expect(
        messageFromBody(body),
        'username: field required, password: field required',
      );
    });

    test('copes with a validation entry that carries no location', () {
      expect(
        messageFromBody({
          'detail': [
            {'msg': 'something is off'}
          ]
        }),
        'something is off',
      );
    });

    test('falls back through the shapes it does not recognise', () {
      expect(messageFromBody({'detail': []}), isNull);
      expect(messageFromBody({'detail': 42}), isNull);
      expect(messageFromBody({'message': 'from another layer'}), 'from another layer');
      expect(messageFromBody({}), isNull);
      expect(messageFromBody(null), isNull);
      expect(messageFromBody('plain text body'), 'plain text body');
      expect(messageFromBody('   '), isNull);
    });

    test('never throws, whatever it is handed', () {
      for (final body in <Object?>[
        null,
        1,
        'x',
        [],
        {'detail': null},
        {'detail': <Object?>[null, 1]},
        {'detail': <String, Object?>{}},
      ]) {
        expect(() => messageFromBody(body), returnsNormally, reason: '$body');
      }
    });
  });

  group('failureFromStatus', () {
    test('maps the statuses the UI reacts to differently', () {
      expect(failureFromStatus(401), ApiFailure.unauthorized);
      expect(failureFromStatus(403), ApiFailure.forbidden);
      expect(failureFromStatus(404), ApiFailure.notFound);
      expect(failureFromStatus(422), ApiFailure.validation);
      expect(failureFromStatus(500), ApiFailure.server);
      expect(failureFromStatus(503), ApiFailure.server);
      expect(failureFromStatus(418), ApiFailure.unknown);
      expect(failureFromStatus(null), ApiFailure.unknown);
    });
  });

  group('ApiException', () {
    test('only offers a retry where one could work', () {
      const offline = ApiException(ApiFailure.offline, '');
      const server = ApiException(ApiFailure.server, '');
      const unauthorized = ApiException(ApiFailure.unauthorized, '');
      expect(offline.isRetryable, isTrue);
      expect(server.isRetryable, isTrue);
      expect(unauthorized.isRetryable, isFalse);
      expect(unauthorized.needsSignIn, isTrue);
    });

    test('a certificate problem never reads as a missing network', () {
      final tls = defaultMessage(ApiFailure.tls);
      final offline = defaultMessage(ApiFailure.offline);
      expect(tls, contains('certificate'));
      expect(tls, isNot(equals(offline)));
      expect(offline, isNot(contains('certificate')));
    });

    test('every failure kind has wording ready', () {
      for (final f in ApiFailure.values) {
        expect(defaultMessage(f), isNotEmpty, reason: '$f');
      }
    });
  });
}
