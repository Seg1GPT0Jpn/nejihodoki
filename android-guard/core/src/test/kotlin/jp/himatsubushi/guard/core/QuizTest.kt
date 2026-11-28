package jp.himatsubushi.guard.core

import java.io.File
import kotlin.random.Random
import org.junit.Assert.*
import org.junit.Test

class QuizTest {
    private fun q(id: String, cat: String, level: Int, a: String = "x", d: List<String> = listOf("p", "q", "r")) =
        Question(id, cat, level, emptyList(), "問$id", a, d)

    @Test fun selection_filters_by_category_and_level_and_mixes_categories() {
        val pool = (1..20).map { q("m$it", CAT_MATH, it % 9 + 1) } + (1..20).map { q("k$it", CAT_KANJI, it % 9 + 1) } + listOf(q("c1", CAT_CUSTOM, 0))
        val cfg = QuizConfig(categories = setOf(CAT_MATH, CAT_KANJI), minLevel = 2, maxLevel = 4)
        val got = QuizSelector.select(pool, cfg, 6, Random(1), emptySet())
        assertEquals(6, got.size)
        assertTrue(got.all { it.level in 2..4 && it.category != CAT_CUSTOM })
        assertEquals(3, got.count { it.category == CAT_MATH })
        assertEquals(6, got.map { it.id }.toSet().size)
    }

    @Test fun custom_questions_ignore_level_range() {
        val cfg = QuizConfig(categories = setOf(CAT_CUSTOM), minLevel = 5, maxLevel = 5)
        assertEquals(1, QuizSelector.select(listOf(q("c", CAT_CUSTOM, 0)), cfg, 3, Random(1), emptySet()).size)
    }

    @Test fun recent_questions_are_avoided_when_enough_fresh_ones_exist() {
        val pool = (1..10).map { q("m$it", CAT_MATH, 1) }
        val recent = (1..5).map { "m$it" }.toSet()
        repeat(20) { s ->
            val got = QuizSelector.select(pool, QuizConfig(), 5, Random(s), recent)
            assertTrue(got.none { it.id in recent })
        }
        // 足りないときは最近のものも使う
        assertEquals(5, QuizSelector.select(pool.take(6), QuizConfig(), 5, Random(1), (1..6).map { "m$it" }.toSet()).size)
    }

    @Test fun empty_when_nothing_matches() {
        assertTrue(QuizSelector.select(listOf(q("a", CAT_MATH, 9)), QuizConfig(minLevel = 1, maxLevel = 3), 5, Random(1), emptySet()).isEmpty())
    }

    @Test fun presented_choices_contain_the_answer_once_and_index_matches() {
        repeat(30) { s ->
            val p = QuizSelector.present(q("a", CAT_MATH, 1, "42", listOf("41", "42", "43", "44", "45")), Random(s))
            val c = p.choices!!
            assertEquals(4, c.size)
            assertEquals("42", c[p.correctIndex])
            assertEquals(1, c.count { it == "42" })
        }
    }

    @Test fun no_distractors_means_typed_answer_with_normalization() {
        val question = q("t", CAT_CUSTOM, 0, "Tokyo", emptyList())
        val p = QuizSelector.present(question, Random(1))
        assertNull(p.choices)
        assertTrue(AnswerCheck.isCorrect(question, "  tokyo "))
        assertTrue(AnswerCheck.isCorrect(q("n", CAT_MATH, 1, "12"), "１２"))
        assertFalse(AnswerCheck.isCorrect(question, "kyoto"))
    }

    @Test fun reward_all_correct_pays_full_and_wrong_answers_cost_time() {
        val cfg = QuizConfig(count = 5, rewardMin = 10, penaltyMin = 2, cooldownPerWrongSec = 20)
        assertEquals(RewardResult(10, 0, true), Reward.compute(cfg, 5, 5))
        val r4 = Reward.compute(cfg, 5, 4)
        assertEquals(8 - 2, r4.earnedMin); assertEquals(20, r4.cooldownSec); assertTrue(r4.passed)
        val r3 = Reward.compute(cfg, 5, 3)
        assertEquals(6 - 4, r3.earnedMin); assertEquals(40, r3.cooldownSec)
        val r2 = Reward.compute(cfg, 5, 2)
        assertFalse(r2.passed); assertEquals(0, r2.earnedMin); assertEquals(60, r2.cooldownSec)
        assertEquals(0, Reward.compute(cfg, 0, 0).earnedMin)
    }

    @Test fun reward_never_negative_and_daily_cap_applies() {
        val cfg = QuizConfig(rewardMin = 5, penaltyMin = 30, maxBonusMinPerDay = 20)
        assertEquals(0, Reward.compute(cfg, 4, 2).earnedMin)
        assertEquals(10, Reward.capByDay(cfg, 10, 30))
        assertEquals(0, Reward.capByDay(cfg, 25, 10))
        assertEquals(7, Reward.capByDay(cfg, 0, 7))
    }

    @Test fun bundled_bank_has_at_least_600_valid_questions() {
        val dir = File(System.getProperty("questions.dir") ?: "../app/src/main/assets/questions")
        assertTrue("問題フォルダが見つかりません: $dir", dir.isDirectory)
        val all = ArrayList<Question>()
        for (f in dir.listFiles { x -> x.name.endsWith(".json") }!!.sortedBy { it.name }) {
            val rep = QuestionImport.parse(f.readText(), CAT_CUSTOM, "t")
            assertEquals("${f.name} に読めない問題", 0, rep.skipped)
            assertTrue(rep.errors.toString(), rep.errors.isEmpty())
            all += rep.questions
        }
        assertTrue("問題が少なすぎます: ${all.size}", all.size >= 600)
        assertEquals("ID が重複しています", all.size, all.map { it.id }.toSet().size)
        val cats = all.map { it.category }.toSet()
        assertTrue(cats.containsAll(listOf(CAT_MATH, CAT_KANJI, CAT_ENGLISH, CAT_SOCIAL, CAT_SCIENCE)))
        for (x in all) {
            assertTrue(x.id, x.level in 1..9)
            assertTrue(x.id, x.distractors.size >= 3)
            assertFalse(x.id, x.distractors.any { AnswerCheck.same(it, x.answer) })
            assertEquals(x.id, x.distractors.size, x.distractors.map { AnswerCheck.norm(it) }.toSet().size)
            assertTrue(x.id, x.tags.isNotEmpty())
        }
        // 学年 1〜9 がすべて入っていること（漢字）
        assertEquals((1..9).toSet(), all.filter { it.category == CAT_KANJI }.map { it.level }.toSet())
    }
}
