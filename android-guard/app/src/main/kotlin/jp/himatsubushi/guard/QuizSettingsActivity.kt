package jp.himatsubushi.guard

import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import jp.himatsubushi.guard.core.*

/** 「クイズで解除」の設定と、持ち主の問題ファイルの取りこみ。 */
class QuizSettingsActivity : BaseActivity() {
    override val titleRes = R.string.quiz_title
    override val pinForEntry = true

    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { doImport(it) } }

    private fun update(q: QuizConfig) { describeOutcome(store.submit(store.settings.copy(quiz = q.normalized()))); render() }

    override fun render() {
        val q = store.settings.quiz
        rebuild {
            addView(note(getString(R.string.quiz_intro)))
            addView(note(getString(R.string.quiz_gate_note, store.settings.cooldownMin)).also { it.setPadding(0, dp(4), 0, 0) })

            addView(heading(getString(R.string.quiz_count)))
            addView(chips((3..10).toList(), q.count, { getString(R.string.fmt_questions, it) }) { update(q.copy(count = it)) })
            addView(heading(getString(R.string.quiz_reward)))
            addView(chips(listOf(5, 10, 15, 20, 25, 30), q.rewardMin, { getString(R.string.fmt_m, it) }) { update(q.copy(rewardMin = it)) })
            addView(note(getString(R.string.quiz_reward_note, q.penaltyMin, q.cooldownPerWrongSec)))
            addView(heading(getString(R.string.quiz_penalty)))
            addView(chips(listOf(0, 1, 2, 5, 10), q.penaltyMin, { getString(R.string.fmt_m, it) }) { update(q.copy(penaltyMin = it)) })
            addView(heading(getString(R.string.quiz_cooldown)))
            addView(chips(listOf(0, 10, 20, 60, 120), q.cooldownPerWrongSec, { getString(R.string.fmt_s, it) }) { update(q.copy(cooldownPerWrongSec = it)) })
            addView(heading(getString(R.string.quiz_maxbonus)))
            addView(chips(listOf(0, 30, 60, 120, 240), q.maxBonusMinPerDay, { getString(R.string.fmt_m, it) }) { update(q.copy(maxBonusMinPerDay = it)) })

            addView(heading(getString(R.string.quiz_cats)))
            val catGroup = ChipGroup(this@QuizSettingsActivity)
            val names = mapOf(CAT_MATH to R.string.cat_math, CAT_KANJI to R.string.cat_kanji, CAT_ENGLISH to R.string.cat_english,
                CAT_SOCIAL to R.string.cat_social, CAT_SCIENCE to R.string.cat_science, CAT_CUSTOM to R.string.cat_custom)
            for (c in ALL_CATEGORIES) catGroup.addView(Chip(this@QuizSettingsActivity).apply {
                text = getString(names[c]!!); isCheckable = true; isChecked = c in q.categories; minHeight = dp(48)
                setOnClickListener {
                    val now = if (c in q.categories) q.categories - c else q.categories + c
                    if (now.isEmpty()) { toast(getString(R.string.quiz_need_cat)); render() } else update(q.copy(categories = now))
                }
            })
            addView(catGroup)

            addView(heading(getString(R.string.quiz_levels)))
            addView(note(getString(R.string.quiz_levels_note)))
            addView(note(getString(R.string.quiz_level_min)))
            addView(chips((1..9).toList(), q.minLevel, { it.toString() }) { update(q.copy(minLevel = it, maxLevel = maxOf(it, q.maxLevel))) })
            addView(note(getString(R.string.quiz_level_max)))
            addView(chips((1..9).toList(), q.maxLevel, { it.toString() }) { update(q.copy(maxLevel = it, minLevel = minOf(it, q.minLevel))) })

            addView(card(switchRow(getString(R.string.quiz_in_windows), q.allowInWindows) { update(q.copy(allowInWindows = it)) }))

            // 取りこみ
            addView(heading(getString(R.string.quiz_import_head)))
            val bundled = QuestionBank.bundled(this@QuizSettingsActivity).size
            val custom = QuestionBank.custom(this@QuizSettingsActivity).size
            val imp = vbox()
            imp.addView(note(getString(R.string.quiz_import_note)))
            imp.addView(text(getString(R.string.quiz_bank_counts, bundled, custom), 14f, true).also { it.setPadding(0, dp(6), 0, 0) })
            imp.addView(btn(getString(R.string.quiz_import_btn), false) { importLauncher.launch(arrayOf("text/csv", "text/comma-separated-values", "application/json", "text/plain", "*/*")) }, lp(top = 8, ctx = this@QuizSettingsActivity))
            if (custom > 0) imp.addView(btn(getString(R.string.quiz_import_clear), false) {
                confirm(R.string.quiz_import_clear, getString(R.string.quiz_import_clear_confirm)) { QuestionBank.clearCustom(this@QuizSettingsActivity); render() }
            }, lp(top = 8, ctx = this@QuizSettingsActivity))
            addView(card(imp))
        }
    }

    private fun chips(options: List<Int>, selected: Int, label: (Int) -> String, onPick: (Int) -> Unit): ChipGroup {
        val g = ChipGroup(this)
        g.isSingleSelection = true
        for (o in options) g.addView(Chip(this).apply {
            text = label(o); isCheckable = true; isChecked = o == selected; minHeight = dp(48)
            setOnClickListener { if (o != selected) onPick(o) }
        })
        return g
    }

    private fun doImport(uri: Uri) {
        val bytes = try { contentResolver.openInputStream(uri)?.use { it.readBytes() } } catch (e: Exception) { null }
        if (bytes == null) { toast(getString(R.string.set_io_failed)); return }
        if (bytes.size > 5_000_000) { toast(getString(R.string.quiz_import_big)); return }
        var text = bytes.toString(Charsets.UTF_8)
        if (text.contains('�')) try { text = bytes.toString(charset("Shift_JIS")) } catch (e: Exception) { }
        val rep = QuestionImport.parse(text, CAT_CUSTOM, "u")
        if (rep.questions.isEmpty()) { info(R.string.quiz_import_head, getString(R.string.quiz_import_none) + "\n" + rep.errors.joinToString("\n")); return }
        val n = QuestionBank.addCustom(this, rep.questions, System.currentTimeMillis())
        info(R.string.quiz_import_head, getString(R.string.quiz_import_done, n, rep.skipped) + (if (rep.errors.isNotEmpty()) "\n" + rep.errors.joinToString("\n") else ""))
        render()
    }
}
