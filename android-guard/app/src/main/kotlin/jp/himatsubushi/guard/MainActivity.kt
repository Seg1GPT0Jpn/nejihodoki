package jp.himatsubushi.guard

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.View
import jp.himatsubushi.guard.core.Enforcer

class MainActivity : BaseActivity() {
    override val titleRes = R.string.app_name
    override val showUp = false
    private val ui = Handler(Looper.getMainLooper())
    private var launchedOnboarding = false
    private val refresher = object : Runnable { override fun run() { if (store.pendings.isNotEmpty() || store.pinPending != null) render(); ui.postDelayed(this, 30_000) } }

    override fun onResume() {
        super.onResume()
        ui.removeCallbacks(refresher); ui.postDelayed(refresher, 30_000)
        if (store.setupDone) GuardService.ensureRunning(this)
    }

    override fun onPause() { ui.removeCallbacks(refresher); super.onPause() }

    override fun render() {
        if (!store.setupDone && !launchedOnboarding) { launchedOnboarding = true; startActivity(Intent(this, OnboardingActivity::class.java)) }
        val now = store.now()
        val h = Health.compute(this, store)
        rebuild {
            // 状態
            val status = vbox()
            if (!store.setupDone) {
                status.addView(text(getString(R.string.main_not_setup), 16f, true))
                status.addView(btn(getString(R.string.main_start_setup)) { startActivity(Intent(this@MainActivity, OnboardingActivity::class.java)) }, lp(top = 8, ctx = this@MainActivity))
            } else if (!h.ok) {
                status.addView(text(getString(R.string.main_perm_missing), 16f, true).also { it.setTextColor(getColor(R.color.bad)) })
                for (b in h.missing) status.addView(note("・" + Onboarding.permName(this@MainActivity, b)))
                status.addView(btn(getString(R.string.main_restore)) { startActivity(Intent(this@MainActivity, RestoreActivity::class.java)) }, lp(top = 8, ctx = this@MainActivity))
            } else {
                status.addView(text(getString(R.string.main_ok), 16f, true).also { it.setTextColor(getColor(R.color.ok)) })
                status.addView(note(getString(if (GuardService.instance != null) R.string.main_service_on else R.string.main_service_off)))
                if (h.batteryLost) {
                    status.addView(note(getString(R.string.main_battery_lost)).also { it.setTextColor(getColor(R.color.warn)) })
                    status.addView(btn(getString(R.string.onb_open_settings), false) { openOrToast(Perms.batteryIntent(this@MainActivity), Perms.batteryListIntent()) })
                }
                if (h.bits and Perms.B_A11Y == 0) status.addView(note(getString(R.string.main_a11y_hint)))
            }
            addView(card(status))

            if (store.settings.commitmentActive(now)) {
                val days = ((store.settings.commitmentUntilMs - now + 86_399_999L) / 86_400_000L).toInt()
                addView(card(text(getString(R.string.main_commitment, days), 15f, true), note(getString(R.string.main_commitment_note))))
            }
            if (Enforcer.protectionActive(store.settings, now) && store.settings.protectSystemPages) addView(note(getString(R.string.main_protecting)).also { it.setPadding(0, dp(8), 0, 0) })

            pendingView()?.let { addView(it) }
            store.focus?.takeIf { it.active(now) }?.let { f ->
                addView(card(text(getString(R.string.main_focus_running, ((f.endMs - now + 59_999) / 60_000L).toInt()), 15f, true)))
            }

            // 今日の使用
            val rules = store.settings.rules.filter { it.enabled && it.dailyLimitMin != null }
            if (rules.isNotEmpty()) {
                addView(heading(getString(R.string.main_today)))
                val b = vbox()
                for (r in rules.sortedBy { Apps.label(this@MainActivity, it.pkg).lowercase() }) {
                    val used = store.usedToday(r.pkg)
                    val limit = r.dailyLimitMin!! * 60_000L + store.bonusToday(r.pkg)
                    b.addView(text(Apps.label(this@MainActivity, r.pkg), 15f, true).also { it.setPadding(0, dp(8), 0, 0) })
                    b.addView(note(getString(R.string.main_used_of, fmtMs(used), fmtMs(limit))))
                    b.addView(progress((used / 1000).toInt(), (limit / 1000).toInt().coerceAtLeast(1), used >= limit))
                }
                addView(card(b))
            }

            addView(heading(getString(R.string.main_menu)))
            addView(menu(R.string.apps_title, R.string.menu_apps_desc, AppsActivity::class.java))
            addView(menu(R.string.focus_title, R.string.menu_focus_desc, FocusActivity::class.java))
            addView(menu(R.string.dash_title, R.string.menu_dash_desc, DashboardActivity::class.java))
            addView(menu(R.string.honesty_title, R.string.menu_honesty_desc, HonestyActivity::class.java))
            addView(menu(R.string.quiz_title, R.string.menu_quiz_desc, QuizSettingsActivity::class.java))
            addView(menu(R.string.settings_title, R.string.menu_settings_desc, SettingsActivity::class.java))
        }
    }

    private fun fmtMs(ms: Long) = fmtMin(ms)

    private fun menu(title: Int, desc: Int, cls: Class<*>): View {
        val c = card(text(getString(title), 16f, true), note(getString(desc)))
        c.isClickable = true; c.isFocusable = true
        c.contentDescription = getString(title) + ". " + getString(desc)
        c.setOnClickListener { startActivity(Intent(this, cls)) }
        return c
    }
}
