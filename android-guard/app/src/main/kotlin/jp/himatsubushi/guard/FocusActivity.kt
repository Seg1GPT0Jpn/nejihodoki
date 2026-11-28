package jp.himatsubushi.guard

import android.os.Handler
import android.os.Looper
import android.widget.TextView
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import jp.himatsubushi.guard.core.Schedule

/** 集中モード：15・25・45 分、選んだアプリを使えなくする。 */
class FocusActivity : BaseActivity() {
    override val titleRes = R.string.focus_title
    private var minutes = 25
    private val ui = Handler(Looper.getMainLooper())
    private var remainView: TextView? = null
    private val tick = object : Runnable {
        override fun run() {
            val f = store.focus
            if (f == null || !f.active(store.now())) { render(); return }
            updateRemain(); ui.postDelayed(this, 1000)
        }
    }

    override fun onPause() { ui.removeCallbacks(tick); super.onPause() }

    private fun updateRemain() {
        val f = store.focus ?: return
        val s = ((f.endMs - store.now()) / 1000).coerceAtLeast(0)
        remainView?.text = "%d:%02d".format(s / 60, s % 60)
    }

    override fun render() {
        ui.removeCallbacks(tick)
        val now = store.now()
        val f = store.focus?.takeIf { it.active(now) }
        rebuild {
            if (f != null) {
                addView(text(getString(R.string.focus_running), 16f, true))
                val t = text("", 48f, true, com.google.android.material.R.attr.colorPrimary).also { it.setPadding(0, dp(8), 0, dp(8)) }
                remainView = t; addView(t); updateRemain()
                addView(note(getString(R.string.focus_blocking, f.apps.joinToString("、") { Apps.label(this@FocusActivity, it) })))
                val commit = store.settings.commitmentActive(now)
                if (commit) addView(note(getString(R.string.focus_commit_note)).also { it.setPadding(0, dp(8), 0, 0) })
                addView(btn(getString(R.string.focus_stop), false) {
                    if (commit) { info(R.string.focus_stop, getString(R.string.out_rejected)); return@btn }
                    PinUi.require(this@FocusActivity, R.string.focus_stop) { store.stopFocus(true); Engine.get(this@FocusActivity).forceNotificationRefresh(); render() }
                }, lp(top = 16, ctx = this@FocusActivity))
                ui.postDelayed(tick, 1000)
            } else {
                addView(note(getString(R.string.focus_intro)))
                addView(heading(getString(R.string.focus_len)))
                val chips = ChipGroup(this@FocusActivity)
                for (m in listOf(15, 25, 45)) chips.addView(Chip(this@FocusActivity).apply {
                    text = getString(R.string.fmt_m, m); isCheckable = true; isChecked = m == minutes; minHeight = dp(48)
                    setOnClickListener { minutes = m }
                })
                chips.isSingleSelection = true
                addView(chips)
                addView(heading(getString(R.string.focus_apps)))
                val apps = store.settings.focusApps
                addView(note(if (apps.isEmpty()) getString(R.string.focus_apps_none) else apps.joinToString("、") { Apps.label(this@FocusActivity, it) }))
                addView(btn(getString(R.string.focus_pick), false) {
                    AppPicker.show(this@FocusActivity, R.string.focus_pick, emptySet(), store.settings.focusApps) { picked ->
                        describeOutcome(store.submit(store.settings.copy(focusApps = picked))); render()
                    }
                }, lp(top = 8, ctx = this@FocusActivity))
                addView(note(getString(R.string.focus_gate_note, store.settings.cooldownMin)).also { it.setPadding(0, dp(6), 0, 0) })
                addView(btn(getString(R.string.focus_start)) {
                    val a = store.settings.focusApps
                    if (a.isEmpty()) { toast(getString(R.string.focus_apps_none)); return@btn }
                    store.startFocus(minutes, a)
                    GuardService.ensureRunning(this@FocusActivity)
                    Engine.get(this@FocusActivity).let { it.forceNotificationRefresh(); it.post { it.tick() } }
                    render()
                }, lp(top = 20, ctx = this@FocusActivity))
            }
        }
    }
}
