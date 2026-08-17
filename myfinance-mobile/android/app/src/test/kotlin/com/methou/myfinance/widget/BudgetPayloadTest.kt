package com.methou.myfinance.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reads the snapshot the Dart side actually writes.
 *
 * `budget_payload.json` is produced by the Flutter test suite from real
 * (anonymised) API data, not written by hand. Flutter and the widget never
 * share a type — only these bytes — so this is where a drift in the contract
 * turns into a failing test instead of a blank home screen nobody notices
 * until they look.
 */
class BudgetPayloadTest {

    private fun golden(): String =
        javaClass.classLoader!!.getResourceAsStream("budget_payload.json")!!
            .bufferedReader()
            .use { it.readText() }

    @Test
    fun `parses the snapshot Dart produces`() {
        val payload = BudgetPayload.parse(golden())

        assertNotNull("the golden snapshot must parse", payload)
        payload!!
        assertTrue(payload.hasData)
        assertEquals(2026, payload.year)
        assertEquals(8, payload.month)
        assertEquals("August 2026", payload.monthLabel)
        assertEquals("15 days left", payload.daysLeftLabel)
        assertEquals("behind", payload.verdict)
        assertTrue(payload.verdictLabel.contains("under pace"))
    }

    @Test
    fun `receives strings ready to draw, not numbers to format`() {
        val payload = BudgetPayload.parse(golden())!!

        // Formatting money here would be a second implementation of currency
        // and locale rules, and the first time it drifted the widget would
        // contradict the app it came from.
        assertTrue(payload.amountLabel.contains("€"))
        assertTrue(payload.ofLabel.startsWith("of "))
        assertTrue(payload.spentPctLabel.endsWith("%"))
        assertTrue(payload.remainingLabel.isNotEmpty())
    }

    @Test
    fun `receives the fractions the ring and bars are drawn from`() {
        val payload = BudgetPayload.parse(golden())!!

        assertEquals(16.0 / 31.0, payload.paceFraction.toDouble(), 1e-6)
        assertTrue(payload.spentFraction > 0f)
        assertTrue(payload.spentFraction < payload.paceFraction)
    }

    @Test
    fun `categories arrive worst first with a level the widget can colour`() {
        val payload = BudgetPayload.parse(golden())!!

        assertTrue(payload.categories.isNotEmpty())
        assertTrue(payload.categories.size <= 5)

        val fractions = payload.categories.map { it.fraction }
        assertEquals(fractions.sortedDescending(), fractions)

        for (category in payload.categories) {
            assertTrue(
                "unknown level: ${category.level}",
                category.level in setOf("healthy", "close", "over"),
            )
            assertTrue(category.pctLabel.endsWith("%"))
            assertTrue(category.name.isNotEmpty())
        }
    }

    @Test
    fun `declines a version it was not written for`() {
        // Updating the app cannot update a widget already sitting on a home
        // screen, so old Kotlin will eventually be handed newer JSON. It has
        // to decline rather than draw a half-understood snapshot.
        val bumped = golden().replace("\"v\":1", "\"v\":2")
        assertNull(BudgetPayload.parse(bumped))
    }

    @Test
    fun `survives rubbish without taking the launcher down`() {
        // A widget that throws breaks the launcher's redraw, not just itself.
        assertNull(BudgetPayload.parse(null))
        assertNull(BudgetPayload.parse(""))
        assertNull(BudgetPayload.parse("not json at all"))
        assertNull(BudgetPayload.parse("[1,2,3]"))
        assertNull(BudgetPayload.parse("{}"))
    }

    @Test
    fun `tolerates a snapshot missing optional fields`() {
        val minimal = """{"v":1,"hasData":true,"year":2026,"month":8}"""
        val payload = BudgetPayload.parse(minimal)

        assertNotNull(payload)
        assertEquals("", payload!!.monthLabel)
        assertEquals(0f, payload.spentFraction, 1e-6f)
        assertTrue(payload.categories.isEmpty())
    }
}
