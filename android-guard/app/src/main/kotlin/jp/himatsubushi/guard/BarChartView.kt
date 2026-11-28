package jp.himatsubushi.guard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.TypedValue
import android.view.View
import com.google.android.material.R as M

/** 棒グラフ（自前で描く）。縦棒・横棒、上限の印つき。 */
class BarChartView(ctx: Context, private val horizontal: Boolean, private val heightDp: Int) : View(ctx) {
    data class Bar(val label: String, val value: Float, val valueText: String, val marker: Float? = null, val over: Boolean = false)

    private fun dp(v: Int) = context.dp(v)
    private fun attrColor(a: Int) = context.attrColor(a)

    private var bars: List<Bar> = emptyList()
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val overPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val markPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        fun sp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, resources.displayMetrics)
        barPaint.color = attrColor(M.attr.colorPrimary)
        overPaint.color = context.getColor(R.color.bad)
        trackPaint.color = attrColor(M.attr.colorSurfaceVariant)
        textPaint.color = attrColor(M.attr.colorOnSurface); textPaint.textSize = sp(12f)
        dimPaint.color = attrColor(M.attr.colorOnSurfaceVariant); dimPaint.textSize = sp(11f)
        markPaint.color = attrColor(M.attr.colorSecondary); markPaint.strokeWidth = dp(2).toFloat()
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun setBars(b: List<Bar>, description: String) {
        bars = b; contentDescription = description
        if (horizontal) layoutParams = layoutParams?.also { it.height = dp(heightDp.coerceAtLeast(b.size * 34 + 8)) }
        requestLayout(); invalidate()
    }

    override fun onMeasure(w: Int, h: Int) {
        val hh = if (horizontal) dp((bars.size * 34 + 8).coerceAtLeast(40)) else dp(heightDp)
        setMeasuredDimension(MeasureSpec.getSize(w), hh)
    }

    private fun fit(s: String, p: Paint, maxW: Float): String {
        if (p.measureText(s) <= maxW) return s
        var t = s
        while (t.length > 1 && p.measureText("$t…") > maxW) t = t.dropLast(1)
        return "$t…"
    }

    override fun onDraw(c: Canvas) {
        if (bars.isEmpty()) return
        val maxV = bars.maxOf { maxOf(it.value, it.marker ?: 0f) }.coerceAtLeast(1f)
        if (horizontal) {
            val labelW = width * 0.32f
            val valueW = dp(64).toFloat()
            val trackL = labelW + dp(6)
            val trackR = width - valueW
            val rowH = dp(34).toFloat()
            bars.forEachIndexed { i, b ->
                val top = i * rowH + dp(4)
                val cy = top + rowH / 2
                c.drawText(fit(b.label, textPaint, labelW), 0f, cy + dp(4), textPaint)
                val r = RectF(trackL, cy - dp(7), trackR, cy + dp(7))
                c.drawRoundRect(r, dp(7).toFloat(), dp(7).toFloat(), trackPaint)
                val w = (trackR - trackL) * (b.value / maxV)
                if (w > 0) c.drawRoundRect(RectF(trackL, r.top, trackL + w.coerceAtLeast(dp(8).toFloat()), r.bottom), dp(7).toFloat(), dp(7).toFloat(), if (b.over) overPaint else barPaint)
                b.marker?.let { m -> val x = trackL + (trackR - trackL) * (m / maxV); c.drawLine(x, cy - dp(11), x, cy + dp(11), markPaint) }
                c.drawText(b.valueText, trackR + dp(6), cy + dp(4), dimPaint)
            }
        } else {
            val bottom = height - dp(22).toFloat()
            val topPad = dp(18).toFloat()
            val gap = dp(8).toFloat()
            val bw = (width - gap * (bars.size + 1)) / bars.size
            bars.forEachIndexed { i, b ->
                val x = gap + i * (bw + gap)
                val hh = (bottom - topPad) * (b.value / maxV)
                val r = RectF(x, bottom - hh.coerceAtLeast(dp(2).toFloat()), x + bw, bottom)
                c.drawRoundRect(r, dp(4).toFloat(), dp(4).toFloat(), if (b.over) overPaint else barPaint)
                b.marker?.let { m -> val y = bottom - (bottom - topPad) * (m / maxV); c.drawLine(x - dp(2), y, x + bw + dp(2), y, markPaint) }
                val vt = b.valueText
                c.drawText(vt, x + (bw - dimPaint.measureText(vt)) / 2, r.top - dp(4), dimPaint)
                val lt = fit(b.label, dimPaint, bw + gap)
                c.drawText(lt, x + (bw - dimPaint.measureText(lt)) / 2, height - dp(6).toFloat(), dimPaint)
            }
        }
    }
}
