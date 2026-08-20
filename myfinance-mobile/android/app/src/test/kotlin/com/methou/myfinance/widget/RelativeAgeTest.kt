package com.methou.myfinance.widget

import java.time.Duration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The same table `relative_age_test.dart` holds the Dart side to.
 *
 * The widget has to work the age out itself — a string formatted at sync time
 * would freeze on "just now" — so the wording exists twice. Keeping both pinned
 * to identical cases means neither can drift without one of these two files
 * going red.
 */
class RelativeAgeTest {

    private val cases = listOf(
        Duration.ofSeconds(0) to "just now",
        Duration.ofSeconds(59) to "just now",
        Duration.ofMinutes(1) to "1 min ago",
        Duration.ofMinutes(59) to "59 min ago",
        Duration.ofHours(1) to "1 hour ago",
        Duration.ofHours(2) to "2 hours ago",
        Duration.ofHours(23) to "23 hours ago",
        Duration.ofDays(1) to "1 day ago",
        Duration.ofDays(29) to "29 days ago",
        Duration.ofDays(30) to "over a month ago",
        Duration.ofDays(400) to "over a month ago",
    )

    @Test
    fun `matches the wording the app uses`() {
        for ((elapsed, expected) in cases) {
            assertEquals("for $elapsed", expected, RelativeAge.describe(elapsed))
        }
    }

    @Test
    fun `a timestamp in the future is not a negative age`() {
        assertEquals("just now", RelativeAge.describe(Duration.ofMinutes(-5)))
    }

    @Test
    fun `an unreadable timestamp yields nothing rather than a lie`() {
        // The header then shows no age at all, which is honest. Printing
        // "just now" for a timestamp we could not read would not be.
        assertNull(RelativeAge.format(null))
        assertNull(RelativeAge.format(""))
        assertNull(RelativeAge.format("not a timestamp"))
    }

    @Test
    fun `reads the ISO local timestamp Dart writes`() {
        val iso = "2026-08-20T09:00:00.000"
        assertEquals(
            "the format Dart's toIso8601String produces must parse",
            true,
            RelativeAge.format(iso) != null,
        )
    }
}
