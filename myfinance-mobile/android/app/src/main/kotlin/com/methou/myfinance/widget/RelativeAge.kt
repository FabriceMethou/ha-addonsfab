package com.methou.myfinance.widget

import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeParseException

/**
 * How long ago the figures on the widget were produced, in words.
 *
 * This is the one thing the widget computes rather than being handed ready to
 * draw, and the exception is deliberate. A string formatted when the snapshot
 * was written would freeze on "just now" and stay there for hours: the age has
 * to be worked out when the widget is drawn, not when it was filled.
 *
 * The thresholds mirror `formatRelativeAge` in `lib/core/format/money.dart`
 * exactly. Both are pinned to the same table of cases — `RelativeAgeTest.kt`
 * here and `relative_age_test.dart` there — so the two cannot drift without a
 * test going red on one side or the other.
 */
object RelativeAge {

    /**
     * @param syncedAtIso the payload's `syncedAt`, an ISO-8601 local timestamp.
     * @return wording for the elapsed time, or null if the timestamp cannot be
     *         read — in which case the caller shows nothing rather than a lie.
     */
    fun format(syncedAtIso: String?, now: Instant = Instant.now()): String? {
        val then = parse(syncedAtIso) ?: return null
        return describe(Duration.between(then, now))
    }

    /** Split out so the tests can drive it without building timestamps. */
    fun describe(elapsed: Duration): String {
        // A clock that moved backwards, or a snapshot written a moment ahead of
        // this device's idea of now, is not worth a negative age.
        if (elapsed.isNegative) return "just now"

        val minutes = elapsed.toMinutes()
        if (minutes < 1) return "just now"
        if (minutes < 60) return "$minutes min ago"

        val hours = elapsed.toHours()
        if (hours < 24) return "$hours ${if (hours == 1L) "hour" else "hours"} ago"

        val days = elapsed.toDays()
        if (days < 30) return "$days ${if (days == 1L) "day" else "days"} ago"

        return "over a month ago"
    }

    private fun parse(iso: String?): Instant? {
        if (iso.isNullOrEmpty()) return null
        return try {
            // Dart writes a local time with no offset, so it is read against
            // this device's zone — the same zone that wrote it.
            java.time.LocalDateTime.parse(iso)
                .atZone(java.time.ZoneId.systemDefault())
                .toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
