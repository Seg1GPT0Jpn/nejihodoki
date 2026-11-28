package jp.himatsubushi.guard

import android.os.Handler
import android.os.Looper
import jp.himatsubushi.guard.core.*
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/** 使用時間のグラフ（今日・7 日）、上限内の連続日数、週のまとめ。 */
class DashboardActivity : BaseActivity() {
    override val titleRes = R.string.dash_title
    private val ui = Handler(Looper.getMainLooper())
    @Volatile private var token = 0

    override fun render() {
        rebuild { addView(note(getString(R.string.dash_loading))) }
        if (!Perms.usage(this)) { rebuild { addView(card(text(getString(R.string.dash_need_usage), 15f, true), btn(getString(R.string.onb_open_settings)) { openOrToast(Perms.usageIntent(this@DashboardActivity), Perms.usageIntentFallback()) })) }; return }
        val my = ++token
        val zone = store.zone()
        val nowTrusted = store.now()
        val wall = System.currentTimeMillis()
        val days = Ledger.lastDays(nowTrusted, zone, 14)
        val from = Schedule.dayStartMs(nowTrusted - 13L * 86_400_000L + 3_600_000L, zone)
        Thread {
            val totals = if (Perms.usage(this)) UsageReader(this).dayTotals(from, wall, zone) else emptyMap()
            val rules = store.settings.rules
            val perDay = LinkedHashMap<String, Map<String, Long>>()
            for (d in days) {
                val m = HashMap<String, Long>(totals[d] ?: emptyMap())
                for ((p, v) in store.usage.day(d)) if ((m[p] ?: 0L) < v) m[p] = v
                perDay[d] = m
            }
            ui.post { if (my == token && !isFinishing) draw(days, perDay, rules, zone) }
        }.start()
    }

    private fun draw(days: List<String>, perDay: Map<String, Map<String, Long>>, rules: List<Rule>, zone: java.time.ZoneId) {
        val tracked = rules.filter { it.enabled }
        val results = days.map { d ->
            val u = perDay[d] ?: emptyMap()
            DayResult(d, Streaks.withinLimits(tracked, u, store.bonus.day(d)), u.filterKeys { true }.values.sum())
        }
        val firstDay = store.setupDay.ifEmpty { days.first() }
        val counted = results.filter { it.day >= firstDay }
        val week = results.takeLast(7)
        val weekPerApp = HashMap<String, Long>()
        for (d in week) for ((p, v) in perDay[d.day].orEmpty()) weekPerApp[p] = (weekPerApp[p] ?: 0L) + v
        val sum = Weekly.summarize(week, weekPerApp)

        rebuild {
            // 連続日数・週のまとめ
            val streak = Streaks.current(counted)
            val best = Streaks.best(counted)
            addView(card(
                text(getString(R.string.dash_streak, streak), 20f, true, com.google.android.material.R.attr.colorPrimary),
                note(getString(R.string.dash_streak_best, best)),
                note(getString(R.string.dash_streak_note)),
            ))

            // 今日
            addView(heading(getString(R.string.dash_today)))
            val today = perDay[days.last()].orEmpty().filter { it.value >= 60_000L }.entries.sortedByDescending { it.value }.take(8)
            if (today.isEmpty()) addView(note(getString(R.string.dash_none)))
            else {
                val chart = BarChartView(this@DashboardActivity, true, 120)
                val bars = today.map { (p, v) ->
                    val r = tracked.firstOrNull { it.pkg == p }
                    val lim = r?.dailyLimitMin?.let { it * 60_000L + store.bonus.get(days.last(), p) }
                    BarChartView.Bar(Apps.label(this@DashboardActivity, p), v / 60000f, fmtMin(v), lim?.let { it / 60000f }, lim != null && v > lim)
                }
                chart.setBars(bars, getString(R.string.dash_today) + ": " + today.joinToString { Apps.label(this@DashboardActivity, it.key) + " " + fmtMin(it.value) })
                addView(card(chart))
                addView(note(getString(R.string.dash_marker_note)))
            }

            // 7 日
            addView(heading(getString(R.string.dash_week)))
            val vchart = BarChartView(this@DashboardActivity, false, 170)
            vchart.setBars(week.map { d ->
                val ld = LocalDate.parse(d.day)
                BarChartView.Bar(ld.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.getDefault()) + ld.dayOfMonth, d.totalMs / 60000f, fmtHM(d.totalMs), null, !d.withinLimits)
            }, getString(R.string.dash_week) + ": " + week.joinToString { it.day + " " + fmtMin(it.totalMs) })
            addView(card(vchart))

            // 制限したアプリごと
            for (r in tracked.filter { it.dailyLimitMin != null }.take(6)) {
                addView(text(Apps.label(this@DashboardActivity, r.pkg), 15f, true).also { it.setPadding(0, dp(12), 0, dp(2)) })
                val c = BarChartView(this@DashboardActivity, false, 120)
                c.setBars(week.map { d ->
                    val v = perDay[d.day].orEmpty()[r.pkg] ?: 0L
                    val lim = r.dailyLimitMin!! * 60_000L + store.bonus.get(d.day, r.pkg)
                    val ld = LocalDate.parse(d.day)
                    BarChartView.Bar(ld.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.getDefault()), v / 60000f, fmtMin(v), lim / 60000f, v > lim)
                }, Apps.label(this@DashboardActivity, r.pkg))
                addView(card(c))
            }

            // 週のまとめ
            addView(heading(getString(R.string.dash_summary)))
            val sb = vbox()
            sb.addView(text(getString(R.string.dash_sum_total, fmtHM(sum.totalMs), fmtHM(sum.dailyAverageMs)), 15f))
            sb.addView(text(getString(R.string.dash_sum_within, sum.daysWithinLimits, week.size), 15f).also { it.setPadding(0, dp(4), 0, 0) })
            sum.busiestDay?.let { sb.addView(text(getString(R.string.dash_sum_busiest, it, fmtHM(week.first { d -> d.day == it }.totalMs)), 15f).also { v -> v.setPadding(0, dp(4), 0, 0) }) }
            if (sum.perAppMs.isNotEmpty()) {
                sb.addView(text(getString(R.string.dash_sum_top), 15f, true).also { it.setPadding(0, dp(8), 0, 0) })
                for ((p, v) in sum.perAppMs.take(5)) sb.addView(note("・" + Apps.label(this@DashboardActivity, p) + "  " + fmtHM(v)))
            }
            addView(card(sb))
        }
    }

    private fun fmtHM(ms: Long) = fmtMin(ms)
}
