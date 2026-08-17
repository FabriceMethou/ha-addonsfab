package com.methou.myfinance.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.graphics.createBitmap

/**
 * Draws the budget ring: how much of the limit is spent, and a tick marking how
 * much of the month has gone.
 *
 * Glance has no arc primitive, so this is a plain Canvas bitmap. It stays here
 * rather than being rendered from Flutter because the widget is redrawn on every
 * theme change and resize; rasterising through the Flutter engine each time
 * would mean starting it just to produce an image the launcher wants now.
 *
 * The tick is the point of the whole thing. A ring at 68% says nothing on its
 * own — that is comfortable on the 22nd and alarming on the 8th. Two marks in
 * one glance answer the question people actually have.
 */
object RingBitmap {

    /**
     * @param sizePx    outer size in pixels.
     * @param spent     share of the limit used. Values above 1 are clamped to a
     *                  full ring; the percentage beside it keeps the real figure.
     * @param pace      share of the month elapsed, in `[0, 1]`.
     * @param arcColor  colour of the spent arc, already chosen for the theme.
     * @param trackColor colour of the unspent remainder.
     * @param tickColor colour of the pace marker.
     */
    fun draw(
        sizePx: Int,
        spent: Float,
        pace: Float,
        arcColor: Int,
        trackColor: Int,
        tickColor: Int,
    ): Bitmap {
        val size = sizePx.coerceAtLeast(1)
        val bitmap = createBitmap(size, size)
        val canvas = Canvas(bitmap)

        val stroke = size * 0.12f
        val inset = stroke / 2f
        val bounds = RectF(inset, inset, size - inset, size - inset)

        val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            color = trackColor
        }
        canvas.drawArc(bounds, 0f, 360f, false, track)

        // Starts at twelve o'clock and runs clockwise, the direction a filling
        // gauge is read.
        val sweep = spent.coerceIn(0f, 1f) * 360f
        if (sweep > 0f) {
            val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
                color = arcColor
            }
            canvas.drawArc(bounds, -90f, sweep, false, arc)
        }

        // The pace tick crosses the whole stroke so it stays visible whether it
        // sits on the spent arc or on the bare track.
        val tickAngle = Math.toRadians((pace.coerceIn(0f, 1f) * 360f - 90f).toDouble())
        val centre = size / 2f
        val radius = centre - inset
        val innerR = radius - stroke / 2f - size * 0.02f
        val outerR = radius + stroke / 2f + size * 0.02f
        val tick = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = size * 0.028f
            strokeCap = Paint.Cap.ROUND
            color = tickColor
        }
        canvas.drawLine(
            centre + (innerR * Math.cos(tickAngle)).toFloat(),
            centre + (innerR * Math.sin(tickAngle)).toFloat(),
            centre + (outerR * Math.cos(tickAngle)).toFloat(),
            centre + (outerR * Math.sin(tickAngle)).toFloat(),
            tick,
        )

        return bitmap
    }
}
