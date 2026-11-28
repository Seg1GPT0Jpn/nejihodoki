package jp.himatsubushi.guard

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import jp.himatsubushi.guard.core.Schedule
import java.time.ZoneId

/** UsageStatsManager のイベントから、いま前面のアプリと、日ごとの使用時間を求める。 */
class UsageReader(ctx: Context) {
    private val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    private var fg: String? = null
    private var lastEnd = 0L
    private val ev = UsageEvents.Event()

    private companion object {
        const val RESUMED = 1       // MOVE_TO_FOREGROUND / ACTIVITY_RESUMED
        const val PAUSED = 2        // MOVE_TO_BACKGROUND / ACTIVITY_PAUSED
        const val SCREEN_ON = 15
        const val SCREEN_OFF = 16
        const val STOPPED = 23      // ACTIVITY_STOPPED
    }

    fun resetForeground() { fg = null; lastEnd = 0L }

    /** 差分だけ読む。最初の 1 回は、直近 3 時間さかのぼって状態を作る。 */
    fun pollForeground(nowWall: Long): String? {
        val m = usm ?: return null
        try {
            val from = if (lastEnd == 0L) nowWall - 3 * 3_600_000L else lastEnd - 1500
            val events = m.queryEvents(from, nowWall + 1000) ?: return fg
            while (events.hasNextEvent()) {
                events.getNextEvent(ev)
                when (ev.eventType) {
                    RESUMED -> fg = ev.packageName
                    PAUSED -> if (fg == ev.packageName) fg = null
                    SCREEN_OFF -> fg = null
                }
            }
            lastEnd = nowWall
        } catch (e: Exception) { /* 権限がなくなったときなど */ }
        return fg
    }

    /** from〜to の、日ごと・アプリごとの前面にいた時間（ミリ秒）。日の区切りは zone。 */
    fun dayTotals(fromWall: Long, toWall: Long, zone: ZoneId): Map<String, Map<String, Long>> {
        val m = usm ?: return emptyMap()
        val out = HashMap<String, HashMap<String, Long>>()
        fun span(pkg: String, s: Long, e: Long) {
            var a = s
            var guard = 0
            while (a < e && guard++ < 10) {
                val dayEnd = Schedule.nextDayStartMs(a, zone)
                val b = minOf(e, dayEnd)
                val d = out.getOrPut(Schedule.dayKey(a, zone)) { HashMap() }
                d[pkg] = (d[pkg] ?: 0L) + (b - a)
                a = b
            }
        }
        try {
            val events = m.queryEvents(fromWall, toWall) ?: return emptyMap()
            val open = HashMap<String, Long>()
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                val p = e.packageName ?: continue
                when (e.eventType) {
                    RESUMED -> { if (!open.containsKey(p)) open[p] = e.timeStamp }
                    PAUSED, STOPPED -> open.remove(p)?.let { span(p, it, e.timeStamp) }
                    SCREEN_OFF -> { for ((k, v) in open) span(k, v, e.timeStamp); open.clear() }
                }
            }
            // 閉じていないもの：いままさに使っているアプリだけ（古いまま残ったものは 30 分で打ち切る）
            for ((k, v) in open) span(k, v, minOf(toWall, v + 30 * 60_000L))
        } catch (ex: Exception) { /* 権限なし */ }
        return out
    }
}
