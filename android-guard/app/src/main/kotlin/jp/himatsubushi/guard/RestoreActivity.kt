package jp.himatsubushi.guard

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager

/**
 * 権限が外れたとき、ほかのアプリの上に出る画面。権限が戻るまで、戻る操作では閉じない。
 * （ホームボタンは止められない。ただし、ほかのアプリを開くたびに、またこの画面が出る。）
 */
class RestoreActivity : BaseActivity() {
    companion object { @Volatile var visible = false }

    override val titleRes = R.string.restore_title
    override val showUp = false
    override val needsGate = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (Health.compute(this@RestoreActivity, store).ok) finish() else goHome() }
        })
    }


    private fun goHome() { startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }

    override fun onStart() { super.onStart(); visible = true }
    override fun onStop() { visible = false; super.onStop() }

    override fun render() {
        val h = Health.compute(this, store)
        if (h.ok) { toast(getString(R.string.restore_done)); finish(); return }
        rebuild {
            addView(text(getString(R.string.restore_head), 18f, true))
            addView(note(getString(R.string.restore_body)).also { it.setPadding(0, dp(6), 0, dp(6)) })
            for (bit in h.missing) {
                val box = vbox()
                box.addView(text(Onboarding.permName(this@RestoreActivity, bit), 16f, true).also { it.setTextColor(getColor(R.color.bad)) })
                val intents = when (bit) {
                    Perms.B_USAGE -> arrayOf(Perms.usageIntent(this@RestoreActivity), Perms.usageIntentFallback())
                    Perms.B_OVERLAY -> arrayOf(Perms.overlayIntent(this@RestoreActivity), Perms.appDetailsIntent(this@RestoreActivity))
                    Perms.B_NOTIF -> arrayOf(Perms.notifIntent(this@RestoreActivity), Perms.appDetailsIntent(this@RestoreActivity))
                    else -> arrayOf(Perms.a11yIntent())
                }
                box.addView(btn(getString(R.string.onb_open_settings)) { openOrToast(*intents) }, lp(top = 8, ctx = this@RestoreActivity))
                if (bit == Perms.B_A11Y) box.addView(note(getString(R.string.restore_a11y_hint)).also { it.setPadding(0, dp(6), 0, 0) })
                addView(card(box))
            }
            addView(btn(getString(R.string.restore_recheck), false) { render() }, lp(top = 12, ctx = this@RestoreActivity))
            addView(note(getString(R.string.restore_limits)).also { it.setPadding(0, dp(12), 0, 0) })
        }
    }
}
