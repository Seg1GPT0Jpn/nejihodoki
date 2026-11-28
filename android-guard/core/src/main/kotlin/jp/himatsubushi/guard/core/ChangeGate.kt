package jp.himatsubushi.guard.core

/** 設定の差分 1 件。loosening = 制限をゆるめる変更。 */
data class Diff(val key: String, val label: String, val loosening: Boolean)

data class PendingChange(
    val id: String,
    val createdMs: Long,
    val applyAtMs: Long,
    val keys: List<String>,
    val labels: List<String>,
    val proposed: Settings,
)

/**
 * 「きびしくする変更はすぐ、ゆるめる変更は待ち時間のあと」を決める。
 * コミットメント中は、ゆるめる変更は待っても通らない（受けつけない）。
 */
object ChangeGate {
    const val MIN_COOLDOWN_MIN = 1

    /** 週 7*1440 分のどの分がブロックされているか。 */
    fun coverage(windows: List<Window>): BooleanArray {
        val a = BooleanArray(7 * 1440)
        for (w0 in windows) {
            val w = w0.normalized()
            val len = if (w.endMin > w.startMin) w.endMin - w.startMin else 1440 - w.startMin + w.endMin
            for (d in w.days) {
                val base = (d - 1) * 1440 + w.startMin
                for (k in 0 until len) a[(base + k) % (7 * 1440)] = true
            }
        }
        return a
    }

    fun windowsLoosened(old: List<Window>, new: List<Window>): Boolean {
        val o = coverage(old)
        val n = coverage(new)
        for (i in o.indices) if (o[i] && !n[i]) return true
        return false
    }

    fun ruleLoosened(o: Rule, n: Rule): Boolean {
        if (o.enabled && !n.enabled) return true
        val ol = o.dailyLimitMin
        val nl = n.dailyLimitMin
        if (ol != null && (nl == null || nl > ol)) return true
        if (windowsLoosened(o.windows, n.windows)) return true
        if (n.quizInWindows == true && o.quizInWindows != true) return true
        return false
    }

    fun quizLoosened(o: QuizConfig, n: QuizConfig): Boolean =
        n.rewardMin > o.rewardMin || n.maxBonusMinPerDay > o.maxBonusMinPerDay ||
            n.penaltyMin < o.penaltyMin || n.cooldownPerWrongSec < o.cooldownPerWrongSec ||
            n.count < o.count || (n.allowInWindows && !o.allowInWindows)

    fun diff(old: Settings, new: Settings, nowMs: Long): List<Diff> {
        val out = ArrayList<Diff>()
        val oldMap = old.rules.associateBy { it.pkg }
        val newMap = new.rules.associateBy { it.pkg }
        for ((pkg, o) in oldMap) {
            val n = newMap[pkg]
            if (n == null) out.add(Diff("rule:$pkg", pkg, true))
            else if (n != o) out.add(Diff("rule:$pkg", pkg, ruleLoosened(o, n)))
        }
        for (pkg in newMap.keys) if (pkg !in oldMap) out.add(Diff("rule:$pkg", pkg, false))
        if (old.focusApps != new.focusApps) out.add(Diff("focusApps", "focusApps", (old.focusApps - new.focusApps).isNotEmpty()))
        if (old.quiz != new.quiz) out.add(Diff("quiz", "quiz", quizLoosened(old.quiz, new.quiz)))
        if (old.emergencyMaxPerDay != new.emergencyMaxPerDay) {
            val o = old.emergencyMaxPerDay
            val n = new.emergencyMaxPerDay
            val loose = (n == 0 && o != 0) || (o != 0 && n > o)
            out.add(Diff("emergency", "emergency", loose))
        }
        if (old.protectSettingsApp != new.protectSettingsApp) out.add(Diff("protectSettingsApp", "protectSettingsApp", old.protectSettingsApp))
        if (old.protectSelf != new.protectSelf) out.add(Diff("protectSelf", "protectSelf", old.protectSelf))
        if (old.protectSystemPages != new.protectSystemPages) out.add(Diff("protectSystemPages", "protectSystemPages", old.protectSystemPages))
        if (old.cooldownMin != new.cooldownMin) out.add(Diff("cooldown", "cooldown", new.cooldownMin < old.cooldownMin))
        if (old.zoneId != new.zoneId) out.add(Diff("zone", "zone", true))
        if (old.commitmentUntilMs != new.commitmentUntilMs) {
            // 期限をのばすのは「きびしく」、縮める・消すのは「ゆるめる」。切れたあとに 0 に戻すだけなら何もしない。
            val loose = new.commitmentUntilMs < old.commitmentUntilMs && old.commitmentUntilMs > nowMs
            if (loose || new.commitmentUntilMs > old.commitmentUntilMs || old.commitmentUntilMs > nowMs) {
                out.add(Diff("commitment", "commitment", loose))
            }
        }
        return out
    }

    /** base に、from の key の部分だけ写す。 */
    fun take(base: Settings, from: Settings, key: String): Settings = when {
        key.startsWith("rule:") -> {
            val pkg = key.removePrefix("rule:")
            val r = from.rule(pkg)
            val idx = base.rules.indexOfFirst { it.pkg == pkg }
            when {
                r == null -> base.copy(rules = base.rules.filter { it.pkg != pkg })
                idx < 0 -> base.copy(rules = base.rules + r)
                else -> base.copy(rules = base.rules.toMutableList().also { it[idx] = r })
            }
        }
        key == "focusApps" -> base.copy(focusApps = from.focusApps)
        key == "quiz" -> base.copy(quiz = from.quiz)
        key == "emergency" -> base.copy(emergencyMaxPerDay = from.emergencyMaxPerDay)
        key == "protectSettingsApp" -> base.copy(protectSettingsApp = from.protectSettingsApp)
        key == "protectSelf" -> base.copy(protectSelf = from.protectSelf)
        key == "protectSystemPages" -> base.copy(protectSystemPages = from.protectSystemPages)
        key == "cooldown" -> base.copy(cooldownMin = from.cooldownMin.coerceAtLeast(MIN_COOLDOWN_MIN))
        key == "zone" -> base.copy(zoneId = from.zoneId)
        key == "commitment" -> base.copy(commitmentUntilMs = from.commitmentUntilMs)
        else -> base
    }

    data class Result(
        val applied: Settings,
        val pending: List<Diff>,
        val rejected: List<Diff>,
        val appliedNow: List<Diff>,
    )

    /** 提案をふるいにかける。きびしい変更は applied に入り、ゆるめる変更は pending（待ち）か rejected（コミットメント中）。 */
    fun submit(old: Settings, proposed: Settings, nowMs: Long): Result {
        val commitment = old.commitmentActive(nowMs)
        var cur = old
        val pending = ArrayList<Diff>()
        val rejected = ArrayList<Diff>()
        val now = ArrayList<Diff>()
        for (d in diff(old, proposed, nowMs)) {
            if (!d.loosening) { cur = take(cur, proposed, d.key); now.add(d) }
            else if (commitment) rejected.add(d)
            else pending.add(d)
        }
        return Result(cur, pending, rejected, now)
    }

    fun makePending(id: String, nowMs: Long, cooldownMin: Int, diffs: List<Diff>, proposed: Settings) = PendingChange(
        id, nowMs, nowMs + cooldownMin.coerceAtLeast(MIN_COOLDOWN_MIN) * 60_000L,
        diffs.map { it.key }, diffs.map { it.label }, proposed,
    )

    /** 待ち時間が過ぎたものを反映する。コミットメント中になっていたら、ゆるめる分は捨てる。 */
    fun applyMatured(current: Settings, pendings: List<PendingChange>, nowMs: Long): Pair<Settings, List<PendingChange>> {
        var cur = current
        val rest = ArrayList<PendingChange>()
        for (p in pendings) {
            if (p.applyAtMs > nowMs) { rest.add(p); continue }
            if (cur.commitmentActive(nowMs)) continue
            for (k in p.keys) cur = take(cur, p.proposed, k)
        }
        return cur to rest
    }
}
