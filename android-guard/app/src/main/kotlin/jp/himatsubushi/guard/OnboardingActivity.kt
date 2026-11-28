package jp.himatsubushi.guard

import android.Manifest
import android.content.Context
import android.os.Build
import android.view.View
import android.widget.LinearLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import jp.himatsubushi.guard.core.PinHasher
import jp.himatsubushi.guard.core.TamperType

object Onboarding {
    fun permName(ctx: Context, bit: Int): String = ctx.getString(when (bit) {
        Perms.B_USAGE -> R.string.perm_usage
        Perms.B_OVERLAY -> R.string.perm_overlay
        Perms.B_NOTIF -> R.string.perm_notif
        Perms.B_A11Y -> R.string.perm_a11y
        Perms.B_BATTERY -> R.string.perm_battery
        else -> R.string.perm_admin
    })
}

/** 権限の案内。1 つずつ、なぜ必要か・どこで許可するかを説明する。あとから「権限の確認」としても開ける。 */
class OnboardingActivity : BaseActivity() {
    override val titleRes = R.string.onb_title
    override val needsGate = false
    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { render() }

    override fun render() {
        val b = Perms.bits(this)
        rebuild {
            addView(text(getString(R.string.onb_intro), 15f))
            addView(card(text(getString(R.string.onb_honest_head), 16f, true), note(getString(R.string.onb_honest_body))))

            addView(step(R.string.perm_usage, R.string.onb_usage_why, b and Perms.B_USAGE != 0, true,
                getString(R.string.onb_open_settings) to { openOrToast(Perms.usageIntent(this@OnboardingActivity), Perms.usageIntentFallback()) }))
            addView(step(R.string.perm_overlay, R.string.onb_overlay_why, b and Perms.B_OVERLAY != 0, true,
                getString(R.string.onb_open_settings) to { openOrToast(Perms.overlayIntent(this@OnboardingActivity), Perms.appDetailsIntent(this@OnboardingActivity)) }))
            addView(step(R.string.perm_notif, R.string.onb_notif_why, b and Perms.B_NOTIF != 0, false,
                getString(R.string.onb_allow) to {
                    if (Build.VERSION.SDK_INT >= 33 && !Perms.notifications(this@OnboardingActivity)) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else openOrToast(Perms.notifIntent(this@OnboardingActivity), Perms.appDetailsIntent(this@OnboardingActivity))
                }))
            addView(step(R.string.perm_battery, R.string.onb_battery_why, b and Perms.B_BATTERY != 0, false,
                getString(R.string.onb_open_settings) to { openOrToast(Perms.batteryIntent(this@OnboardingActivity), Perms.batteryListIntent(), Perms.appDetailsIntent(this@OnboardingActivity)) }))
            addView(step(R.string.perm_a11y, R.string.onb_a11y_why, b and Perms.B_A11Y != 0, false,
                getString(R.string.onb_open_a11y) to { openOrToast(Perms.a11yIntent()) },
                getString(R.string.onb_open_appinfo) to { openOrToast(Perms.appDetailsIntent(this@OnboardingActivity)) }))
            addView(step(R.string.perm_admin, R.string.onb_admin_why, b and Perms.B_ADMIN != 0, false,
                getString(R.string.onb_admin_enable) to { openOrToast(Perms.adminIntent(this@OnboardingActivity)) }))

            // PIN
            val pinBox = vbox()
            pinBox.addView(text(getString(R.string.onb_pin_head), 16f, true))
            pinBox.addView(statusLine(store.hasPin(), false))
            pinBox.addView(note(getString(R.string.onb_pin_why)))
            pinBox.addView(btn(getString(if (store.hasPin()) R.string.pin_change else R.string.pin_set), store.hasPin().not()) { PinSetup.set(this@OnboardingActivity) { render() } }, lp(top = 8, ctx = this@OnboardingActivity))
            addView(card(pinBox))

            // 自分への約束のしくみ
            addView(card(text(getString(R.string.onb_promise_head), 16f, true), note(getString(R.string.onb_promise_body))))
            addView(card(text(getString(R.string.onb_limits_head), 16f, true), note(getString(R.string.onb_limits_body))))

            val ready = b and Perms.B_USAGE != 0 && b and Perms.B_OVERLAY != 0
            if (!store.setupDone) {
                if (!ready) addView(note(getString(R.string.onb_need_required)).also { it.setPadding(0, dp(12), 0, 0); it.setTextColor(getColor(R.color.warn)) })
                addView(btn(getString(R.string.onb_finish)) { finishSetup(ready) }, lp(top = 12, ctx = this@OnboardingActivity))
            } else addView(btn(getString(R.string.onb_done)) { finish() }, lp(top = 12, ctx = this@OnboardingActivity))
        }
    }

    private fun statusLine(ok: Boolean, required: Boolean): View =
        text(getString(if (ok) R.string.status_ok else if (required) R.string.status_required else R.string.status_optional), 14f, true)
            .also { it.setTextColor(getColor(if (ok) R.color.ok else if (required) R.color.bad else R.color.warn)) }

    private fun step(title: Int, why: Int, ok: Boolean, required: Boolean, vararg actions: Pair<String, () -> Unit>): View {
        val box = vbox()
        box.addView(text(getString(title), 16f, true))
        box.addView(statusLine(ok, required))
        box.addView(note(getString(why)).also { it.setPadding(0, dp(4), 0, 0) })
        if (!ok) for ((label, fn) in actions) box.addView(btn(label, actions.first().first == label) { fn() }, lp(top = 8, ctx = this))
        return card(box)
    }

    private fun finishSetup(ready: Boolean) {
        if (!ready) { toast(getString(R.string.onb_need_required)); return }
        val bits = Perms.bits(this)
        store.permBits = bits
        store.notifEver = bits and Perms.B_NOTIF != 0
        store.a11yEver = bits and Perms.B_A11Y != 0
        store.batteryOk = bits and Perms.B_BATTERY != 0
        store.lastSystemZone = java.util.TimeZone.getDefault().id
        if (store.settings.rules.isEmpty() && store.settings.zoneId == "Asia/Tokyo") {
            val z = java.util.TimeZone.getDefault().id
            if (z.isNotEmpty()) store.replaceSettingsDirect(store.settings.copy(zoneId = z))
        }
        store.setupDone = true
        store.setupDay = store.today()
        store.observeClock()
        store.saveState()
        WatchdogJobService.schedule(this)
        WatchdogReceiver.schedule(this)
        GuardService.ensureRunning(this)
        Engine.get(this).start()
        toast(getString(R.string.onb_started))
        finish()
    }
}

/** PIN を決める・変える・消す。ゆるめる操作（変更・削除）は待ち時間のあとに反映され、コミットメント中はできない。 */
object PinSetup {
    fun set(act: BaseActivity, onDone: () -> Unit) {
        val store = act.store
        if (store.hasPin()) {
            PinUi.require(act, R.string.pin_change) { askNew(act, onDone) }
        } else askNew(act, onDone)
    }

    private fun askNew(act: BaseActivity, onDone: () -> Unit) {
        val store = act.store
        val a = PinUi.pinField(act)
        val b = PinUi.pinField(act).also { it.hint = act.getString(R.string.pin_hint_again) }
        val box = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(act.dp(24), act.dp(8), act.dp(24), 0) }
        box.addView(act.note(act.getString(R.string.pin_rules)))
        box.addView(a, lp()); box.addView(b, lp())
        val d = AlertDialog.Builder(act).setTitle(R.string.pin_set).setView(box)
            .setPositiveButton(android.R.string.ok, null).setNegativeButton(android.R.string.cancel, null).create()
        d.setOnShowListener {
            d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val p = a.text.toString()
                when {
                    !PinHasher.isValidFormat(p) -> a.error = act.getString(R.string.pin_format)
                    p != b.text.toString() -> b.error = act.getString(R.string.pin_mismatch)
                    else -> {
                        val rec = PinHasher.create(p)
                        if (!store.hasPin()) {
                            SecureStore.writeRecord(act, rec); PinUi.markOk()
                            d.dismiss(); act.toast(act.getString(R.string.pin_saved)); onDone()
                        } else if (store.settings.commitmentActive(store.now())) {
                            d.dismiss(); act.info(R.string.out_title, act.getString(R.string.out_rejected))
                            store.addTamper(TamperType.LOOSEN_REJECTED, "PIN")
                        } else {
                            val now = store.now()
                            store.pinPending = Store.PinPending(now + store.settings.cooldownMin * 60_000L, false, rec)
                            store.addTamper(TamperType.COOLDOWN_STARTED, "PIN", now)
                            d.dismiss(); act.info(R.string.out_title, act.getString(R.string.out_pending, store.settings.cooldownMin)); onDone()
                        }
                    }
                }
            }
        }
        d.show()
    }

    fun remove(act: BaseActivity, onDone: () -> Unit) {
        val store = act.store
        PinUi.require(act, R.string.pin_remove) {
            if (store.settings.commitmentActive(store.now())) {
                store.addTamper(TamperType.LOOSEN_REJECTED, "PIN"); act.info(R.string.out_title, act.getString(R.string.out_rejected)); return@require
            }
            val now = store.now()
            store.pinPending = Store.PinPending(now + store.settings.cooldownMin * 60_000L, true, null)
            store.addTamper(TamperType.COOLDOWN_STARTED, "PIN", now)
            act.info(R.string.out_title, act.getString(R.string.out_pending, store.settings.cooldownMin)); onDone()
        }
    }
}
