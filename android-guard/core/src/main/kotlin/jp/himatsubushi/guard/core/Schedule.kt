package jp.himatsubushi.guard.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

data class ActiveWindow(val window: Window, val startMs: Long, val endMs: Long)

/** ブロック時間帯の判定。日またぎ・夏時間（DST）・タイムゾーンに対応。 */
object Schedule {
    private fun at(date: LocalDate, min: Int, zone: ZoneId): Long {
        val d = date.plusDays((min / 1440).toLong())
        val m = min % 1440
        return d.atTime(m / 60, m % 60).atZone(zone).toInstant().toEpochMilli()
    }

    /** 曜日は「開始した日」で数える（金曜 22:00〜翌 6:00 は金曜の窓）。 */
    fun activeWindow(windows: List<Window>, nowMs: Long, zone: ZoneId): ActiveWindow? {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        var best: ActiveWindow? = null
        for (off in 0 downTo -1) {
            val d = today.plusDays(off.toLong())
            val dow = d.dayOfWeek.value
            for (w0 in windows) {
                val w = w0.normalized()
                if (dow !in w.days) continue
                val s = at(d, w.startMin, zone)
                val e = if (w.endMin > w.startMin) at(d, w.endMin, zone) else at(d.plusDays(1), w.endMin, zone)
                if (nowMs in s until e) {
                    if (best == null || e > best.endMs) best = ActiveWindow(w, s, e)
                }
            }
        }
        return best
    }

    /** 連続した窓（15:00 に終わって 15:00 に始まる、など）をつなげた「ほんとうに解ける時刻」。 */
    fun unlockAt(windows: List<Window>, nowMs: Long, zone: ZoneId): ActiveWindow? {
        var cur = activeWindow(windows, nowMs, zone) ?: return null
        var guard = 0
        while (guard++ < 16) {
            val next = activeWindow(windows, cur.endMs, zone) ?: break
            if (next.endMs <= cur.endMs) break
            cur = ActiveWindow(cur.window, cur.startMs, next.endMs)
        }
        return cur
    }

    /** 次に始まる窓の開始時刻（なければ null）。8 日先まで見る。 */
    fun nextStart(windows: List<Window>, nowMs: Long, zone: ZoneId): Long? {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        var best: Long? = null
        for (off in 0..8) {
            val d = today.plusDays(off.toLong())
            for (w0 in windows) {
                val w = w0.normalized()
                if (d.dayOfWeek.value !in w.days) continue
                val s = at(d, w.startMin, zone)
                if (s > nowMs && (best == null || s < best)) best = s
            }
        }
        return best
    }

    /** その時刻が属する「日」の文字列（yyyy-MM-dd）。 */
    fun dayKey(ms: Long, zone: ZoneId): String = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toString()

    fun dayStartMs(ms: Long, zone: ZoneId): Long =
        Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli()

    fun nextDayStartMs(ms: Long, zone: ZoneId): Long =
        Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()

    fun zoneOrDefault(id: String, fallback: ZoneId = ZoneId.of("Asia/Tokyo")): ZoneId =
        try { ZoneId.of(id) } catch (e: Exception) { fallback }

    fun localTime(ms: Long, zone: ZoneId): ZonedDateTime = Instant.ofEpochMilli(ms).atZone(zone)
}
