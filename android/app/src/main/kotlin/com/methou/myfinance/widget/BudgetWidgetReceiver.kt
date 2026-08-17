package com.methou.myfinance.widget

import android.content.Context
import android.net.Uri
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import es.antonborri.home_widget.HomeWidgetBackgroundIntent
import es.antonborri.home_widget.HomeWidgetGlanceWidgetReceiver

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
        HomeWidgetBackgroundIntent
            .getBroadcast(context, Uri.parse("myfinance://refresh"))
            .send()
    }
}
