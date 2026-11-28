package jp.himatsubushi.guard.core

import java.time.ZoneId
import org.junit.Assert.*
import org.junit.Test

class ClockTest {
    private val t0 = 1_800_000_000_000L
    private val min = 60_000L

    private fun start() = TrustedClock.observe(null, t0, 1_000_000L, 1L, false).state

    @Test fun normal_progress_keeps_trusted_equal_to_wall() {
        val r = TrustedClock.observe(start(), t0 + 5 * min, 1_000_000L + 5 * min, 1L, false)
        assertEquals(t0 + 5 * min, r.trustedNowMs); assertTrue(r.events.isEmpty())
    }

    @Test fun rollback_with_auto_time_off_is_ignored_and_reported_once() {
        val s = start()
        // 1 時間後に、手で壁時計を 3 時間戻す
        val el = 1_000_000L + 60 * min
        val r = TrustedClock.observe(s, t0 + 60 * min - 180 * min, el, 1L, false)
        assertEquals(t0 + 60 * min, r.trustedNowMs)
        assertEquals(1, r.events.size)
        assertEquals(ClockEventKind.ROLLBACK, r.events[0].kind); assertFalse(r.events[0].accepted)
        // 1 分後：壁時計も 1 分進んだだけ。信頼時計は進み、同じずれは再報告しない
        val r2 = TrustedClock.observe(r.state, t0 + 60 * min - 180 * min + min, el + min, 1L, false)
        assertEquals(t0 + 61 * min, r2.trustedNowMs); assertTrue(r2.events.isEmpty())
    }

    @Test fun forward_jump_with_auto_time_off_is_ignored() {
        val r = TrustedClock.observe(start(), t0 + 5 * 3_600_000L, 1_000_000L + min, 1L, false)
        assertEquals(t0 + min, r.trustedNowMs)
        assertEquals(ClockEventKind.FORWARD, r.events.single().kind)
    }

    @Test fun auto_time_on_accepts_network_correction() {
        val r = TrustedClock.observe(start(), t0 + 5 * min + 10 * min, 1_000_000L + 5 * min, 1L, true)
        assertEquals(t0 + 15 * min, r.trustedNowMs)
        assertTrue(r.events.single().accepted)
    }

    @Test fun reboot_never_goes_before_the_last_trusted_time() {
        val s = TrustedClock.observe(start(), t0 + 30 * min, 1_000_000L + 30 * min, 1L, false).state
        // 再起動して elapsed が小さくなり、壁時計は 2 時間前に設定されていた
        val r = TrustedClock.observe(s, t0 - 90 * min, 5_000L, 2L, false)
        assertEquals(t0 + 30 * min, r.trustedNowMs)
        assertEquals(ClockEventKind.ROLLBACK, r.events.single().kind)
        // 再起動後に時間が進めば、そこから進む
        val r2 = TrustedClock.observe(r.state, t0 - 90 * min + 10 * min, 5_000L + 10 * min, 2L, false)
        assertEquals(t0 + 40 * min, r2.trustedNowMs)
    }

    @Test fun reboot_with_normal_clock_is_fine() {
        val r = TrustedClock.observe(start(), t0 + 600 * min, 3_000L, 2L, false)
        assertEquals(t0 + 600 * min, r.trustedNowMs); assertTrue(r.events.isEmpty())
    }

    @Test fun resync_sets_a_new_anchor() {
        val s = TrustedClock.resync(start(), t0 - 5000 * min, 7L, 1L)
        assertEquals(t0 - 5000 * min, s.anchorWallMs)
    }

    @Test fun changing_the_clock_does_not_grant_a_new_day() {
        val zone = ZoneId.of("Asia/Tokyo")
        val day = Schedule.dayKey(t0, zone)
        val r = TrustedClock.observe(start(), t0 + 30 * 3_600_000L, 1_000_000L + min, 1L, false)
        assertEquals(day, Schedule.dayKey(r.trustedNowMs, zone))
    }

    @Test fun emergency_limiter_rate_limits_per_day_and_gap() {
        val zone = ZoneId.of("Asia/Tokyo")
        val now = t0
        val log = listOf(EmergencyEntry(now - 10 * min, "a", "x"), EmergencyEntry(now - 400 * min, "a", "y"))
        assertEquals(EmergencyLimiter.Verdict.OK, EmergencyLimiter.check(emptyList(), now, zone, 3, 0).verdict)
        assertEquals(EmergencyLimiter.Verdict.DAILY_MAX, EmergencyLimiter.check(log.map { it.copy(atMs = now - 1000) }, now, zone, 2, 0).verdict)
        val soon = EmergencyLimiter.check(log, now, zone, 0, EmergencyLimiter.COMMITMENT_MIN_GAP_MIN)
        assertEquals(EmergencyLimiter.Verdict.TOO_SOON, soon.verdict)
        assertEquals(now - 10 * min + 30 * min, soon.nextAllowedMs)
        assertEquals(EmergencyLimiter.Verdict.OK, EmergencyLimiter.check(log, now, zone, 0, 5).verdict)
    }

    @Test fun heartbeat_gap_detects_kill_but_not_reboot_or_expected_stop() {
        val g = HeartbeatCheck.GRACE_MS
        assertEquals(g + 1, HeartbeatCheck.killedGapMs(1000, 1, 1000 + g + 1, 1, false))
        assertNull(HeartbeatCheck.killedGapMs(1000, 1, 1000 + g, 1, false))
        assertNull(HeartbeatCheck.killedGapMs(1000, 1, 1000 + 10 * g, 2, false))
        assertNull(HeartbeatCheck.killedGapMs(1000, 1, 1000 + 10 * g, 1, true))
        assertNull(HeartbeatCheck.killedGapMs(0, 1, 1000 + 10 * g, 1, false))
    }

    @Test fun honesty_report_counts_week_and_clean_days() {
        val zone = ZoneId.of("Asia/Tokyo")
        val day = 86_400_000L
        val ev = listOf(
            TamperEvent(t0 - 1 * day, TamperType.CLOCK_ROLLBACK),
            TamperEvent(t0 - 1 * day, TamperType.PERMISSION_REVOKED),
            TamperEvent(t0 - 2 * day, TamperType.COOLDOWN_STARTED),
            TamperEvent(t0 - 20 * day, TamperType.SERVICE_KILLED),
        )
        val em = listOf(EmergencyEntry(t0 - 3 * day, "a", "急用"), EmergencyEntry(t0 - 30 * day, "a", "古い"))
        val r = HonestyReports.build(ev, em, t0, zone)
        assertEquals(2, r.tamperTotal); assertEquals(1, r.emergencyCount); assertEquals(1, r.changeCount)
        assertEquals(1, r.tamperCounts[TamperType.CLOCK_ROLLBACK])
        assertEquals(5, r.cleanDays)
    }
}
