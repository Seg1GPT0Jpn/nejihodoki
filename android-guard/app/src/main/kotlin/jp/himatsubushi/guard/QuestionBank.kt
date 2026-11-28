package jp.himatsubushi.guard

import android.content.Context
import jp.himatsubushi.guard.core.*
import java.io.File

/** 同梱の問題（assets の questions フォルダ）と、持ち主が取りこんだ問題（custom_questions.json）。 */
object QuestionBank {
    @Volatile private var bundled: List<Question>? = null

    fun bundled(ctx: Context): List<Question> {
        bundled?.let { return it }
        val out = ArrayList<Question>()
        try {
            val names = ctx.assets.list("questions").orEmpty().filter { it.endsWith(".json") }.sorted()
            for (n in names) {
                val text = ctx.assets.open("questions/$n").bufferedReader(Charsets.UTF_8).use { it.readText() }
                out += QuestionImport.parse(text, CAT_CUSTOM, "b").questions
            }
        } catch (e: Exception) { /* 読めた分だけ */ }
        bundled = out
        return out
    }

    private fun customFile(ctx: Context) = File(ctx.filesDir, "custom_questions.json")

    fun custom(ctx: Context): List<Question> = try {
        val f = customFile(ctx)
        if (!f.exists()) emptyList() else QuestionImport.parse(f.readText(), CAT_CUSTOM, "u").questions.map { it.copy(category = CAT_CUSTOM, level = 0) }
    } catch (e: Exception) { emptyList() }

    fun all(ctx: Context): List<Question> = bundled(ctx) + custom(ctx)

    /** 取りこんだ問題をたしざんする。保存した数を返す。 */
    fun addCustom(ctx: Context, qs: List<Question>, stamp: Long): Int {
        val old = custom(ctx)
        val fresh = qs.mapIndexed { i, q -> q.copy(id = "u$stamp-$i", category = CAT_CUSTOM, level = 0) }
        val all = (old + fresh).takeLast(QuestionImport.MAX_QUESTIONS)
        val arr = all.map { q ->
            linkedMapOf("id" to q.id, "q" to q.text, "a" to q.answer, "d" to q.distractors, "tags" to q.tags)
        }
        customFile(ctx).writeText(Json.write(arr))
        return fresh.size
    }

    fun clearCustom(ctx: Context) { customFile(ctx).delete() }
}
