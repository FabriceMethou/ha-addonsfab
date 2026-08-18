import '../net/api_exception.dart';
import 'snapshot_store.dart';

/// A value, and whether it is the one the server just gave us.
class Cached<T> {
  const Cached({
    required this.value,
    required this.fetchedAt,
    required this.isStale,
  });

  final T value;

  /// When the server produced these figures — not when they were read back.
  final DateTime fetchedAt;

  /// True when the network failed and this came off disk.
  ///
  /// The screen keeps showing the numbers and says how old they are. Silently
  /// presenting yesterday's balance as today's would be worse than an error;
  /// hiding it entirely would be worse than both.
  final bool isStale;

  Cached<R> map<R>(R Function(T) f) =>
      Cached(value: f(value), fetchedAt: fetchedAt, isStale: isStale);
}

/// Fetches, caching on success and falling back to the cache on failure.
///
/// [encode] and [decode] are the model's own `toJson` and `fromJson`, so
/// nothing here needs to know what it is storing and the API layer stays
/// untouched.
///
/// A failure with nothing cached rethrows: an error page is the honest answer
/// when there is genuinely nothing to show.
Future<Cached<T>> withCache<T>({
  required SnapshotStore store,
  required String key,
  required Future<T> Function() fetch,
  required Map<String, dynamic> Function(T) encode,
  required T Function(Map<String, dynamic>) decode,
}) async {
  try {
    final fresh = await fetch();
    await store.write(key, encode(fresh));
    return Cached(value: fresh, fetchedAt: DateTime.now(), isStale: false);
  } on ApiException catch (failure) {
    final cached = await store.read(key);
    if (cached == null) rethrow;
    try {
      return Cached(
        value: decode(cached.payload),
        fetchedAt: cached.at,
        isStale: true,
      );
    } on Object {
      // Catches Error as well as Exception on purpose: a cast against a shape
      // that has since changed throws TypeError, which `on Exception` would
      // let through — so the screen would show a type error instead of "you
      // are offline".
      //
      // The stored shape no longer parses, written by an older version of the
      // app or by a backend that has since changed. Throw the network failure:
      // it is what actually went wrong and the only one anyone can act on.
      throw failure;
    }
  }
}
