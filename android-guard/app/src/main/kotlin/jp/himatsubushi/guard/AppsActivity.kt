package jp.himatsubushi.guard

import android.content.Intent
import android.widget.ImageView
import android.widget.LinearLayout
import jp.himatsubushi.guard.core.Rule
import jp.himatsubushi.guard.core.Window

/** 制限するアプリの一覧。 */
class AppsActivity : BaseActivity() {
    override val titleRes = R.string.apps_title
    override val pinForEntry = true

    override fun render() = rebuild {
        addView(note(getString(R.string.apps_intro)))
        addView(btn(getString(R.string.apps_add)) { addApps() }, lp(top = 12, ctx = this@AppsActivity))
        val rules = store.settings.rules
        if (rules.isEmpty()) addView(note(getString(R.string.apps_empty)).also { it.setPadding(0, dp(16), 0, 0) })
        for (r in rules.sortedBy { Apps.label(this@AppsActivity, it.pkg).lowercase() }) addView(row(r))
    }

    private fun row(r: Rule): android.view.View {
        val label = Apps.label(this, r.pkg)
        val top = hbox()
        top.addView(ImageView(this).apply { setImageDrawable(Apps.icon(this@AppsActivity, r.pkg)); layoutParams = LinearLayout.LayoutParams(dp(40), dp(40)).also { it.marginEnd = dp(12) } })
        val col = vbox()
        col.addView(text(label + if (r.enabled) "" else " " + getString(R.string.rule_off), 16f, true))
        col.addView(note(summary(r)))
        col.layoutParams = LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        top.addView(col)
        val c = card(top)
        c.isClickable = true; c.isFocusable = true
        c.contentDescription = "$label ${summary(r)}"
        c.setOnClickListener { startActivity(Intent(this, RuleEditActivity::class.java).putExtra(RuleEditActivity.X_PKG, r.pkg)) }
        return c
    }

    fun summary(r: Rule): String {
        val parts = ArrayList<String>()
        r.dailyLimitMin?.let { parts.add(getString(R.string.sum_limit, it)) }
        for (w in r.windows) parts.add(windowText(w))
        return if (parts.isEmpty()) getString(R.string.sum_none) else parts.joinToString(" / ")
    }

    private fun windowText(w: Window): String {
        val names = dayNames()
        val days = if (w.days.size == 7) getString(R.string.every_day) else w.days.sorted().joinToString("") { names[it - 1] }
        return (if (w.label.isNotBlank()) w.label + " " else "") + days + " " + fmtClock(w.startMin) + "–" + fmtClock(w.endMin)
    }

    private fun addApps() {
        AppPicker.show(this, R.string.apps_pick, store.settings.rules.map { it.pkg }.toSet()) { picked ->
            if (picked.isEmpty()) return@show
            val s = store.settings
            val o = store.submit(s.copy(rules = s.rules + picked.map { Rule(it, dailyLimitMin = 60) }))
            describeOutcome(o)
            render()
        }
    }
}
