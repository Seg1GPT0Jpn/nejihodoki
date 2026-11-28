package jp.himatsubushi.guard.core

import org.junit.Assert.*
import org.junit.Test

class ChangeGateTest {
    private val now = 1_800_000_000_000L
    private val w = Window(setOf(1, 2, 3, 4, 5), 8 * 60, 15 * 60)
    private val base = Settings(
        rules = listOf(Rule("a", 30, listOf(w)), Rule("b", 60)),
        focusApps = setOf("a", "b"),
    )

    @Test fun tightening_applies_immediately() {
        val p = base.copy(rules = listOf(Rule("a", 20, listOf(w, Window(setOf(6), 0, 600))), Rule("b", 60), Rule("c", 10)))
        val r = ChangeGate.submit(base, p, now)
        assertTrue(r.pending.isEmpty()); assertTrue(r.rejected.isEmpty())
        assertEquals(p.rules, r.applied.rules)
    }

    @Test fun raising_a_limit_or_removing_it_is_loosening() {
        assertTrue(ChangeGate.ruleLoosened(Rule("a", 30), Rule("a", 31)))
        assertTrue(ChangeGate.ruleLoosened(Rule("a", 30), Rule("a", null)))
        assertFalse(ChangeGate.ruleLoosened(Rule("a", 30), Rule("a", 29)))
        assertFalse(ChangeGate.ruleLoosened(Rule("a", null), Rule("a", 120)))
    }

    @Test fun shortening_a_window_is_loosening_but_extending_is_not() {
        val shorter = w.copy(endMin = 14 * 60)
        val longer = w.copy(endMin = 16 * 60)
        val fewerDays = w.copy(days = setOf(1, 2, 3, 4))
        assertTrue(ChangeGate.windowsLoosened(listOf(w), listOf(shorter)))
        assertTrue(ChangeGate.windowsLoosened(listOf(w), listOf(fewerDays)))
        assertTrue(ChangeGate.windowsLoosened(listOf(w), emptyList()))
        assertFalse(ChangeGate.windowsLoosened(listOf(w), listOf(longer)))
        // 同じ範囲を 2 つに分けただけならゆるめていない
        assertFalse(ChangeGate.windowsLoosened(listOf(w), listOf(w.copy(endMin = 12 * 60), w.copy(startMin = 12 * 60))))
    }

    @Test fun overnight_coverage_wraps_across_the_week_end() {
        val sun = Window(setOf(7), 22 * 60, 6 * 60)
        assertFalse(ChangeGate.windowsLoosened(listOf(sun), listOf(sun)))
        assertTrue(ChangeGate.windowsLoosened(listOf(sun), listOf(sun.copy(endMin = 5 * 60))))
    }

    @Test fun loosening_is_pending_while_the_tightening_part_goes_through() {
        val p = base.copy(rules = listOf(Rule("a", 45, listOf(w)), Rule("b", 30)))
        val r = ChangeGate.submit(base, p, now)
        assertEquals(listOf("rule:a"), r.pending.map { it.key })
        assertEquals(30, r.applied.rule("a")!!.dailyLimitMin) // まだ 30 のまま
        assertEquals(30, r.applied.rule("b")!!.dailyLimitMin) // きびしい方はすぐ
    }

    @Test fun pending_applies_only_after_the_delay() {
        val p = base.copy(rules = listOf(Rule("a", 45, listOf(w)), Rule("b", 60)))
        val r = ChangeGate.submit(base, p, now)
        val pc = ChangeGate.makePending("1", now, 10, r.pending, p)
        assertEquals(now + 600_000L, pc.applyAtMs)
        val (s1, rest1) = ChangeGate.applyMatured(r.applied, listOf(pc), now + 599_999L)
        assertEquals(30, s1.rule("a")!!.dailyLimitMin); assertEquals(1, rest1.size)
        val (s2, rest2) = ChangeGate.applyMatured(r.applied, listOf(pc), now + 600_000L)
        assertEquals(45, s2.rule("a")!!.dailyLimitMin); assertTrue(rest2.isEmpty())
    }

    @Test fun the_delay_cannot_be_below_one_minute() {
        val pc = ChangeGate.makePending("1", now, 0, listOf(Diff("cooldown", "c", true)), base)
        assertEquals(now + 60_000L, pc.applyAtMs)
    }

    @Test fun shortening_the_cooldown_is_itself_delayed_and_lengthening_is_instant() {
        val s = base.copy(cooldownMin = 10)
        assertEquals(listOf("cooldown"), ChangeGate.submit(s, s.copy(cooldownMin = 1), now).pending.map { it.key })
        val r = ChangeGate.submit(s, s.copy(cooldownMin = 60), now)
        assertTrue(r.pending.isEmpty()); assertEquals(60, r.applied.cooldownMin)
    }

    @Test fun commitment_rejects_every_loosening_and_expired_pending_is_dropped() {
        val c = base.copy(commitmentUntilMs = now + 86_400_000L)
        val p = c.copy(rules = listOf(Rule("a", 90, listOf(w)), Rule("b", 60)), protectSystemPages = false)
        val r = ChangeGate.submit(c, p, now)
        assertTrue(r.pending.isEmpty())
        assertEquals(setOf("rule:a", "protectSystemPages"), r.rejected.map { it.key }.toSet())
        assertEquals(c, r.applied)
        // 待ちに入っていたものが、コミットメント開始後に熟しても反映されない
        val pc = ChangeGate.makePending("1", now - 700_000L, 10, listOf(Diff("rule:a", "a", true)), p)
        val (s, rest) = ChangeGate.applyMatured(c, listOf(pc), now)
        assertEquals(c, s); assertTrue(rest.isEmpty())
    }

    @Test fun commitment_can_be_extended_but_never_shortened() {
        val c = base.copy(commitmentUntilMs = now + 86_400_000L)
        val longer = ChangeGate.submit(c, c.copy(commitmentUntilMs = now + 2 * 86_400_000L), now)
        assertEquals(now + 2 * 86_400_000L, longer.applied.commitmentUntilMs)
        val shorter = ChangeGate.submit(c, c.copy(commitmentUntilMs = 0), now)
        assertEquals(listOf("commitment"), shorter.rejected.map { it.key })
        assertEquals(c.commitmentUntilMs, shorter.applied.commitmentUntilMs)
        // 期限が切れたあとなら、0 に戻しても何も起きない
        val expired = base.copy(commitmentUntilMs = now - 1)
        assertTrue(ChangeGate.diff(expired, expired.copy(commitmentUntilMs = 0), now).none { it.loosening })
    }

    @Test fun protections_off_and_removing_focus_apps_and_emergency_limits() {
        val s = base.copy(protectSelf = true, emergencyMaxPerDay = 2)
        assertTrue(ChangeGate.diff(s, s.copy(protectSelf = false), now).single().loosening)
        assertFalse(ChangeGate.diff(base, base.copy(protectSelf = true), now).single().loosening)
        assertTrue(ChangeGate.diff(s, s.copy(focusApps = setOf("a")), now).single().loosening)
        assertFalse(ChangeGate.diff(s, s.copy(focusApps = setOf("a", "b", "c")), now).single().loosening)
        assertTrue(ChangeGate.diff(s, s.copy(emergencyMaxPerDay = 0), now).single().loosening)
        assertTrue(ChangeGate.diff(s, s.copy(emergencyMaxPerDay = 5), now).single().loosening)
        assertFalse(ChangeGate.diff(s, s.copy(emergencyMaxPerDay = 1), now).single().loosening)
        assertTrue(ChangeGate.diff(s, s.copy(zoneId = "America/New_York"), now).single().loosening)
    }

    @Test fun quiz_reward_increase_is_loosening() {
        val q = QuizConfig()
        assertTrue(ChangeGate.quizLoosened(q, q.copy(rewardMin = 20)))
        assertTrue(ChangeGate.quizLoosened(q, q.copy(count = 3)))
        assertTrue(ChangeGate.quizLoosened(q, q.copy(allowInWindows = true)))
        assertFalse(ChangeGate.quizLoosened(q, q.copy(rewardMin = 5, count = 8, maxBonusMinPerDay = 30)))
    }
}
