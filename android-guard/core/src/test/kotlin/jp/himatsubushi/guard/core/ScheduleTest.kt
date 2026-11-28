package jp.himatsubushi.guard.core

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.*
import org.junit.Test

class ScheduleTest {
    private val tokyo = ZoneId.of("Asia/Tokyo")
    private val ny = ZoneId.of("America/New_York")

    private fun ms(z: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int = 0) =
        ZonedDateTime.of(y, mo, d, h, mi, 0, 0, z).toInstant().toEpochMilli()

    private val school = Window(setOf(1, 2, 3, 4, 5), 8 * 60 + 30, 15 * 60)
    private val night = Window(setOf(1, 2, 3, 4, 5, 6, 7), 22 * 60, 6 * 60)

    @Test fun inside_and_outside_simple_window() {
        // 2026-11-23 は月曜
        assertNotNull(Schedule.activeWindow(listOf(school), ms(tokyo, 2026, 11, 23, 9), tokyo))
        assertNull(Schedule.activeWindow(listOf(school), ms(tokyo, 2026, 11, 23, 15), tokyo)) // 終了ちょうどは解除
        assertNull(Schedule.activeWindow(listOf(school), ms(tokyo, 2026, 11, 23, 8, 29), tokyo))
        assertNull(Schedule.activeWindow(listOf(school), ms(tokyo, 2026, 11, 28, 10), tokyo)) // 土曜
    }

    @Test fun overnight_window_spans_midnight_and_counts_start_day() {
        val fri = Window(setOf(5), 22 * 60, 6 * 60)
        // 金曜 23:00 と 土曜 03:00 は中、土曜 23:00 は外（土曜の窓は無い）
        assertNotNull(Schedule.activeWindow(listOf(fri), ms(tokyo, 2026, 11, 27, 23), tokyo))
        val a = Schedule.activeWindow(listOf(fri), ms(tokyo, 2026, 11, 28, 3), tokyo)
        assertNotNull(a)
        assertEquals(ms(tokyo, 2026, 11, 28, 6), a!!.endMs)
        assertNull(Schedule.activeWindow(listOf(fri), ms(tokyo, 2026, 11, 28, 23), tokyo))
        assertNull(Schedule.activeWindow(listOf(fri), ms(tokyo, 2026, 11, 27, 21, 59), tokyo))
    }

    @Test fun equal_start_and_end_means_24_hours() {
        val all = Window(setOf(1), 0, 0)
        val a = Schedule.activeWindow(listOf(all), ms(tokyo, 2026, 11, 23, 12), tokyo)
        assertNotNull(a)
        assertEquals(ms(tokyo, 2026, 11, 24, 0), a!!.endMs)
    }

    @Test fun end_of_day_1440_is_midnight() {
        val w = Window(setOf(1), 20 * 60, 1440)
        val a = Schedule.activeWindow(listOf(w), ms(tokyo, 2026, 11, 23, 23, 30), tokyo)
        assertEquals(ms(tokyo, 2026, 11, 24, 0), a!!.endMs)
    }

    @Test fun back_to_back_windows_report_the_real_unlock_time() {
        val a = Window(setOf(1), 9 * 60, 12 * 60)
        val b = Window(setOf(1), 12 * 60, 15 * 60)
        val u = Schedule.unlockAt(listOf(a, b), ms(tokyo, 2026, 11, 23, 10), tokyo)
        assertEquals(ms(tokyo, 2026, 11, 23, 15), u!!.endMs)
    }

    @Test fun dst_spring_forward_overnight_window_ends_at_local_6am() {
        // 2026-03-08 は NY の夏時間開始日（2:00 → 3:00）。土曜 22:00 〜 日曜 6:00 は 7 時間
        val w = Window(setOf(6), 22 * 60, 6 * 60)
        val now = ms(ny, 2026, 3, 8, 1, 0)
        val a = Schedule.activeWindow(listOf(w), now, ny)
        assertNotNull(a)
        assertEquals(ms(ny, 2026, 3, 8, 6), a!!.endMs)
        assertEquals(7 * 3_600_000L, a.endMs - a.startMs)
    }

    @Test fun dst_fall_back_overnight_window_is_9_hours() {
        val w = Window(setOf(6), 22 * 60, 6 * 60)
        val a = Schedule.activeWindow(listOf(w), ms(ny, 2026, 11, 1, 3, 0), ny)
        assertNotNull(a)
        assertEquals(9 * 3_600_000L, a!!.endMs - a.startMs)
        assertEquals(ms(ny, 2026, 11, 1, 6), a.endMs)
    }

    @Test fun the_same_instant_is_judged_in_the_home_zone_only() {
        val inst = ms(tokyo, 2026, 11, 23, 9)
        assertNotNull(Schedule.activeWindow(listOf(school), inst, tokyo))
        assertNull(Schedule.activeWindow(listOf(school), inst, ny)) // ニューヨークでは日曜 19:00
    }

    @Test fun next_start_and_day_helpers() {
        val n = Schedule.nextStart(listOf(school), ms(tokyo, 2026, 11, 27, 16), tokyo) // 金曜 16:00
        assertEquals(ms(tokyo, 2026, 11, 30, 8, 30), n)
        assertEquals("2026-11-23", Schedule.dayKey(ms(tokyo, 2026, 11, 23, 0, 1), tokyo))
        assertEquals(ms(tokyo, 2026, 11, 24, 0), Schedule.nextDayStartMs(ms(tokyo, 2026, 11, 23, 23, 59), tokyo))
    }

    @Test fun night_window_covers_both_sides_of_midnight() {
        assertNotNull(Schedule.activeWindow(listOf(night), ms(tokyo, 2026, 11, 24, 0, 30), tokyo))
        assertNull(Schedule.activeWindow(listOf(night), ms(tokyo, 2026, 11, 24, 12), tokyo))
    }
}
