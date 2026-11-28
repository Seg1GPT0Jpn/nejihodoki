package jp.himatsubushi.guard.core

/**
 * 依存なしの小さな JSON 読み書き（Android の org.json は JVM のテストで使えないため）。
 * 値は Map<String, Any?> / List<Any?> / String / Long / Double / Boolean / null。
 */
class JsonException(message: String) : Exception(message)

object Json {
    fun parse(text: String): Any? {
        val p = Parser(text.removePrefix("﻿"))
        p.ws()
        val v = p.value(0)
        p.ws()
        if (p.i < p.s.length) throw JsonException("余分な文字があります（位置 ${p.i}）")
        return v
    }

    fun parseOrNull(text: String): Any? = try { parse(text) } catch (e: JsonException) { null }

    fun write(v: Any?, pretty: Boolean = false): String {
        val sb = StringBuilder()
        w(sb, v, if (pretty) 0 else -1)
        return sb.toString()
    }

    private fun w(sb: StringBuilder, v: Any?, ind: Int) {
        when (v) {
            null -> sb.append("null")
            is Boolean -> sb.append(v.toString())
            is Int -> sb.append(v)
            is Long -> sb.append(v)
            is Double -> if (v.isNaN() || v.isInfinite()) sb.append("null")
            else if (v == Math.floor(v) && Math.abs(v) < 9.0e15) sb.append(v.toLong()) else sb.append(v)
            is Float -> w(sb, v.toDouble(), ind)
            is String -> str(sb, v)
            is Map<*, *> -> {
                if (v.isEmpty()) { sb.append("{}"); return }
                sb.append('{')
                var first = true
                for ((k, x) in v) {
                    if (!first) sb.append(',')
                    first = false
                    nl(sb, ind + 1)
                    str(sb, k.toString()); sb.append(if (ind >= 0) ": " else ":")
                    w(sb, x, if (ind >= 0) ind + 1 else -1)
                }
                nl(sb, ind); sb.append('}')
            }
            is Iterable<*> -> {
                val l = v.toList()
                if (l.isEmpty()) { sb.append("[]"); return }
                sb.append('[')
                var first = true
                for (x in l) {
                    if (!first) sb.append(',')
                    first = false
                    nl(sb, ind + 1)
                    w(sb, x, if (ind >= 0) ind + 1 else -1)
                }
                nl(sb, ind); sb.append(']')
            }
            else -> str(sb, v.toString())
        }
    }

    private fun nl(sb: StringBuilder, ind: Int) {
        if (ind < 0) return
        sb.append('\n'); repeat(ind) { sb.append("  ") }
    }

    private fun str(sb: StringBuilder, s: String) {
        sb.append('"')
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c < ' ') sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
            }
        }
        sb.append('"')
    }

    private class Parser(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++ }
        fun value(depth: Int): Any? {
            if (depth > 64) throw JsonException("入れ子が深すぎます")
            if (i >= s.length) throw JsonException("途中で終わっています")
            return when (val c = s[i]) {
                '{' -> obj(depth)
                '[' -> arr(depth)
                '"' -> string()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", null)
                else -> if (c == '-' || c in '0'..'9') num() else throw JsonException("不正な文字 '$c'（位置 $i）")
            }
        }
        fun lit(w: String, v: Any?): Any? {
            if (!s.startsWith(w, i)) throw JsonException("不正な値（位置 $i）")
            i += w.length; return v
        }
        fun num(): Any {
            val st = i
            if (s[i] == '-') i++
            while (i < s.length && (s[i] in '0'..'9')) i++
            var isD = false
            if (i < s.length && s[i] == '.') { isD = true; i++; while (i < s.length && s[i] in '0'..'9') i++ }
            if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                isD = true; i++
                if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                while (i < s.length && s[i] in '0'..'9') i++
            }
            val t = s.substring(st, i)
            return try {
                if (isD) t.toDouble() else (t.toLongOrNull() ?: t.toDouble())
            } catch (e: NumberFormatException) { throw JsonException("不正な数値 $t") }
        }
        fun string(): String {
            i++
            val sb = StringBuilder()
            while (true) {
                if (i >= s.length) throw JsonException("文字列が閉じていません")
                val c = s[i++]
                when (c) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        if (i >= s.length) throw JsonException("不正なエスケープ")
                        when (val e = s[i++]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000c')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                if (i + 4 > s.length) throw JsonException("不正な \\u")
                                val h = s.substring(i, i + 4).toIntOrNull(16) ?: throw JsonException("不正な \\u")
                                sb.append(h.toChar()); i += 4
                            }
                            else -> throw JsonException("不正なエスケープ \\$e")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }
        fun arr(depth: Int): List<Any?> {
            i++
            val out = ArrayList<Any?>()
            ws()
            if (i < s.length && s[i] == ']') { i++; return out }
            while (true) {
                ws(); out.add(value(depth + 1)); ws()
                if (i >= s.length) throw JsonException("配列が閉じていません")
                if (s[i] == ',') { i++; continue }
                if (s[i] == ']') { i++; return out }
                throw JsonException("配列の区切りが不正（位置 $i）")
            }
        }
        fun obj(depth: Int): Map<String, Any?> {
            i++
            val out = LinkedHashMap<String, Any?>()
            ws()
            if (i < s.length && s[i] == '}') { i++; return out }
            while (true) {
                ws()
                if (i >= s.length || s[i] != '"') throw JsonException("キーが不正（位置 $i）")
                val k = string(); ws()
                if (i >= s.length || s[i] != ':') throw JsonException("':' がありません（位置 $i）")
                i++; ws()
                out[k] = value(depth + 1); ws()
                if (i >= s.length) throw JsonException("オブジェクトが閉じていません")
                if (s[i] == ',') { i++; continue }
                if (s[i] == '}') { i++; return out }
                throw JsonException("オブジェクトの区切りが不正（位置 $i）")
            }
        }
    }
}

@Suppress("UNCHECKED_CAST")
fun Any?.asMap(): Map<String, Any?>? = this as? Map<String, Any?>
fun Any?.asList(): List<Any?>? = this as? List<Any?>
fun Map<String, Any?>.str(k: String, d: String = ""): String = (this[k] as? String) ?: d
fun Map<String, Any?>.long(k: String, d: Long = 0L): Long = when (val v = this[k]) { is Long -> v; is Double -> v.toLong(); is Int -> v.toLong(); else -> d }
fun Map<String, Any?>.int(k: String, d: Int = 0): Int = long(k, d.toLong()).coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong()).toInt()
fun Map<String, Any?>.bool(k: String, d: Boolean = false): Boolean = (this[k] as? Boolean) ?: d
fun Map<String, Any?>.strList(k: String): List<String> = (this[k] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
