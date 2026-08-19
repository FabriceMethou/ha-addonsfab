package com.methou.myfinance.widget

import org.json.JSONObject

/**
 * The Dart side of this app writes a snapshot into shared storage; this reads it
 * back. It is the only thing the widget knows about the world.
 *
 * The snapshot arrives with its strings already formatted. Money formatting
 * depends on locale and currency rules, and doing it a second time here would be
 * a separate implementation to keep in step — the first time the two drifted,
 * the widget would contradict the app it came from. So nothing below computes or
 * formats anything: it lays out text and draws two fractions.
 */
data class BudgetPayload(
    val stale: Boolean,
    val hasData: Boolean,
    val monthLabel: String,
    val daysLeftLabel: String,
    val spentFraction: Float,
    val paceFraction: Float,
    val spentPctLabel: String,
    val amountLabel: String,
    val ofLabel: String,
    val remainingLabel: String,
    val verdict: String,
    val verdictLabel: String,
    val year: Int,
    val month: Int,
    val categories: List<BudgetCategory>,
) {
    companion object {
        /** Must match WidgetPayload.version on the Dart side. */
        const val SUPPORTED_VERSION = 1

        /** Must match WidgetPayload.storageKey. */
        const val STORAGE_KEY = "budget_payload"

        /**
         * Parses a snapshot, or returns null if it cannot be trusted.
         *
         * A version mismatch is the case worth being careful about: updating the
         * app cannot update a widget already sitting on someone's home screen,
         * so old Kotlin will at some point be handed new JSON. Returning null
         * lets the widget say "open the app" rather than draw a half-read
         * snapshot or take the launcher down with it.
         */
        fun parse(raw: String?): BudgetPayload? {
            if (raw.isNullOrEmpty()) return null
            return try {
                val json = JSONObject(raw)
                if (json.optInt("v", -1) != SUPPORTED_VERSION) return null

                val categories = mutableListOf<BudgetCategory>()
                val array = json.optJSONArray("categories")
                if (array != null) {
                    for (i in 0 until array.length()) {
                        val item = array.optJSONObject(i) ?: continue
                        categories.add(
                            BudgetCategory(
                                name = item.optString("name"),
                                pctLabel = item.optString("pctLabel"),
                                fraction = item.optDouble("fraction", 0.0).toFloat(),
                                level = item.optString("level", "healthy"),
                            )
                        )
                    }
                }

                BudgetPayload(
                    stale = json.optBoolean("stale", false),
                    hasData = json.optBoolean("hasData", false),
                    monthLabel = json.optString("monthLabel"),
                    daysLeftLabel = json.optString("daysLeftLabel"),
                    spentFraction = json.optDouble("spentFraction", 0.0).toFloat(),
                    paceFraction = json.optDouble("paceFraction", 0.0).toFloat(),
                    spentPctLabel = json.optString("spentPctLabel"),
                    amountLabel = json.optString("amountLabel"),
                    ofLabel = json.optString("ofLabel"),
                    remainingLabel = json.optString("remainingLabel"),
                    verdict = json.optString("verdict", "onPace"),
                    verdictLabel = json.optString("verdictLabel"),
                    year = json.optInt("year"),
                    month = json.optInt("month"),
                    categories = categories,
                )
            } catch (_: Exception) {
                // A widget that throws takes the launcher's redraw with it. An
                // unreadable snapshot is worth a placeholder, never a crash.
                null
            }
        }
    }
}

data class BudgetCategory(
    val name: String,
    val pctLabel: String,
    /** Share of the limit used. Can exceed 1; bars clamp, labels do not. */
    val fraction: Float,
    /** `healthy`, `close` or `over`. */
    val level: String,
)
