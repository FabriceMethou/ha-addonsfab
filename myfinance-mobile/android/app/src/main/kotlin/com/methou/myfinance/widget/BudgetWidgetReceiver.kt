package com.methou.myfinance.widget

import android.content.Context
import android.net.Uri
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.work.WorkManager
import es.antonborri.home_widget.HomeWidgetBackgroundIntent
import es.antonborri.home_widget.HomeWidgetGlanceWidgetReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Registers the widget with the launcher.
 *
 * Its name is part of the contract: the Dart side names this class when it asks
 * for a redraw, so renaming it silently stops the widget updating.
 */
class BudgetWidgetReceiver : HomeWidgetGlanceWidgetReceiver<BudgetWidget>() {
    override val glanceAppWidget = BudgetWidget()
}

/**
 * The ↻ button: fetches now, without opening the app.
 *
 * Hands off to Dart rather than fetching here. The whole point of keeping the
 * pace rules in one Dart file is that they exist once; re-implementing the
 * fetch in Kotlin would put a second copy of the logic behind the same button.
 */
class RefreshAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        // home_widget enqueues its background work under a single unique name
        // with ExistingWorkPolicy.APPEND, and appending to a chain that ended
        // in failure marks the new work failed without ever running it. That
        // first failure is easy to reach: add the widget, tap ↻ before ever
        // opening the app, and the worker finds no registered Dart callback
        // and fails. From then on the button is dead for good, with nothing on
        // screen to say so — the widget just never refreshes again.
        //
        // Pruning drops finished work records, which takes the failed chain
        // with them and lets the next append start clean. Delete this once the
        // plugin enqueues with APPEND_OR_REPLACE.
        withContext(Dispatchers.IO) {
            WorkManager.getInstance(context).pruneWork().result.get()
        }

        HomeWidgetBackgroundIntent
            .getBroadcast(context, Uri.parse("myfinance://refresh"))
            .send()
    }
}
