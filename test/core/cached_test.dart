import 'package:flutter_test/flutter_test.dart';
import 'package:myfinance/core/cache/cached.dart';
import 'package:myfinance/core/cache/snapshot_store.dart';
import 'package:myfinance/core/net/api_exception.dart';

/// In-memory stand-in, so these tests never touch a real documents directory.
class _FakeStore implements SnapshotStore {
  final Map<String, ({Map<String, dynamic> payload, DateTime at})> _entries = {};
  int writes = 0;

  @override
  Future<void> write(String key, Map<String, dynamic> payload) async {
    writes++;
    _entries[key] = (payload: payload, at: DateTime(2026, 8, 17, 9));
  }

  @override
  Future<({Map<String, dynamic> payload, DateTime at})?> read(String key) async =>
      _entries[key];

  @override
  Future<void> clear() async => _entries.clear();
}

void main() {
  late _FakeStore store;

  setUp(() => store = _FakeStore());

  Future<Cached<int>> run({
    required Future<int> Function() fetch,
    String key = 'k',
  }) =>
      withCache<int>(
        store: store,
        key: key,
        fetch: fetch,
        encode: (v) => {'v': v},
        decode: (j) => j['v'] as int,
      );

  test('a successful fetch is returned fresh and cached', () async {
    final result = await run(fetch: () async => 42);

    expect(result.value, 42);
    expect(result.isStale, isFalse);
    expect(store.writes, 1);
  });

  test('a failure falls back to what was cached, marked stale', () async {
    await run(fetch: () async => 42);

    final result = await run(
      fetch: () async =>
          throw const ApiException(ApiFailure.offline, 'no network'),
    );

    expect(result.value, 42, reason: 'the figures stay on screen');
    expect(result.isStale, isTrue, reason: 'and are labelled as old');
    expect(result.fetchedAt, DateTime(2026, 8, 17, 9),
        reason: 'the age shown is when the server produced them');
  });

  test('a failure with nothing cached rethrows', () async {
    // An error page is the honest answer when there is genuinely nothing to
    // show. Inventing an empty state would read as "you have no data".
    expect(
      () => run(
        fetch: () async =>
            throw const ApiException(ApiFailure.offline, 'no network'),
      ),
      throwsA(isA<ApiException>()),
    );
  });

  test('a cache that no longer parses surfaces the network error', () async {
    await store.write('k', {'wrong': 'shape'});

    // Not the parse error: the network failure is what went wrong and the only
    // one anyone can act on.
    await expectLater(
      run(
        fetch: () async =>
            throw const ApiException(ApiFailure.offline, 'no network'),
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.failure, 'failure', ApiFailure.offline),
      ),
    );
  });

  test('a later success replaces the cached copy', () async {
    await run(fetch: () async => 1);
    await run(fetch: () async => 2);

    final result = await run(
      fetch: () async => throw const ApiException(ApiFailure.offline, ''),
    );
    expect(result.value, 2);
  });

  test('keys are independent', () async {
    await run(fetch: () async => 1, key: 'a');

    expect(
      () => run(
        fetch: () async => throw const ApiException(ApiFailure.offline, ''),
        key: 'b',
      ),
      throwsA(isA<ApiException>()),
    );
  });

  test('clearing leaves nothing to fall back on', () async {
    await run(fetch: () async => 7);
    await store.clear();

    expect(
      () => run(
        fetch: () async => throw const ApiException(ApiFailure.offline, ''),
      ),
      throwsA(isA<ApiException>()),
    );
  });

  group('Cached', () {
    test('maps its value while keeping the staleness', () {
      final c = Cached(value: 2, fetchedAt: DateTime(2026), isStale: true);
      final mapped = c.map((v) => v * 3);

      expect(mapped.value, 6);
      expect(mapped.isStale, isTrue);
      expect(mapped.fetchedAt, c.fetchedAt);
    });
  });
}
