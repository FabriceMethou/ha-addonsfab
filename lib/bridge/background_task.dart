import 'package:workmanager/workmanager.dart';

import 'widget_sync.dart';

/// Unique name of the recurring refresh, used to replace it rather than stack
/// duplicates each time the app starts.
const _periodicTaskName = 'budget-widget-refresh';

/// Name of the one-off refresh the widget's ↻ button asks for.
const kImmediateRefreshTask = 'budget-widget-refresh-now';

/// How often to look for new figures.
///
/// Budgets move a few times a day at most, so a tighter cycle would spend
/// battery to redraw the same numbers. Android treats this as a floor and
/// batches the actual wake-ups with other work anyway; the widget always shows
/// when it last synced, so a delayed cycle is visible rather than misleading.
const _refreshInterval = Duration(hours: 3);

/// Entry point for the background isolate.
///
/// Annotated so tree-shaking keeps it: it is never called from Dart, only
/// invoked by name from the platform side, and without this the release build
/// drops it and the widget silently stops updating.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    // Runs in a fresh isolate: nothing the app built at start-up exists here.
    // Everything WidgetSync needs is constructed on the spot, which is why no
    // business logic may live behind a provider or a widget.
    await const WidgetSync().refresh();

    // Always reports success. A failed refresh is not an error worth retrying
    // aggressively — the next cycle is minutes away, the widget kept its last
    // figures, and returning false invites WorkManager to back off and retry
    // in a way that costs battery for no benefit.
    return true;
  });
}

/// Registers the recurring refresh. Safe to call on every launch.
Future<void> scheduleWidgetRefresh() async {
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    _periodicTaskName,
    _periodicTaskName,
    frequency: _refreshInterval,
    constraints: Constraints(
      networkType: NetworkType.connected,
      requiresBatteryNotLow: true,
    ),
    // Replace rather than keep: keeping would pin the schedule to whatever
    // frequency was registered first, so a changed interval would never take
    // effect on a device that already had the old one.
    existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
  );
}

/// Asks for a refresh right now, for the widget's ↻ button.
Future<void> requestImmediateRefresh() => Workmanager().registerOneOffTask(
      '$kImmediateRefreshTask-${DateTime.now().millisecondsSinceEpoch}',
      kImmediateRefreshTask,
      constraints: Constraints(networkType: NetworkType.connected),
    );

/// Handles taps on interactive parts of the widget.
///
/// Also an isolate entry point, also invoked only by name from the platform, so
/// it carries the same annotation for the same reason: without it the release
/// build tree-shakes it away and the ↻ button does nothing.
@pragma('vm:entry-point')
Future<void> widgetInteractionCallback(Uri? uri) async {
  if (uri?.host == 'refresh') {
    await const WidgetSync().refresh();
  }
}
