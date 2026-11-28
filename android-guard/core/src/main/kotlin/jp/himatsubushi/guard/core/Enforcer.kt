package jp.himatsubushi.guard.core

enum class Reason { DAILY_LIMIT, WINDOW, FOCUS, PROTECTED_SETTINGS }

data class BlockInfo(
    val reason: Reason,
    val unlockAtMs: Long?,
    val quizAllowed: Boolean,
    val label: String = "",
)

object Limits {
    /** 残りミリ秒。上限なしなら null。 */
    fun remainingMs(limitMin: Int?, usedMs: Long, bonusMs: Long): Long? =
        if (limitMin == null) null else (limitMin * 60_000L + bonusMs - usedMs)
}

/** 絶対にブロックしない（電話・緊急・ホーム・システム UI・このアプリ）。 */
object NeverBlock {
    val fixed = setOf(
        "com.android.systemui", "com.android.phone", "com.android.server.telecom",
        "com.android.dialer", "com.google.android.dialer", "com.android.emergency",
        "com.google.android.apps.safetyhub", "com.android.incallui", "com.android.cellbroadcastreceiver",
        "com.google.android.cellbroadcastreceiver", "android",
    )

    fun isNever(pkg: String, self: String, launchers: Set<String>) =
        pkg == self || pkg in fixed || pkg in launchers
}

object SettingsPackages {
    val settings = setOf("com.android.settings", "com.google.android.settings.intelligence")
    val installers = setOf(
        "com.google.android.packageinstaller", "com.android.packageinstaller",
        "com.google.android.permissioncontroller", "com.android.permissioncontroller",
    )
}

data class EvalInput(
    val pkg: String,
    val settings: Settings,
    val nowMs: Long,
    val usedTodayMs: Long,
    val bonusMs: Long,
    val emergencyUntilMs: Long,
    val focus: FocusSession?,
    val self: String,
    val launchers: Set<String>,
    /** クイズに合格して、ブロック時間帯をこの時刻まで一時的にゆるめている */
    val passUntilMs: Long = 0L,
)

object Enforcer {
    fun anyWindowActive(s: Settings, nowMs: Long): Boolean {
        val zone = Schedule.zoneOrDefault(s.zoneId)
        return s.rules.any { it.enabled && it.windows.isNotEmpty() && Schedule.activeWindow(it.windows, nowMs, zone) != null }
    }

    /** 保護（設定ページ・このアプリ）が効いているか：ブロック時間帯の最中か、コミットメント中。 */
    fun protectionActive(s: Settings, nowMs: Long) = s.commitmentActive(nowMs) || anyWindowActive(s, nowMs)

    fun evaluate(i: EvalInput): BlockInfo? {
        if (i.emergencyUntilMs > i.nowMs) return null
        if (NeverBlock.isNever(i.pkg, i.self, i.launchers)) return null
        val s = i.settings
        val zone = Schedule.zoneOrDefault(s.zoneId)
        val f = i.focus
        if (f != null && f.active(i.nowMs) && i.pkg in f.apps) {
            return BlockInfo(Reason.FOCUS, f.endMs, false)
        }
        val rule = s.rule(i.pkg)
        if (rule != null && rule.enabled) {
            val aw = Schedule.unlockAt(rule.windows, i.nowMs, zone)
            if (aw != null && i.passUntilMs <= i.nowMs) {
                return BlockInfo(Reason.WINDOW, aw.endMs, rule.quizInWindows ?: s.quiz.allowInWindows, aw.window.label)
            }
            val rem = Limits.remainingMs(rule.dailyLimitMin, i.usedTodayMs, i.bonusMs)
            if (rem != null && rem <= 0L) {
                return BlockInfo(Reason.DAILY_LIMIT, Schedule.nextDayStartMs(i.nowMs, zone), true)
            }
        }
        if (s.protectSettingsApp && i.pkg in SettingsPackages.settings && protectionActive(s, i.nowMs)) {
            val end = if (s.commitmentActive(i.nowMs)) s.commitmentUntilMs else
                s.rules.mapNotNull { r -> Schedule.unlockAt(r.windows, i.nowMs, zone)?.endMs }.maxOrNull()
            return BlockInfo(Reason.PROTECTED_SETTINGS, end, false)
        }
        return null
    }
}
