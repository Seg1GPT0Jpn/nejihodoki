package jp.himatsubushi.guard.core

data class ImportReport(val questions: List<Question>, val skipped: Int, val errors: List<String>)

/**
 * 問題ファイルの読み込み（同梱バンク・持ち主の CSV / JSON）。
 * JSON：配列、または {"questions":[...]}。キー q|question|問題、a|answer|答え、d|distractors|wrong|まちがい（配列）、
 *       choices（答えをふくんでもよい）、level|レベル、category|カテゴリ、tags（配列）、id。
 * CSV/TSV：1 行目が見出し（question,answer,distractors… / 問題,答え…）なら列名で、なければ
 *       「問題, 答え, まちがい1, まちがい2, まちがい3」の順。まちがいが 0 個なら、文字を打って答える問題になる。
 */
object QuestionImport {
    const val MAX_QUESTIONS = 5000
    const val MAX_FIELD = 400

    fun parse(text: String, defaultCategory: String = CAT_CUSTOM, idPrefix: String = "u"): ImportReport {
        val t = text.removePrefix("﻿").trim()
        if (t.isEmpty()) return ImportReport(emptyList(), 0, listOf("ファイルが空です"))
        return if (t.startsWith("[") || t.startsWith("{")) parseJson(t, defaultCategory, idPrefix) else parseCsv(t, defaultCategory, idPrefix)
    }

    private fun firstKey(m: Map<String, Any?>, vararg keys: String): Any? {
        for (k in keys) if (m.containsKey(k)) return m[k]
        return null
    }

    private fun toInt(v: Any?, d: Int): Int = when (v) {
        is Long -> v.toInt(); is Double -> v.toInt(); is String -> v.trim().toIntOrNull() ?: d; else -> d
    }

    private fun strs(v: Any?): List<String> = when (v) {
        is List<*> -> v.mapNotNull { x -> (x as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: (x as? Long)?.toString() }
        is String -> v.split('|', '、', ';').map { it.trim() }.filter { it.isNotEmpty() }
        else -> emptyList()
    }

    private fun build(
        n: Int, idIn: String?, cat: String, level: Int, tags: List<String>, q: String, a: String, d: List<String>, prefix: String,
    ): Question? {
        val qq = q.trim().take(MAX_FIELD)
        val aa = a.trim().take(MAX_FIELD)
        if (qq.isEmpty() || aa.isEmpty()) return null
        val c = if (cat in ALL_CATEGORIES) cat else CAT_CUSTOM
        val id = idIn?.takeIf { it.isNotBlank() }?.take(60) ?: "$prefix-${n + 1}"
        return Question(id, c, level.coerceIn(0, 9), tags.take(8).map { it.take(30) }, qq, aa, d.map { it.take(MAX_FIELD) }.take(8))
    }

    fun parseJson(text: String, defaultCategory: String, prefix: String): ImportReport {
        val root = try { Json.parse(text) } catch (e: JsonException) {
            return ImportReport(emptyList(), 0, listOf("JSON として読めません：${e.message}"))
        }
        var cat = defaultCategory
        val list: List<Any?> = when (root) {
            is List<*> -> root
            is Map<*, *> -> {
                val m = root.asMap()!!
                (m["category"] as? String)?.let { cat = it }
                (m["questions"] as? List<*>) ?: return ImportReport(emptyList(), 0, listOf("questions の配列がありません"))
            }
            else -> return ImportReport(emptyList(), 0, listOf("配列ではありません"))
        }
        val out = ArrayList<Question>()
        var skipped = 0
        val errors = ArrayList<String>()
        for ((i, e) in list.withIndex()) {
            if (out.size >= MAX_QUESTIONS) { errors.add("多すぎるため $MAX_QUESTIONS 問で打ち切りました"); break }
            val m = e.asMap()
            if (m == null) { skipped++; continue }
            val q = firstKey(m, "q", "question", "問題") as? String ?: ""
            val a = (firstKey(m, "a", "answer", "答え") as? String) ?: (firstKey(m, "a", "answer", "答え") as? Long)?.toString() ?: ""
            var d = strs(firstKey(m, "d", "distractors", "wrong", "まちがい"))
            val ch = strs(m["choices"])
            if (d.isEmpty() && ch.isNotEmpty()) d = ch.filter { !AnswerCheck.same(it, a) }
            val c = (firstKey(m, "category", "カテゴリ") as? String) ?: cat
            val lv = toInt(firstKey(m, "level", "レベル"), if (c == CAT_CUSTOM) 0 else 1)
            val tags = strs(m["tags"])
            val qu = build(i, m["id"] as? String, c, lv, tags, q, a, d, prefix)
            if (qu == null) { skipped++; if (errors.size < 5) errors.add("${i + 1} 件目：問題か答えがありません") } else out.add(qu)
        }
        return ImportReport(dedupe(out), skipped, errors)
    }

    private fun dedupe(l: List<Question>): List<Question> {
        val seen = HashSet<String>()
        return l.filter { seen.add(it.id) }
    }

    /** RFC4180 ふうの CSV（"" のエスケープ、セル内の改行、CRLF、BOM）。区切りは , タブ ; を自動判定。 */
    fun csvRows(text: String): List<List<String>> {
        val firstLine = text.lineSequence().firstOrNull().orEmpty()
        val delim = listOf(',', '\t', ';').maxByOrNull { d -> firstLine.count { it == d } }!!.takeIf { d -> firstLine.contains(d) } ?: ','
        val rows = ArrayList<List<String>>()
        var row = ArrayList<String>()
        val sb = StringBuilder()
        var inQ = false
        var i = 0
        fun endField() { row.add(sb.toString()); sb.setLength(0) }
        fun endRow() { endField(); if (row.any { it.isNotBlank() }) rows.add(row); row = ArrayList() }
        while (i < text.length) {
            val c = text[i]
            if (inQ) {
                if (c == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') { sb.append('"'); i++ } else inQ = false
                } else sb.append(c)
            } else when {
                c == '"' && sb.isEmpty() -> inQ = true
                c == delim -> endField()
                c == '\r' -> { if (i + 1 < text.length && text[i + 1] == '\n') i++; endRow() }
                c == '\n' -> endRow()
                else -> sb.append(c)
            }
            i++
        }
        if (sb.isNotEmpty() || row.isNotEmpty()) endRow()
        return rows
    }

    fun parseCsv(text: String, defaultCategory: String, prefix: String): ImportReport {
        val rows = csvRows(text)
        if (rows.isEmpty()) return ImportReport(emptyList(), 0, listOf("行がありません"))
        val head = rows[0].map { it.trim().lowercase() }
        val qNames = setOf("q", "question", "問題")
        val hasHeader = head.any { it in qNames }
        fun idx(vararg n: String) = head.indexOfFirst { it in n }
        val iq = if (hasHeader) idx("q", "question", "問題") else 0
        val ia = if (hasHeader) idx("a", "answer", "答え") else 1
        val ic = if (hasHeader) idx("category", "カテゴリ") else -1
        val il = if (hasHeader) idx("level", "レベル") else -1
        val it_ = if (hasHeader) idx("tags", "タグ") else -1
        val dIdx = if (hasHeader) head.indices.filter { i ->
            val h = head[i]
            Regex("d\\d*").matches(h) || h.startsWith("distractor") || h.startsWith("wrong") || h.startsWith("まちがい") || h.startsWith("choice")
        } else (2 until (rows.maxOfOrNull { it.size } ?: 2)).toList()
        if (iq < 0 || ia < 0) return ImportReport(emptyList(), 0, listOf("見出しに question と answer（問題 と 答え）が必要です"))
        val out = ArrayList<Question>()
        var skipped = 0
        val errors = ArrayList<String>()
        val body = if (hasHeader) rows.drop(1) else rows
        for ((n, r) in body.withIndex()) {
            if (out.size >= MAX_QUESTIONS) { errors.add("多すぎるため $MAX_QUESTIONS 問で打ち切りました"); break }
            fun cell(i: Int) = if (i in r.indices) r[i].trim() else ""
            val a = cell(ia)
            val d = dIdx.map { cell(it) }.filter { it.isNotEmpty() && !AnswerCheck.same(it, a) }
            val cat = if (ic >= 0) cell(ic).ifEmpty { defaultCategory } else defaultCategory
            val lv = if (il >= 0) cell(il).toIntOrNull() ?: 0 else 0
            val tags = if (it_ >= 0) cell(it_).split('|', ';', '、').map { s -> s.trim() }.filter { s -> s.isNotEmpty() } else emptyList()
            val q = build(n, null, cat, lv, tags, cell(iq), a, d, prefix)
            if (q == null) { skipped++; if (errors.size < 5) errors.add("${n + 1} 行目：問題か答えがありません") } else out.add(q)
        }
        return ImportReport(dedupe(out), skipped, errors)
    }
}
