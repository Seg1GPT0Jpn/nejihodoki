package jp.himatsubushi.guard.core

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.*
import org.junit.Test

class EnforcerTest {
    private val tokyo = ZoneId.of("Asia/Tokyo")
    private fun ms(d: Int, h: Int, mi: Int = 0) = ZonedDateTime.of(2026, 11, d, h, mi, 0, 0, tokyo).toInstant().toEpochMilli()
    private val self = "jp.himatsubushi.guard"

    private fun input(pkg: String, s: Settings, now: Long, used: Long = 0, bonus: Long = 0, emergency: Long = 0, focus: FocusSession? = null) =
        EvalInput(pkg, s, now, used, bonus, emergency, focus, self, setOf("com.google.android.apps.nexuslauncher"))

    private val yt = Rule("com.youtube", dailyLimitMin = 30, windows = listOf(Window(setOf(1, 2, 3, 4, 5), 8 * 60, 15 * 60, "学校")))

    @Test fun limit_remaining_math() {
        assertNull(Limits.remainingMs(null, 10, 0))
        assertEquals(60_000L, Limits.remainingMs(1, 0, 0))
        assertEquals(-1L, Limits.remainingMs(1, 60_001, 0))
        assertEquals(30_000L, Limits.remainingMs(1, 90_000, 60_000))
    }

    @Test fun allowed_outside_window_and_under_limit() {
        val s = Settings(rules = listOf(yt))
        assertNull(Enforcer.evaluate(input("com.youtube", s, ms(23, 16), used = 29 * 60_000L)))
    }

    @Test fun blocked_in_window_with_unlock_time_and_label() {
        val s = Settings(rules = listOf(yt))
        val b = Enforcer.evaluate(input("com.youtube", s, ms(23, 9)))!!
        assertEquals(Reason.WINDOW, b.reason)
        assertEquals(ms(23, 15), b.unlockAtMs)
        assertEquals("学校", b.label)
        assertFalse(b.quizAllowed)
    }

    @Test fun daily_limit_blocks_until_midnight_and_allows_quiz() {
        val s = Settings(rules = listOf(yt))
        val b = Enforcer.evaluate(input("com.youtube", s, ms(23, 16), used = 31 * 60_000L))!!
        assertEquals(Reason.DAILY_LIMIT, b.reason)
        assertEquals(ms(24, 0), b.unlockAtMs)
        assertTrue(b.quizAllowed)
        // おまけ 5 分で再び使える
        assertNull(Enforcer.evaluate(input("com.youtube", s, ms(23, 16), used = 31 * 60_000L, bonus = 5 * 60_000L)))
    }

    @Test fun emergency_unlock_bypasses_everything() {
        val s = Settings(rules = listOf(yt))
        assertNull(Enforcer.evaluate(input("com.youtube", s, ms(23, 9), emergency = ms(23, 9) + 1000)))
    }

    @Test fun never_block_list() {
        val s = Settings(rules = listOf(Rule("com.android.dialer", dailyLimitMin = 0), Rule(self, dailyLimitMin = 0)))
        assertNull(Enforcer.evaluate(input("com.android.dialer", s, ms(23, 9))))
        assertNull(Enforcer.evaluate(input(self, s, ms(23, 9))))
        assertNull(Enforcer.evaluate(input("com.google.android.apps.nexuslauncher", s, ms(23, 9))))
    }

    @Test fun focus_blocks_only_chosen_apps_until_end() {
        val s = Settings()
        val f = FocusSession(ms(23, 10), ms(23, 10, 25), setOf("com.game"))
        val b = Enforcer.evaluate(input("com.game", s, ms(23, 10, 5), focus = f))!!
        assertEquals(Reason.FOCUS, b.reason)
        assertEquals(ms(23, 10, 25), b.unlockAtMs)
        assertNull(Enforcer.evaluate(input("com.other", s, ms(23, 10, 5), focus = f)))
        assertNull(Enforcer.evaluate(input("com.game", s, ms(23, 10, 26), focus = f)))
    }

    @Test fun settings_app_is_protected_only_while_a_window_or_commitment_is_active() {
        val s = Settings(rules = listOf(yt), protectSettingsApp = true)
        assertNotNull(Enforcer.evaluate(input("com.android.settings", s, ms(23, 9))))
        assertNull(Enforcer.evaluate(input("com.android.settings", s, ms(23, 16))))
        val c = s.copy(commitmentUntilMs = ms(30, 0))
        assertEquals(Reason.PROTECTED_SETTINGS, Enforcer.evaluate(input("com.android.settings", c, ms(23, 16)))!!.reason)
        assertNull(Enforcer.evaluate(input("com.android.settings", s.copy(protectSettingsApp = false), ms(23, 9))))
    }

    @Test fun disabled_rule_is_ignored() {
        val s = Settings(rules = listOf(yt.copy(enabled = false)))
        assertNull(Enforcer.evaluate(input("com.youtube", s, ms(23, 9))))
    }
}
