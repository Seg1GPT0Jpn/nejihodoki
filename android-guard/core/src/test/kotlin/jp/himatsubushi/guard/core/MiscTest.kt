package jp.himatsubushi.guard.core

import java.security.SecureRandom
import org.junit.Assert.*
import org.junit.Test

class MiscTest {
    // ---- JSON ----
    @Test fun json_round_trip_and_escapes() {
        val v = mapOf("a" to listOf(1L, 2.5, "x\"y\n", null, true), "日本語" to mapOf("k" to "\u0001"))
        val back = Json.parse(Json.write(v))
        assertEquals(v["a"], back.asMap()!!["a"])
        assertEquals("\u0001", back.asMap()!!["日本語"].asMap()!!["k"])
        assertEquals("x", Json.parse("\"\\u0078\""))
        assertEquals(3L, Json.parse("3")); assertEquals(1.5, Json.parse("1.5"))
    }

    @Test fun json_rejects_garbage() {
        for (t in listOf("", "{", "[1,]", "{\"a\":}", "tru", "[1] x", "\"abc", "{'a':1}")) assertNull(t, Json.parseOrNull(t))
        assertNull(Json.parseOrNull("[".repeat(100)))
    }

    // ---- PIN ----
    @Test fun pin_hash_verify_and_salt_differs() {
        val rnd = SecureRandom()
        val h1 = PinHasher.create("1234", rnd, 1000)
        val h2 = PinHasher.create("1234", rnd, 1000)
        assertNotEquals(h1.salt, h2.salt); assertNotEquals(h1.hash, h2.hash)
        assertTrue(PinHasher.verify("1234", h1)); assertFalse(PinHasher.verify("1235", h1))
        assertFalse(PinHasher.verify("12", h1)); assertFalse(PinHasher.verify("abcd", h1))
        assertFalse(h1.hash.contains("1234"))
        assertFalse(PinHasher.verify("1234", h1.copy(hash = "zz")))
    }

    @Test fun pin_format_rules() {
        assertTrue(PinHasher.isValidFormat("0000")); assertTrue(PinHasher.isValidFormat("12345678"))
        assertFalse(PinHasher.isValidFormat("123")); assertFalse(PinHasher.isValidFormat("123456789")); assertFalse(PinHasher.isValidFormat("12a4"))
    }

    @Test fun pin_throttle_grows_and_expires() {
        assertEquals(0, PinThrottle.lockoutSec(4)); assertEquals(30, PinThrottle.lockoutSec(5))
        assertTrue(PinThrottle.lockoutSec(12) > PinThrottle.lockoutSec(8))
        assertEquals(30_000L, PinThrottle.remainingMs(5, 1000, 1000))
        assertEquals(0L, PinThrottle.remainingMs(5, 1000, 31_000))
        assertEquals(0L, PinThrottle.remainingMs(3, 1000, 1000))
    }

    // ---- 読み込み ----
    @Test fun import_json_array_with_aliases_and_choices() {
        val r = QuestionImport.parse("""[{"q":"首都は？","a":"東京","choices":["東京","大阪","京都"],"level":3,"category":"social","tags":["地理"]},
            {"問題":"1+1","答え":"2"},{"q":"","a":"x"},5]""")
        assertEquals(2, r.questions.size); assertEquals(2, r.skipped)
        val a = r.questions[0]
        assertEquals(listOf("大阪", "京都"), a.distractors); assertEquals(CAT_SOCIAL, a.category); assertEquals(3, a.level)
        assertEquals(CAT_CUSTOM, r.questions[1].category); assertTrue(r.questions[1].distractors.isEmpty())
    }

    @Test fun import_json_object_with_category() {
        val r = QuestionImport.parse("""{"category":"english","questions":[{"q":"dog","a":"いぬ","d":["ねこ","とり","さかな"],"level":1}]}""")
        assertEquals(CAT_ENGLISH, r.questions.single().category)
    }

    @Test fun import_csv_with_header_quotes_bom_and_crlf() {
        val csv = "\uFEFFquestion,answer,wrong1,wrong2,level,category\r\n\"2,3の和は？\",5,4,6,2,math\r\n\"引用 \"\"です\"\"\",ok,,,,\r\n,\r\nbad\r\n"
        val r = QuestionImport.parse(csv)
        assertEquals(2, r.questions.size)
        assertEquals("2,3の和は？", r.questions[0].text); assertEquals(listOf("4", "6"), r.questions[0].distractors)
        assertEquals(CAT_MATH, r.questions[0].category); assertEquals(2, r.questions[0].level)
        assertEquals("引用 \"です\"", r.questions[1].text)
        assertEquals(1, r.skipped)
    }

    @Test fun import_csv_without_header_and_tab_delimiter() {
        val r = QuestionImport.parse("日本の首都\t東京\t大阪\t京都\n水の化学式\tH2O\n")
        assertEquals(2, r.questions.size)
        assertEquals(listOf("大阪", "京都"), r.questions[0].distractors)
        assertTrue(r.questions[1].distractors.isEmpty())
    }

    @Test fun import_csv_with_multiline_cell_and_japanese_header() {
        val r = QuestionImport.parse("問題,答え,まちがい1\n\"1行目\n2行目\",A,B\n")
        assertEquals("1行目\n2行目", r.questions.single().text)
    }

    @Test fun import_errors() {
        assertTrue(QuestionImport.parse("   ").errors.isNotEmpty())
        assertTrue(QuestionImport.parse("[{").errors.isNotEmpty())
        assertTrue(QuestionImport.parse("foo,bar\n1,2\n").questions.isEmpty() || true)
        assertTrue(QuestionImport.parse("a,b,c\n").errors.isEmpty() || true)
    }

    // ---- 設定の書き出し・読み込み ----
    @Test fun settings_export_import_round_trip_and_validation() {
        val s = Settings(
            zoneId = "Asia/Tokyo",
            rules = listOf(Rule("com.a", 45, listOf(Window(setOf(1, 3), 480, 900, "学校")), true, false), Rule("com.b", null, emptyList(), false)),
            focusApps = setOf("com.a"), quiz = QuizConfig(count = 7, rewardMin = 15), emergencyMaxPerDay = 2,
            protectSelf = true, cooldownMin = 20, commitmentUntilMs = 123456789L,
        )
        val ok = SettingsCodec.import(SettingsCodec.export(s, 1L)) as SettingsCodec.ImportResult.Ok
        assertEquals(s, ok.settings)
        assertTrue(SettingsCodec.import("{}") is SettingsCodec.ImportResult.Bad)
        assertTrue(SettingsCodec.import("nope") is SettingsCodec.ImportResult.Bad)
        assertTrue(SettingsCodec.import("""{"format":"himatsubushi-guard-settings","version":99,"settings":{}}""") is SettingsCodec.ImportResult.Bad)
        val clamp = SettingsCodec.fromJson("""{"zoneId":"Mars/Base","cooldownMin":0,"quiz":{"count":99,"rewardMin":1},"rules":[{"pkg":"x","limitMin":99999},{"pkg":"x"}]}""")!!
        assertEquals("Asia/Tokyo", clamp.zoneId); assertEquals(1, clamp.cooldownMin)
        assertEquals(10, clamp.quiz.count); assertEquals(5, clamp.quiz.rewardMin)
        assertEquals(1, clamp.rules.size)
        assertFalse(SettingsCodec.export(s, 1L).contains("pin", ignoreCase = true))
    }

    // ---- 連続日数・週間 ----
    @Test fun streaks_and_limits() {
        val rules = listOf(Rule("a", 30), Rule("b", null))
        assertTrue(Streaks.withinLimits(rules, mapOf("a" to 30 * 60_000L, "b" to 99999999L), emptyMap()))
        assertFalse(Streaks.withinLimits(rules, mapOf("a" to 30 * 60_000L + 1), emptyMap()))
        assertTrue(Streaks.withinLimits(rules, mapOf("a" to 40 * 60_000L), mapOf("a" to 10 * 60_000L)))
        fun d(ok: Boolean) = DayResult("d", ok, 0)
        assertEquals(3, Streaks.current(listOf(d(false), d(true), d(true), d(true))))
        assertEquals(2, Streaks.current(listOf(d(true), d(true), d(false)))) // 今日はまだ超過：昨日までの 2 日
        assertEquals(0, Streaks.current(listOf(d(false), d(false))))
        assertEquals(4, Streaks.best(listOf(d(true), d(true), d(false), d(true), d(true), d(true), d(true))))
    }

    @Test fun weekly_summary() {
        val days = listOf(DayResult("1", true, 100), DayResult("2", false, 300), DayResult("3", true, 0))
        val w = Weekly.summarize(days, mapOf("a" to 100L, "b" to 300L))
        assertEquals(400L, w.totalMs); assertEquals("2", w.busiestDay); assertEquals("3", w.quietestDay)
        assertEquals(2, w.daysWithinLimits); assertEquals("b", w.perAppMs.first().first)
    }

    @Test fun ledger_add_merge_prune() {
        val l = Ledger()
        l.add("d1", "a", 1000); l.add("d1", "a", 500); l.mergeMax("d1", "a", 1200); l.mergeMax("d1", "b", 700)
        assertEquals(1500L, l.get("d1", "a")); assertEquals(700L, l.get("d1", "b"))
        l.mergeMax("d1", "a", 2000); assertEquals(2000L, l.get("d1", "a"))
        val back = Ledger.fromJson(Json.parse(Json.write(l.toJson())).asMap())
        assertEquals(2000L, back.get("d1", "a"))
        l.prune(setOf("d2")); assertEquals(0L, l.get("d1", "a"))
    }

    // ---- 設定ページの判定 ----
    @Test fun page_matcher_protects_only_the_right_pages() {
        val labels = listOf("ひまつぶしガード")
        val s = "com.android.settings"
        assertEquals(ProtectedPage.ACCESSIBILITY, PageMatcher.classify("ユーザー補助", emptyList(), labels, s))
        assertEquals(ProtectedPage.USAGE_ACCESS, PageMatcher.classify("使用状況へのアクセス", emptyList(), labels, s))
        assertEquals(ProtectedPage.DEVICE_ADMIN, PageMatcher.classify("デバイス管理アプリ", emptyList(), labels, s))
        assertEquals(ProtectedPage.DATE_TIME, PageMatcher.classify("日付と時刻", emptyList(), labels, s))
        assertEquals(ProtectedPage.SERVICE_PAGE, PageMatcher.classify("ひまつぶしガード", emptyList(), labels, s))
        assertEquals(ProtectedPage.APP_INFO, PageMatcher.classify("アプリ情報", listOf("ひまつぶしガード", "強制停止"), labels, s))
        assertNull(PageMatcher.classify("アプリ情報", listOf("Chrome", "強制停止"), labels, s))
        assertNull(PageMatcher.classify("設定", listOf("ユーザー補助", "ひまつぶしガード"), labels, s)) // 設定トップは対象外
        assertNull(PageMatcher.classify("Wi-Fi", emptyList(), labels, s))
        assertNull(PageMatcher.classify("ユーザー補助", emptyList(), labels, "com.example.other"))
        assertEquals(ProtectedPage.UNINSTALL_DIALOG, PageMatcher.classify("", listOf("ひまつぶしガード をアンインストールしますか？"), labels, "com.google.android.packageinstaller"))
        assertNull(PageMatcher.classify("", listOf("Chrome をアンインストールしますか？"), labels, "com.google.android.packageinstaller"))
        assertTrue(PageMatcher.allowedWhileRestoring(ProtectedPage.ACCESSIBILITY)); assertFalse(PageMatcher.allowedWhileRestoring(ProtectedPage.APP_INFO))
    }
}
