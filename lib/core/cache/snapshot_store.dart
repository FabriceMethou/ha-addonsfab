import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// The last successful response for each screen, kept on disk.
///
/// Separate from the widget's snapshot, which the launcher reads through
/// `home_widget` in another process. This one exists so opening the app without
/// a network shows the figures it last saw, labelled as old, instead of an
/// error page. On an app whose whole purpose is answering a quick question,
/// yesterday's number beats no number.
///
/// Plain class with no provider dependency, for the same reason as
/// [SessionStore]: it has to be constructible cold.
class SnapshotStore {
  const SnapshotStore();

  /// Cached payloads live in the app's own directory rather than a temp one:
  /// the point is to survive being closed, and the OS clears caches under
  /// pressure exactly when a phone is most likely to be offline.
  Future<Directory> _directory() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/snapshots');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  File _fileFor(Directory dir, String key) =>
      File('${dir.path}/${key.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}.json');

  /// Stores [payload] under [key], stamped with the time it was fetched.
  ///
  /// Never throws: failing to cache is not a reason to fail the request that
  /// just succeeded.
  Future<void> write(String key, Map<String, dynamic> payload) async {
    try {
      final dir = await _directory();
      await _fileFor(dir, key).writeAsString(
        jsonEncode({
          'at': DateTime.now().toIso8601String(),
          'payload': payload,
        }),
      );
    } on Exception {
      // Disk full, permissions, a platform channel not ready in a test: none
      // of these should surface to someone who just loaded a screen fine.
    }
  }

  /// Reads back what was stored, or null if there is nothing usable.
  Future<({Map<String, dynamic> payload, DateTime at})?> read(String key) async {
    try {
      final dir = await _directory();
      final file = _fileFor(dir, key);
      if (!await file.exists()) return null;

      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map<String, dynamic>) return null;

      final payload = decoded['payload'];
      final at = DateTime.tryParse(decoded['at'] as String? ?? '');
      if (payload is! Map<String, dynamic> || at == null) return null;

      return (payload: payload, at: at);
    } on Object {
      // A snapshot written by an older version whose shape has since changed
      // will fail to parse upstream anyway. Treating any unreadable cache as
      // absent keeps that from turning into a crash on launch.
      return null;
    }
  }

  /// Drops everything. Used on sign-out: the next person to open the app
  /// should not see the previous account's figures behind the lock screen.
  Future<void> clear() async {
    try {
      final dir = await _directory();
      if (await dir.exists()) await dir.delete(recursive: true);
    } on Exception {
      // Nothing to do about it, and nothing that depends on it succeeding.
    }
  }
}
