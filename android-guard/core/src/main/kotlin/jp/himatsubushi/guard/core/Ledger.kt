package jp.himatsubushi.guard.core

import java.time.ZoneId

/** 日付 → アプリ → ミリ秒 の表（使った時間・もらったおまけ時間）。 */
class Ledger(initial: Map<String, Map<String, Long>> = emptyMap()) {
    private val data = LinkedHashMap<String, MutableMap<String, Long>>()

    init { for ((d, m) in initial) data[d] = LinkedHashMap(m) }

    fun get(day: String, pkg: String): Long = data[day]?.get(pkg) ?: 0L

    fun day(day: String): Map<String, Long> = data[day] ?: emptyMap()

    fun add(day: String, pkg: String, ms: Long) {
        if (ms <= 0) return
        val m = data.getOrPut(day) { LinkedHashMap() }
        m[pkg] = (m[pkg] ?: 0L) + ms
    }

    /** 外（使用状況イベント）から求めた値のほうが大きければ採用する。 */
    fun mergeMax(day: String, pkg: String, ms: Long) {
        if (ms <= 0) return
        val m = data.getOrPut(day) { LinkedHashMap() }
        if ((m[pkg] ?: 0L) < ms) m[pkg] = ms
    }

    fun prune(keepDays: Set<String>) { data.keys.retainAll(keepDays) }

    fun toMap(): Map<String, Map<String, Long>> = data.mapValues { it.value.toMap() }

    fun toJson(): Map<String, Any?> = data.mapValues { it.value.toMap() }

    companion object {
        fun fromJson(m: Map<String, Any?>?): Ledger {
            val out = LinkedHashMap<String, Map<String, Long>>()
            for ((d, v) in m.orEmpty()) {
                val inner = v.asMap() ?: continue
                out[d] = inner.mapValues { (it.value as? Long) ?: (it.value as? Double)?.toLong() ?: 0L }
            }
            return Ledger(out)
        }

        fun lastDays(nowMs: Long, zone: ZoneId, n: Int): List<String> =
            (0 until n).map { Schedule.dayKey(Schedule.dayStartMs(nowMs, zone) - it * 86_400_000L + 3_600_000L, zone) }.reversed()
    }
}

data class DayResult(val day: String, val withinLimits: Boolean, val totalMs: Long)

object Streaks {
    /** その日に、上限のあるアプリがどれも上限（おまけ込み）を超えていなければ OK。 */
    fun withinLimits(rules: List<Rule>, usage: Map<String, Long>, bonus: Map<String, Long>): Boolean =
        rules.none { r ->
            r.enabled && r.dailyLimitMin != null &&
                (usage[r.pkg] ?: 0L) > r.dailyLimitMin * 60_000L + (bonus[r.pkg] ?: 0L)
        }

    /** days は古い順。今日（最後）がまだ OK なら今日も数える。ダメなら今日は数えず、昨日までの連続日数。 */
    fun current(days: List<DayResult>): Int {
        var i = days.size - 1
        if (i >= 0 && !days[i].withinLimits) i--
        var n = 0
        while (i >= 0 && days[i].withinLimits) { n++; i-- }
        return n
    }

    fun best(days: List<DayResult>): Int {
        var best = 0
        var cur = 0
        for (d in days) { if (d.withinLimits) { cur++; if (cur > best) best = cur } else cur = 0 }
        return best
    }
}

data class WeeklySummary(
    val totalMs: Long,
    val perAppMs: List<Pair<String, Long>>,
    val daysWithinLimits: Int,
    val busiestDay: String?,
    val quietestDay: String?,
    val dailyAverageMs: Long,
)

object Weekly {
    fun summarize(days: List<DayResult>, perApp: Map<String, Long>): WeeklySummary {
        val total = days.sumOf { it.totalMs }
        val busiest = days.maxByOrNull { it.totalMs }?.takeIf { it.totalMs > 0 }?.day
        val quiet = days.minByOrNull { it.totalMs }?.day
        return WeeklySummary(
            total, perApp.entries.sortedByDescending { it.value }.map { it.key to it.value },
            days.count { it.withinLimits }, busiest, quiet, if (days.isEmpty()) 0 else total / days.size,
        )
    }
}
