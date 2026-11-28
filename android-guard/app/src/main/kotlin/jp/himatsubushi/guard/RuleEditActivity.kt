package jp.himatsubushi.guard

import android.app.TimePickerDialog
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import jp.himatsubushi.guard.core.Rule
import jp.himatsubushi.guard.core.Window

/** 1 つのアプリの、1 日の上限とブロック時間帯（時間割）を決める。 */
class RuleEditActivity : BaseActivity() {
    companion object { const val X_PKG = "pkg" }

    override val titleRes = R.string.rule_title
    override val pinForEntry = true
    private lateinit var pkg: String
    private var rule: Rule? = null
    private var loaded = false

    override fun render() {
        pkg = intent.getStringExtra(X_PKG) ?: run { finish(); return }
        if (!loaded) { rule = store.settings.rule(pkg); loaded = true }
        val r = rule ?: run { finish(); return }
        rebuild {
            val head = hbox()
            head.addView(android.widget.ImageView(this@RuleEditActivity).apply {
                setImageDrawable(Apps.icon(this@RuleEditActivity, pkg)); layoutParams = LinearLayout.LayoutParams(dp(48), dp(48)).also { it.marginEnd = dp(12) }
            })
            head.addView(text(Apps.label(this@RuleEditActivity, pkg), 20f, true))
            addView(head)
            addView(note(getString(R.string.rule_gate_note, store.settings.cooldownMin)).also { it.setPadding(0, dp(8), 0, 0) })

            addView(card(switchRow(getString(R.string.rule_enabled), r.enabled) { rule = r.copy(enabled = it) }))

            // 1 日の上限
            val limitBox = vbox()
            limitBox.addView(switchRow(getString(R.string.rule_limit_on), r.dailyLimitMin != null) { on ->
                rule = r.copy(dailyLimitMin = if (on) (r.dailyLimitMin ?: 60) else null); render()
            })
            r.dailyLimitMin?.let { m ->
                limitBox.addView(text(getString(R.string.rule_limit_value, m), 20f, true).also { it.setPadding(0, dp(8), 0, dp(4)) })
                val chips = ChipGroup(this@RuleEditActivity)
                for (p in listOf(15, 30, 45, 60, 90, 120, 180)) chips.addView(Chip(this@RuleEditActivity).apply {
                    text = getString(R.string.fmt_m, p); isCheckable = true; isChecked = p == m; minHeight = dp(48)
                    setOnClickListener { rule = rule!!.copy(dailyLimitMin = p); render() }
                })
                limitBox.addView(chips)
                val step = hbox()
                step.addView(btn("−5", false) { rule = rule!!.copy(dailyLimitMin = ((rule!!.dailyLimitMin ?: 60) - 5).coerceAtLeast(0)); render() })
                step.addView(btn("+5", false) { rule = rule!!.copy(dailyLimitMin = ((rule!!.dailyLimitMin ?: 60) + 5).coerceAtMost(1440)); render() }, lp(ViewGroup_WRAP, ViewGroup_WRAP).also { it.marginStart = dp(8) })
                limitBox.addView(step)
            }
            addView(heading(getString(R.string.rule_limit_head)))
            addView(card(limitBox))

            // 時間割
            addView(heading(getString(R.string.rule_windows_head)))
            addView(note(getString(R.string.rule_windows_note)))
            val wb = vbox()
            if (r.windows.isEmpty()) wb.addView(note(getString(R.string.rule_windows_none)))
            r.windows.forEachIndexed { idx, w ->
                val row = hbox().apply { minimumHeight = dp(52) }
                val t = text(windowLine(w), 15f).also { it.layoutParams = LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f) }
                row.addView(t)
                row.addView(btn(getString(R.string.edit), false) { editWindow(idx) })
                row.addView(btn(getString(R.string.delete), false) { rule = rule!!.copy(windows = rule!!.windows.filterIndexed { i, _ -> i != idx }); render() }, lp(ViewGroup_WRAP, ViewGroup_WRAP).also { it.marginStart = dp(6) })
                wb.addView(row)
            }
            wb.addView(btn(getString(R.string.rule_add_window)) { editWindow(-1) }, lp(top = 8, ctx = this@RuleEditActivity))
            val presets = hbox()
            presets.addView(btn(getString(R.string.preset_school), false) { addPreset(Window(setOf(1, 2, 3, 4, 5), 8 * 60 + 30, 15 * 60 + 30, getString(R.string.preset_school_label))) })
            presets.addView(btn(getString(R.string.preset_night), false) { addPreset(Window(setOf(1, 2, 3, 4, 5, 6, 7), 22 * 60, 6 * 60, getString(R.string.preset_night_label))) }, lp(ViewGroup_WRAP, ViewGroup_WRAP).also { it.marginStart = dp(8) })
            wb.addView(presets, lp(top = 8, ctx = this@RuleEditActivity))
            addView(card(wb))

            addView(card(switchRow(getString(R.string.rule_quiz_in_windows), r.quizInWindows == true) { rule = r.copy(quizInWindows = if (it) true else null) }))

            addView(btn(getString(R.string.save)) { save() }, lp(top = 16, ctx = this@RuleEditActivity))
            addView(btn(getString(R.string.rule_remove), false) {
                confirm(R.string.rule_remove, getString(R.string.rule_remove_confirm, store.settings.cooldownMin)) {
                    val s = store.settings
                    describeOutcome(store.submit(s.copy(rules = s.rules.filter { it.pkg != pkg })))
                    if (store.settings.rule(pkg) == null) finish() else { loaded = false; render() }
                }
            }, lp(top = 8, ctx = this@RuleEditActivity))
        }
    }

    private fun addPreset(w: Window) { rule = rule!!.copy(windows = rule!!.windows + w); render() }

    private fun windowLine(w: Window): String {
        val names = dayNames()
        val days = if (w.days.size == 7) getString(R.string.every_day) else w.days.sorted().joinToString("") { names[it - 1] }
        val over = if (w.endMin <= w.startMin) " " + getString(R.string.next_day) else ""
        return (if (w.label.isNotBlank()) w.label + "\n" else "") + days + "  " + fmtClock(w.startMin) + "–" + fmtClock(w.endMin) + over
    }

    private fun editWindow(idx: Int) {
        val cur = if (idx >= 0) rule!!.windows[idx] else Window(setOf(1, 2, 3, 4, 5), 8 * 60 + 30, 15 * 60)
        var start = cur.startMin
        var end = cur.endMin
        val days = cur.days.toMutableSet()
        val box = vbox(12)
        val label = EditText(this).apply { hint = getString(R.string.window_label_hint); setText(cur.label); setSingleLine(); minimumHeight = dp(48) }
        box.addView(label)
        val chips = ChipGroup(this)
        val names = dayNames()
        for (d in 1..7) chips.addView(Chip(this).apply {
            text = names[d - 1]; isCheckable = true; isChecked = d in days; minHeight = dp(48)
            setOnCheckedChangeListener { _, c -> if (c) days.add(d) else days.remove(d) }
        })
        box.addView(chips)
        val startBtn = btn(getString(R.string.window_start, fmtClock(start)), false) {}
        val endBtn = btn(getString(R.string.window_end, fmtClock(end)), false) {}
        startBtn.setOnClickListener { TimePickerDialog(this, { _, h, m -> start = h * 60 + m; startBtn.text = getString(R.string.window_start, fmtClock(start)) }, start / 60, start % 60, true).show() }
        endBtn.setOnClickListener { TimePickerDialog(this, { _, h, m -> end = h * 60 + m; endBtn.text = getString(R.string.window_end, fmtClock(end)) }, (end / 60) % 24, end % 60, true).show() }
        box.addView(startBtn, lp(top = 8, ctx = this)); box.addView(endBtn, lp(top = 8, ctx = this))
        box.addView(note(getString(R.string.window_overnight_note)).also { it.setPadding(0, dp(8), 0, 0) })
        AlertDialog.Builder(this).setTitle(R.string.window_edit).setView(android.widget.ScrollView(this).also { it.addView(box) })
            .setPositiveButton(android.R.string.ok) { _, _ ->
                if (days.isEmpty()) { toast(getString(R.string.window_need_day)); return@setPositiveButton }
                val w = Window(days.toSet(), start, end, label.text.toString().trim()).normalized()
                val list = rule!!.windows.toMutableList()
                if (idx >= 0) list[idx] = w else list.add(w)
                rule = rule!!.copy(windows = list); render()
            }.setNegativeButton(android.R.string.cancel, null).show()
    }

    private fun save() {
        val r = rule ?: return
        val s = store.settings
        val exists = s.rules.any { it.pkg == pkg }
        val proposed = s.copy(rules = if (exists) s.rules.map { if (it.pkg == pkg) r else it } else s.rules + r)
        describeOutcome(store.submit(proposed))
        loaded = false
        render()
    }
}

private const val ViewGroup_WRAP = android.view.ViewGroup.LayoutParams.WRAP_CONTENT
