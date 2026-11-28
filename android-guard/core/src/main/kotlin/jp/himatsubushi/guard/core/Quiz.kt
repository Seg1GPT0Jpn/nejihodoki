package jp.himatsubushi.guard.core

import java.text.Normalizer
import kotlin.random.Random

/** level: 1〜9（小1〜小6=1〜6、中1〜中3=7〜9。算数などはやさしい順）。0 = レベルなし（持ち主の問題）。 */
data class Question(
    val id: String,
    val category: String,
    val level: Int,
    val tags: List<String>,
    val text: String,
    val answer: String,
    val distractors: List<String>,
)

/** 出す形。choices が null なら文字を打って答える。 */
data class Presented(val question: Question, val choices: List<String>?, val correctIndex: Int)

object QuizSelector {
    /**
     * 設定のカテゴリ・レベルで絞り、最近出したものを後回しにして、カテゴリをなるべくまぜて count 問えらぶ。
     * 足りなければ（custom は level 0 なので、レベルの絞りの対象外）取れるだけ返す。
     */
    fun select(pool: List<Question>, cfg: QuizConfig, count: Int, rng: Random, recentIds: Set<String>): List<Question> {
        val ok = pool.filter {
            it.category in cfg.categories &&
                (it.category == CAT_CUSTOM || it.level == 0 || it.level in cfg.minLevel..cfg.maxLevel)
        }
        if (ok.isEmpty()) return emptyList()
        val fresh = ok.filter { it.id !in recentIds }
        val base = if (fresh.size >= count) fresh else fresh + ok.filter { it.id in recentIds }.shuffled(rng)
        val byCat = base.groupBy { it.category }.mapValues { it.value.shuffled(rng).toMutableList() }
        val cats = byCat.keys.toMutableList().also { it.shuffle(rng) }
        val out = ArrayList<Question>()
        var guard = 0
        while (out.size < count && guard++ < 10_000) {
            var any = false
            for (c in cats) {
                val l = byCat[c] ?: continue
                if (l.isNotEmpty() && out.size < count) { out.add(l.removeAt(0)); any = true }
            }
            if (!any) break
        }
        return out.shuffled(rng)
    }

    fun present(q: Question, rng: Random): Presented {
        val d = q.distractors.map { it.trim() }.filter { it.isNotEmpty() && !AnswerCheck.same(it, q.answer) }.distinct().shuffled(rng).take(3)
        if (d.isEmpty()) return Presented(q, null, -1)
        val all = (d + q.answer).shuffled(rng)
        return Presented(q, all, all.indexOf(q.answer))
    }
}

object AnswerCheck {
    fun norm(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFKC).trim().lowercase()
        .replace(Regex("\\s+"), " ")

    fun same(a: String, b: String) = norm(a) == norm(b)
    fun isCorrect(q: Question, given: String) = same(given, q.answer)
}

data class RewardResult(val earnedMin: Int, val cooldownSec: Int, val passed: Boolean)

object Reward {
    /**
     * 半分以上正解で合格。ごほうび = rewardMin × 正解/問題数 − まちがい×penaltyMin（0 未満にはならない）。
     * まちがいが 1 問あるごとに、つぎの挑戦まで cooldownPerWrongSec 秒待つ。
     */
    fun compute(cfg: QuizConfig, total: Int, correct: Int): RewardResult {
        if (total <= 0) return RewardResult(0, 0, false)
        val c = correct.coerceIn(0, total)
        val wrong = total - c
        val passed = c * 2 >= total
        val earned = if (passed) (cfg.rewardMin * c / total - wrong * cfg.penaltyMin).coerceAtLeast(0) else 0
        return RewardResult(earned, wrong * cfg.cooldownPerWrongSec, passed)
    }

    /** 1 日にもらえる上限（maxBonusMinPerDay）を超えない分だけ。 */
    fun capByDay(cfg: QuizConfig, alreadyBonusMin: Int, earnedMin: Int): Int =
        earnedMin.coerceAtMost((cfg.maxBonusMinPerDay - alreadyBonusMin).coerceAtLeast(0)).coerceAtLeast(0)
}
