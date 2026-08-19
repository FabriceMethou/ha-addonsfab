package com.methou.myfinance.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.action.clickable
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
// The theme-aware factory lives in androidx.glance.color and returns the type
// above; the same-named one in androidx.glance.unit takes a single colour and
// cannot follow the launcher's theme. Aliased so both can be used here.
import androidx.glance.color.ColorProvider as dayNightColor
import com.methou.myfinance.MainActivity
import es.antonborri.home_widget.HomeWidgetGlanceState
import es.antonborri.home_widget.HomeWidgetGlanceStateDefinition
import es.antonborri.home_widget.actionStartActivity

/**
 * Colours mirroring the website's, so the two never disagree about severity.
 *
 * Each is held as a day/night pair rather than only as a [ColorProvider],
 * because the ring is a Canvas bitmap and Canvas wants a resolved ARGB int. A
 * ColorProvider cannot be unwrapped outside composition, so the pair is the
 * single source and both forms are derived from it.
 */
private object WidgetColors {
    private val backgroundPair = Color(0xFFFFFFFF) to Color(0xFF0F172A)
    private val onBackgroundPair = Color(0xFF101917) to Color(0xFFE6EEF8)
    private val mutedPair = Color(0xFF667573) to Color(0xFF9FB0C8)
    private val trackPair = Color(0xFFDCE3E2) to Color(0xFF243044)

    // Website values: success #10b981, warning #f59e0b, error #ef4444. The day
    // variants are darkened until they hold up on white, which the website
    // never has to deal with because it is dark only.
    private val healthyPair = Color(0xFF047857) to Color(0xFF10B981)
    private val closePair = Color(0xFFB45309) to Color(0xFFF59E0B)
    private val overPair = Color(0xFFB91C1C) to Color(0xFFEF4444)

    val background = backgroundPair.provider()
    val onBackground = onBackgroundPair.provider()
    val muted = mutedPair.provider()
    val track = trackPair.provider()

    fun forLevel(level: String): ColorProvider = levelPair(level).provider()

    fun levelArgb(level: String, night: Boolean): Int = levelPair(level).argb(night)

    fun trackArgb(night: Boolean): Int = trackPair.argb(night)

    fun onBackgroundArgb(night: Boolean): Int = onBackgroundPair.argb(night)

    private fun levelPair(level: String): Pair<Color, Color> = when (level) {
        "over" -> overPair
        "close" -> closePair
        else -> healthyPair
    }

    private fun Pair<Color, Color>.provider() = dayNightColor(day = first, night = second)

    private fun Pair<Color, Color>.argb(night: Boolean) =
        (if (night) second else first).toArgb()
}

/**
 * Whether the launcher is currently drawing in dark mode.
 *
 * Read from the configuration rather than through Glance's own helper, which
 * is not exposed to callers outside the library.
 */
@Composable
private fun isNightMode(): Boolean {
    val config = LocalContext.current.resources.configuration
    return (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
}

/** Breakpoints the launcher picks between as the widget is resized. */
private val SMALL = DpSize(120.dp, 120.dp)
private val WIDE = DpSize(250.dp, 120.dp)
private val TALL = DpSize(250.dp, 250.dp)

class BudgetWidget : GlanceAppWidget() {

    override val stateDefinition = HomeWidgetGlanceStateDefinition()

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, TALL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val prefs = currentState<HomeWidgetGlanceState>().preferences
            val payload = BudgetPayload.parse(prefs.getString(BudgetPayload.STORAGE_KEY, null))
            WidgetBody(payload)
        }
    }
}

@Composable
private fun WidgetBody(payload: BudgetPayload?) {
    val context = LocalContext.current
    val size = LocalSize.current

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(WidgetColors.background)
            .cornerRadius(16.dp)
            .padding(12.dp)
            .clickable(actionStartActivity<MainActivity>(context)),
    ) {
        when {
            // Either nothing has synced yet, or the snapshot was written by a
            // newer version of the app than this widget understands.
            payload == null -> Placeholder("Open MyFinance to set up the widget.")
            !payload.hasData -> Placeholder("No budgets for ${payload.monthLabel}.")
            size.height >= TALL.height -> TallLayout(payload)
            size.width >= WIDE.width -> WideLayout(payload)
            else -> SmallLayout(payload)
        }
    }
}

@Composable
private fun Placeholder(message: String) {
    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            message,
            style = TextStyle(color = WidgetColors.muted, fontSize = 13.sp),
        )
    }
}

/** 2x2: the one number worth having at a glance. */
@Composable
private fun SmallLayout(payload: BudgetPayload) {
    Header(payload, compact = true)
    Spacer(GlanceModifier.height(6.dp))
    Text(
        payload.remainingLabel,
        style = TextStyle(
            color = WidgetColors.onBackground,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        ),
        maxLines = 1,
    )
    Text(
        payload.daysLeftLabel,
        style = TextStyle(color = WidgetColors.muted, fontSize = 11.sp),
        maxLines = 1,
    )
    Spacer(GlanceModifier.height(8.dp))
    PacedBar(
        fraction = payload.spentFraction,
        pace = payload.paceFraction,
        color = WidgetColors.forLevel(levelForOverall(payload)),
        availableWidth = LocalSize.current.width.value - 24f,
    )
}

/** 4x2: the ring and the verdict, no category list. */
@Composable
private fun WideLayout(payload: BudgetPayload) {
    Header(payload, compact = false)
    Spacer(GlanceModifier.height(8.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Ring(payload, sizeDp = 68)
        Spacer(GlanceModifier.width(12.dp))
        Column {
            Text(
                payload.amountLabel,
                style = TextStyle(
                    color = WidgetColors.onBackground,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                ),
                maxLines = 1,
            )
            Text(
                payload.ofLabel,
                style = TextStyle(color = WidgetColors.muted, fontSize = 12.sp),
                maxLines = 1,
            )
            Spacer(GlanceModifier.height(4.dp))
            Text(
                payload.verdictLabel,
                style = TextStyle(
                    color = WidgetColors.forLevel(levelForOverall(payload)),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
                maxLines = 2,
            )
        }
    }
}

/** 4x4: the full picture, worst categories first. */
@Composable
private fun TallLayout(payload: BudgetPayload) {
    WideLayout(payload)
    Spacer(GlanceModifier.height(10.dp))
    val barWidth = LocalSize.current.width.value - 24f
    for (category in payload.categories) {
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                category.name,
                style = TextStyle(color = WidgetColors.onBackground, fontSize = 12.sp),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                category.pctLabel,
                style = TextStyle(
                    color = WidgetColors.forLevel(category.level),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                ),
                maxLines = 1,
            )
        }
        Spacer(GlanceModifier.height(3.dp))
        PacedBar(
            fraction = category.fraction,
            pace = payload.paceFraction,
            color = WidgetColors.forLevel(category.level),
            availableWidth = barWidth,
        )
        Spacer(GlanceModifier.height(7.dp))
    }
}

@Composable
private fun Header(payload: BudgetPayload, compact: Boolean) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (compact) payload.spentPctLabel else payload.monthLabel.uppercase(),
            style = TextStyle(
                color = WidgetColors.muted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
            ),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight(),
        )
        // Stale figures are labelled rather than hidden: a person glancing at a
        // widget deserves the last known state, marked as old.
        Text(
            if (payload.stale) "Tap to sign in" else "↻",
            style = TextStyle(
                color = if (payload.stale) WidgetColors.forLevel("close") else WidgetColors.muted,
                fontSize = if (payload.stale) 10.sp else 13.sp,
            ),
            maxLines = 1,
            modifier = if (payload.stale) {
                GlanceModifier
            } else {
                GlanceModifier.clickable(actionRunCallback<RefreshAction>())
            },
        )
    }
}

@Composable
private fun Ring(payload: BudgetPayload, sizeDp: Int) {
    val density = LocalContext.current.resources.displayMetrics.density
    val px = (sizeDp * density).toInt()
    val isNight = isNightMode()

    Box(contentAlignment = Alignment.Center, modifier = GlanceModifier.size(sizeDp.dp)) {
        Image(
            provider = ImageProvider(
                RingBitmap.draw(
                    sizePx = px,
                    spent = payload.spentFraction,
                    pace = payload.paceFraction,
                    arcColor = WidgetColors.levelArgb(levelForOverall(payload), isNight),
                    trackColor = WidgetColors.trackArgb(isNight),
                    tickColor = WidgetColors.onBackgroundArgb(isNight),
                )
            ),
            contentDescription = "${payload.spentPctLabel} of budget spent",
            modifier = GlanceModifier.size(sizeDp.dp),
        )
        Text(
            payload.spentPctLabel,
            style = TextStyle(
                color = WidgetColors.onBackground,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            ),
            maxLines = 1,
        )
    }
}

/**
 * A progress bar with a tick showing how far through the month we are.
 *
 * Built by hand rather than with Glance's LinearProgressIndicator, which has no
 * way to mark a second position — and the second mark is the whole point.
 */
@Composable
private fun PacedBar(
    fraction: Float,
    pace: Float,
    color: ColorProvider,
    availableWidth: Float,
) {
    val width = availableWidth.coerceAtLeast(1f)
    val fillWidth = (width * fraction.coerceIn(0f, 1f)).dp
    val tickOffset = (width * pace.coerceIn(0f, 1f)).coerceAtMost(width - 2f).dp

    Box(modifier = GlanceModifier.fillMaxWidth().height(10.dp)) {
        // Track
        Box(
            modifier = GlanceModifier
                .fillMaxWidth()
                .height(6.dp)
                .padding(top = 2.dp)
                .background(WidgetColors.track)
                .cornerRadius(3.dp),
        ) {}
        // Spent
        Box(
            modifier = GlanceModifier
                .width(fillWidth)
                .height(6.dp)
                .padding(top = 2.dp)
                .background(color)
                .cornerRadius(3.dp),
        ) {}
        // Pace marker
        Box(modifier = GlanceModifier.padding(start = tickOffset)) {
            Box(
                modifier = GlanceModifier
                    .width(2.dp)
                    .height(10.dp)
                    .background(WidgetColors.onBackground),
            ) {}
        }
    }
}

/** Severity of the month as a whole, on the same thresholds as a category. */
private fun levelForOverall(payload: BudgetPayload): String = when {
    payload.spentFraction >= 1.0f -> "over"
    payload.spentFraction >= 0.8f -> "close"
    // Spending ahead of the month is worth flagging even while under the limit:
    // that is the situation the pace tick exists to reveal.
    payload.verdict == "ahead" -> "close"
    else -> "healthy"
}
