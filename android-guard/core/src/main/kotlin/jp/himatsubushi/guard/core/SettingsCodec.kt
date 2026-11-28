package jp.himatsubushi.guard.core

/** 設定の JSON 化と読み込み（書き出し・読み込みファイルと内部保存で共通）。PIN は含めない。 */
object SettingsCodec {
    const val FORMAT = "himatsubushi-guard-settings"
    const val VERSION = 1

    fun windowToMap(w: Window): Map<String, Any?> =
        mapOf("days" to w.days.sorted(), "start" to w.startMin, "end" to w.endMin, "label" to w.label)

    fun windowFromMap(m: Map<String, Any?>): Window? {
        val days = (m["days"] as? List<*>)?.mapNotNull { (it as? Long)?.toInt() ?: (it as? Double)?.toInt() }?.toSet() ?: return null
        val w = Window(days, m.int("start"), m.int("end", 0), m.str("label")).normalized()
        return if (w.days.isEmpty()) null else w
    }

    fun ruleToMap(r: Rule): Map<String, Any?> = linkedMapOf(
        "pkg" to r.pkg,
        "limitMin" to r.dailyLimitMin,
        "windows" to r.windows.map { windowToMap(it) },
        "enabled" to r.enabled,
        "quizInWindows" to r.quizInWindows,
    )

    fun ruleFromMap(m: Map<String, Any?>): Rule? {
        val pkg = m.str("pkg")
        if (pkg.isBlank() || pkg.length > 200) return null
        val limit = if (m["limitMin"] == null) null else m.int("limitMin").coerceIn(0, 1440)
        val ws = (m["windows"] as? List<*>)?.mapNotNull { it.asMap()?.let(::windowFromMap) } ?: emptyList()
        val q = m["quizInWindows"] as? Boolean
        return Rule(pkg, limit, ws.take(20), m.bool("enabled", true), q)
    }

    fun quizToMap(q: QuizConfig): Map<String, Any?> = linkedMapOf(
        "count" to q.count, "rewardMin" to q.rewardMin, "maxBonusMinPerDay" to q.maxBonusMinPerDay,
        "penaltyMin" to q.penaltyMin, "cooldownPerWrongSec" to q.cooldownPerWrongSec,
        "categories" to q.categories.sorted(), "minLevel" to q.minLevel, "maxLevel" to q.maxLevel,
        "allowInWindows" to q.allowInWindows,
    )

    fun quizFromMap(m: Map<String, Any?>): QuizConfig {
        val d = QuizConfig()
        val cats = m.strList("categories").filter { it in ALL_CATEGORIES }.toSet()
        return QuizConfig(
            m.int("count", d.count), m.int("rewardMin", d.rewardMin), m.int("maxBonusMinPerDay", d.maxBonusMinPerDay),
            m.int("penaltyMin", d.penaltyMin), m.int("cooldownPerWrongSec", d.cooldownPerWrongSec),
            if (cats.isEmpty()) d.categories else cats, m.int("minLevel", d.minLevel), m.int("maxLevel", d.maxLevel),
            m.bool("allowInWindows", d.allowInWindows),
        ).normalized()
    }

    fun toMap(s: Settings): Map<String, Any?> = linkedMapOf(
        "zoneId" to s.zoneId,
        "rules" to s.rules.map { ruleToMap(it) },
        "focusApps" to s.focusApps.sorted(),
        "quiz" to quizToMap(s.quiz),
        "emergencyMaxPerDay" to s.emergencyMaxPerDay,
        "protectSettingsApp" to s.protectSettingsApp,
        "protectSelf" to s.protectSelf,
        "protectSystemPages" to s.protectSystemPages,
        "cooldownMin" to s.cooldownMin,
        "commitmentUntilMs" to s.commitmentUntilMs,
    )

    fun fromMap(m: Map<String, Any?>): Settings {
        val d = Settings()
        val zone = m.str("zoneId", d.zoneId).let { z -> if (Schedule.zoneOrDefault(z, java.time.ZoneId.of("UTC")).id == "UTC" && z != "UTC") d.zoneId else z }
        val rules = (m["rules"] as? List<*>)?.mapNotNull { it.asMap()?.let(::ruleFromMap) } ?: emptyList()
        // 同じアプリは 1 つだけ
        val uniq = LinkedHashMap<String, Rule>()
        for (r in rules) uniq[r.pkg] = r
        return Settings(
            zoneId = zone,
            rules = uniq.values.toList().take(300),
            focusApps = m.strList("focusApps").take(300).toSet(),
            quiz = m["quiz"].asMap()?.let(::quizFromMap) ?: d.quiz,
            emergencyMaxPerDay = m.int("emergencyMaxPerDay", d.emergencyMaxPerDay).coerceIn(0, 50),
            protectSettingsApp = m.bool("protectSettingsApp", d.protectSettingsApp),
            protectSelf = m.bool("protectSelf", d.protectSelf),
            protectSystemPages = m.bool("protectSystemPages", d.protectSystemPages),
            cooldownMin = m.int("cooldownMin", d.cooldownMin).coerceIn(1, 1440),
            commitmentUntilMs = m.long("commitmentUntilMs", 0L).coerceAtLeast(0L),
        )
    }

    fun toJson(s: Settings): String = Json.write(toMap(s), pretty = true)

    fun fromJson(text: String): Settings? = Json.parseOrNull(text).asMap()?.let(::fromMap)

    /** 書き出しファイル（形式の印つき）。 */
    fun export(s: Settings, exportedAtMs: Long): String = Json.write(
        linkedMapOf("format" to FORMAT, "version" to VERSION, "exportedAt" to exportedAtMs, "settings" to toMap(s)),
        pretty = true,
    )

    sealed class ImportResult {
        data class Ok(val settings: Settings) : ImportResult()
        data class Bad(val message: String) : ImportResult()
    }

    fun import(text: String): ImportResult {
        val root = try { Json.parse(text).asMap() } catch (e: JsonException) { return ImportResult.Bad("JSON として読めません：${e.message}") }
        if (root == null) return ImportResult.Bad("設定ファイルではありません")
        if (root.str("format") != FORMAT) return ImportResult.Bad("ひまつぶしガードの設定ファイルではありません")
        if (root.int("version", 0) > VERSION) return ImportResult.Bad("新しいバージョンのファイルです。アプリを更新してください")
        val sm = root["settings"].asMap() ?: return ImportResult.Bad("settings がありません")
        return ImportResult.Ok(fromMap(sm))
    }
}
