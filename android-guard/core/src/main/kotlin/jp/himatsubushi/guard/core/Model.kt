package jp.himatsubushi.guard.core

/** 曜日は ISO（1=月 … 7=日）。時刻は 0〜1440 の「分」。開始 >= 終了 のときは日をまたぐ（同じなら 24 時間）。 */
data class Window(val days: Set<Int>, val startMin: Int, val endMin: Int, val label: String = "") {
    fun normalized() = copy(
        days = days.filter { it in 1..7 }.toSortedSet(),
        startMin = startMin.coerceIn(0, 1439),
        endMin = endMin.coerceIn(0, 1440),
        label = label.take(40),
    )

    /** どれくらい制限しているか（分/週）。ゆるめたかの判定に使う。 */
    fun weeklyMinutes(): Int {
        val len = if (endMin > startMin) endMin - startMin else 1440 - startMin + endMin
        return len * days.size
    }
}

data class Rule(
    val pkg: String,
    val dailyLimitMin: Int? = null,
    val windows: List<Window> = emptyList(),
    val enabled: Boolean = true,
    /** null なら全体の設定に従う */
    val quizInWindows: Boolean? = null,
)

data class QuizConfig(
    val count: Int = 5,
    val rewardMin: Int = 10,
    val maxBonusMinPerDay: Int = 60,
    val penaltyMin: Int = 2,
    val cooldownPerWrongSec: Int = 20,
    val categories: Set<String> = setOf("math", "kanji", "english", "social", "science", "custom"),
    val minLevel: Int = 1,
    val maxLevel: Int = 9,
    val allowInWindows: Boolean = false,
) {
    fun normalized() = copy(
        count = count.coerceIn(3, 10),
        rewardMin = rewardMin.coerceIn(5, 30),
        maxBonusMinPerDay = maxBonusMinPerDay.coerceIn(0, 240),
        penaltyMin = penaltyMin.coerceIn(0, 30),
        cooldownPerWrongSec = cooldownPerWrongSec.coerceIn(0, 300),
        minLevel = minLevel.coerceIn(1, 9),
        maxLevel = maxLevel.coerceIn(minLevel.coerceIn(1, 9), 9),
    )
}

data class Settings(
    val zoneId: String = "Asia/Tokyo",
    val rules: List<Rule> = emptyList(),
    val focusApps: Set<String> = emptySet(),
    val quiz: QuizConfig = QuizConfig(),
    /** 0 = 無制限 */
    val emergencyMaxPerDay: Int = 3,
    val protectSettingsApp: Boolean = false,
    val protectSelf: Boolean = false,
    /** アプリ情報・ユーザー補助・使用状況アクセス・デバイス管理者の設定ページ */
    val protectSystemPages: Boolean = true,
    val cooldownMin: Int = 10,
    /** この時刻（信頼できる時計のミリ秒）まで、ゆるめる変更を一切受けつけない。0 = なし */
    val commitmentUntilMs: Long = 0L,
) {
    fun rule(pkg: String): Rule? = rules.firstOrNull { it.pkg == pkg }
    fun commitmentActive(nowMs: Long) = commitmentUntilMs > nowMs
}

data class FocusSession(val startMs: Long, val endMs: Long, val apps: Set<String>) {
    fun active(nowMs: Long) = nowMs in startMs until endMs
}

data class EmergencyEntry(val atMs: Long, val pkg: String, val reason: String)

const val CAT_MATH = "math"
const val CAT_KANJI = "kanji"
const val CAT_ENGLISH = "english"
const val CAT_SOCIAL = "social"
const val CAT_SCIENCE = "science"
const val CAT_CUSTOM = "custom"
val ALL_CATEGORIES = listOf(CAT_MATH, CAT_KANJI, CAT_ENGLISH, CAT_SOCIAL, CAT_SCIENCE, CAT_CUSTOM)
