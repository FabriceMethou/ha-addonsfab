import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:home_widget/home_widget.dart';

import '../core/auth/session_store.dart';
import '../core/net/api_exception.dart';
import '../core/net/dio_client.dart';
import '../data/finance_api.dart';
import 'threshold_alerts.dart';
import 'widget_payload.dart';

/// Writes the home-screen snapshot and raises threshold alerts.
///
/// Every method here is callable from a bare isolate: nothing touches a widget
/// tree, a provider container, or anything the app builds at start-up. The
/// background refresh runs in its own isolate where none of that exists.
class WidgetSync {
  const WidgetSync();

  /// Android widget class name, matched to the Kotlin receiver.
  static const _androidProvider = 'BudgetWidgetReceiver';
  static const _iOSWidget = 'BudgetWidget';

  static const _sentAlertsKey = 'sent_threshold_alerts';
  static const _notificationChannelId = 'budget_thresholds';

  /// Fetches the current month and republishes the widget.
  ///
  /// Never throws. A failed refresh must leave the widget showing its last
  /// figures rather than an error or a blank — this runs unattended, and there
  /// is nobody to read a message at the moment it happens.
  ///
  /// Returns whether fresh data was written.
  Future<bool> refresh({DateTime? now, bool notify = true}) async {
    final clock = now ?? DateTime.now();
    final store = SessionStore();

    final baseUrl = await store.readBaseUrl();
    if (baseUrl == null || baseUrl.isEmpty) return false;

    final previous = await readSnapshot();

    final dio = buildDio(baseUrl: baseUrl, store: store);
    try {
      final data =
          await FinanceApi(dio).budgetVsActual(clock.year, clock.month);
      final payload = WidgetPayload.from(data, now: clock);

      await _write(payload);
      if (notify) await _raiseAlerts(previous: previous, current: payload);
      return true;
    } on ApiException catch (e) {
      // The session has lapsed and cannot be renewed. Keep the figures, say
      // they are old. Blanking them would be worse than showing yesterday's.
      if (e.needsSignIn && previous != null) {
        await _write(previous.asStale());
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      dio.close();
    }
  }

  /// Republishes a snapshot the app already has, without a network call.
  ///
  /// Used when a screen has just fetched the same month, so the widget follows
  /// the app immediately instead of waiting for its own cycle.
  Future<void> publish(WidgetPayload payload) => _write(payload);

  /// Reads the snapshot currently on the widget.
  Future<WidgetPayload?> readSnapshot() async {
    final raw = await HomeWidget.getWidgetData<String>(WidgetPayload.storageKey);
    return WidgetPayload.decode(raw);
  }

  Future<void> _write(WidgetPayload payload) async {
    await HomeWidget.saveWidgetData<String>(
      WidgetPayload.storageKey,
      payload.encode(),
    );
    await HomeWidget.updateWidget(
      androidName: _androidProvider,
      iOSName: _iOSWidget,
    );
  }

  // ------------------------------------------------------------- alerts

  Future<void> _raiseAlerts({
    required WidgetPayload? previous,
    required WidgetPayload current,
  }) async {
    final sent = await _readSentAlerts();
    final scoped = pruneToMonth(sent, current.year, current.month);

    final crossings = detectCrossings(
      previous: previous,
      current: current,
      alreadySent: scoped,
    );
    if (crossings.isEmpty) {
      if (scoped.length != sent.length) await _writeSentAlerts(scoped);
      return;
    }

    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _notificationChannelId,
        'Budget thresholds',
        channelDescription:
            'Tells you when a category passes 80% or 100% of its budget.',
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
    );

    for (final crossing in crossings) {
      await plugin.show(
        // A stable id per category and level, so a repeat replaces rather than
        // stacks if one ever slips through.
        id: crossing.keyFor(current.year, current.month).hashCode & 0x7fffffff,
        title: crossing.title,
        body: crossing.body,
        notificationDetails: details,
      );
      scoped.add(crossing.keyFor(current.year, current.month));
    }

    await _writeSentAlerts(scoped);
  }

  Future<Set<String>> _readSentAlerts() async {
    final raw = await HomeWidget.getWidgetData<String>(_sentAlertsKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) return decoded.whereType<String>().toSet();
    } on FormatException {
      // Unreadable bookkeeping is not worth failing a sync over; the worst
      // case is one duplicate notification.
    }
    return {};
  }

  Future<void> _writeSentAlerts(Set<String> keys) =>
      HomeWidget.saveWidgetData<String>(_sentAlertsKey, jsonEncode(keys.toList()));
}
