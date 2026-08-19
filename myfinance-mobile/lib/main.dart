import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_widget/home_widget.dart';

import 'app.dart';
import 'bridge/background_task.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Wired up before the first frame so a launch from the widget's ↻ button is
  // handled rather than dropped. Both calls are cheap and idempotent.
  await HomeWidget.registerInteractivityCallback(widgetInteractionCallback);
  await scheduleWidgetRefresh();

  runApp(const ProviderScope(child: MyFinanceApp()));
}
