package jp.himatsubushi.guard

import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import jp.himatsubushi.guard.core.*

/** 設定（PIN で守られる）。ゆるめる変更は、待ち時間のあとに反映される。 */
class SettingsActivity : BaseActivity() {
    override val titleRes = R.string.settings_title
    override val pinForEntry = true

    private val exportLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> uri?.let { doExport(it) } }
    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let { doImport(it) } }

    override fun render() {
        val s = store.settings
        val now = store.now()
        val commit = s.commitmentActive(now)
        rebuild {
            if (!store.hasPin()) addView(card(text(getString(R.string.set_no_pin), 15f, true).also { it.setTextColor(getColor(R.color.warn)) }))
            pendingView()?.let { addView(it) }

            // PIN
            addView(heading(getString(R.string.set_pin_head)))
            val pin = vbox()
            pin.addView(note(getString(if (store.hasPin()) R.string.set_pin_on else R.string.set_pin_off)))
            pin.addView(btn(getString(if (store.hasPin()) R.string.pin_change else R.string.pin_set)) { PinSetup.set(this@SettingsActivity) { render() } }, lp(top = 8, ctx = this@SettingsActivity))
            if (store.hasPin()) pin.addView(btn(getString(R.string.pin_remove), false) { PinSetup.remove(this@SettingsActivity) { render() } }, lp(top = 8, ctx = this@SettingsActivity))
            addView(card(pin))

            // 待ち時間
            addView(heading(getString(R.string.set_cooldown_head)))
            val cd = vbox()
            cd.addView(note(getString(R.string.set_cooldown_note)))
            cd.addView(chips(listOf(1, 5, 10, 30, 60, 180), s.cooldownMin, { getString(R.string.fmt_m, it) }) { v ->
                describeOutcome(store.submit(store.settings.copy(cooldownMin = v))); render()
            })
            addView(card(cd))

            // コミットメント
            addView(heading(getString(R.string.set_commit_head)))
            val cm = vbox()
            cm.addView(note(getString(R.string.set_commit_body)))
            if (commit) {
                val days = ((s.commitmentUntilMs - now + 86_399_999L) / 86_400_000L).toInt()
                cm.addView(text(getString(R.string.main_commitment, days), 15f, true).also { it.setPadding(0, dp(8), 0, 0) })
                cm.addView(note(getString(R.string.set_commit_extend)))
            }
            val row = ChipGroup(this@SettingsActivity)
            for (d in listOf(3, 7, 14, 30)) row.addView(Chip(this@SettingsActivity).apply { text = getString(R.string.fmt_days, d); minHeight = dp(48); setOnClickListener { startCommitment(d) } })
            cm.addView(row)
            addView(card(cm))

            // 保護
            addView(heading(getString(R.string.set_protect_head)))
            val pr = vbox()
            pr.addView(note(getString(R.string.set_protect_note)))
            pr.addView(switchRow(getString(R.string.set_protect_pages), s.protectSystemPages) { v -> describeOutcome(store.submit(store.settings.copy(protectSystemPages = v))); render() })
            pr.addView(note(getString(R.string.set_protect_pages_note)))
            pr.addView(switchRow(getString(R.string.set_protect_settings), s.protectSettingsApp) { v -> describeOutcome(store.submit(store.settings.copy(protectSettingsApp = v))); render() })
            pr.addView(switchRow(getString(R.string.set_protect_self), s.protectSelf) { v -> describeOutcome(store.submit(store.settings.copy(protectSelf = v))); render() })
            addView(card(pr))

            // 緊急解除
            addView(heading(getString(R.string.set_emerg_head)))
            val em = vbox()
            em.addView(note(getString(R.string.set_emerg_note, EmergencyLimiter.UNLOCK_MIN, EmergencyLimiter.COMMITMENT_MIN_GAP_MIN)))
            em.addView(chips(listOf(1, 2, 3, 5, 0), s.emergencyMaxPerDay, { if (it == 0) getString(R.string.unlimited) else getString(R.string.fmt_times, it) }) { v ->
                describeOutcome(store.submit(store.settings.copy(emergencyMaxPerDay = v))); render()
            })
            addView(card(em))

            // デバイス管理者
            addView(heading(getString(R.string.set_admin_head)))
            val ad = vbox()
            ad.addView(note(getString(R.string.set_admin_note)))
            if (Perms.admin(this@SettingsActivity)) {
                ad.addView(text(getString(R.string.status_ok), 14f, true).also { it.setTextColor(getColor(R.color.ok)) })
                ad.addView(btn(getString(R.string.set_admin_disable), false) { disableAdmin() }, lp(top = 8, ctx = this@SettingsActivity))
            } else ad.addView(btn(getString(R.string.onb_admin_enable)) { openOrToast(Perms.adminIntent(this@SettingsActivity)) }, lp(top = 8, ctx = this@SettingsActivity))
            addView(card(ad))

            // 時計とタイムゾーン
            addView(heading(getString(R.string.set_time_head)))
            val tm = vbox()
            val sys = java.util.TimeZone.getDefault().id
            tm.addView(note(getString(R.string.set_time_note)))
            tm.addView(text(getString(R.string.set_zone_home, s.zoneId), 15f, true).also { it.setPadding(0, dp(6), 0, 0) })
            tm.addView(note(getString(R.string.set_zone_system, sys, getString(if (store.autoTime()) R.string.auto_on else R.string.auto_off))))
            if (sys != s.zoneId) tm.addView(btn(getString(R.string.set_zone_change), false) {
                confirm(R.string.set_zone_change, getString(R.string.set_zone_confirm, sys, store.settings.cooldownMin)) {
                    describeOutcome(store.submit(store.settings.copy(zoneId = sys))); render()
                }
            }, lp(top = 8, ctx = this@SettingsActivity))
            tm.addView(btn(getString(R.string.set_clock_resync), false) {
                PinUi.require(this@SettingsActivity, R.string.set_clock_resync) { store.resyncClock(); toast(getString(R.string.saved)) }
            }, lp(top = 8, ctx = this@SettingsActivity))
            addView(card(tm))

            // 書き出し・読み込み
            addView(heading(getString(R.string.set_io_head)))
            val io = vbox()
            io.addView(note(getString(R.string.set_io_note)))
            io.addView(btn(getString(R.string.set_export), false) { PinUi.require(this@SettingsActivity, R.string.set_export) { exportLauncher.launch("himatsubushi-guard-settings.json") } }, lp(top = 8, ctx = this@SettingsActivity))
            io.addView(btn(getString(R.string.set_import), false) { PinUi.require(this@SettingsActivity, R.string.set_import) { importLauncher.launch(arrayOf("application/json", "text/plain", "*/*")) } }, lp(top = 8, ctx = this@SettingsActivity))
            addView(card(io))

            addView(heading(getString(R.string.set_more_head)))
            addView(btn(getString(R.string.set_perm_check), false) { startActivity(Intent(this@SettingsActivity, OnboardingActivity::class.java)) })
            addView(btn(getString(R.string.set_about), false) { info(R.string.set_about, getString(R.string.about_body)) }, lp(top = 8, ctx = this@SettingsActivity))
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

    private fun startCommitment(days: Int) {
        confirm(R.string.set_commit_head, getString(R.string.set_commit_confirm, days)) {
            PinUi.require(this, R.string.set_commit_head) { store.startCommitment(days); GuardService.ensureRunning(this); Engine.get(this).forceNotificationRefresh(); render() }
        }
    }

    private fun disableAdmin() {
        if (store.settings.commitmentActive(store.now())) { store.addTamper(TamperType.LOOSEN_REJECTED, "admin"); info(R.string.out_title, getString(R.string.out_rejected)); return }
        PinUi.require(this, R.string.set_admin_disable) {
            val now = store.now()
            store.adminRemovalAtMs = now + store.settings.cooldownMin * 60_000L
            store.addTamper(TamperType.COOLDOWN_STARTED, "admin", now)
            info(R.string.out_title, getString(R.string.out_pending, store.settings.cooldownMin)); render()
        }
    }

    private fun doExport(uri: Uri) {
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(SettingsCodec.export(store.settings, store.now()).toByteArray(Charsets.UTF_8)) }
            toast(getString(R.string.set_exported))
        } catch (e: Exception) { toast(getString(R.string.set_io_failed)) }
    }

    private fun doImport(uri: Uri) {
        val text = try { contentResolver.openInputStream(uri)?.use { it.readBytes().take(2_000_000).toByteArray().toString(Charsets.UTF_8) } } catch (e: Exception) { null }
        if (text == null) { toast(getString(R.string.set_io_failed)); return }
        when (val r = SettingsCodec.import(text)) {
            is SettingsCodec.ImportResult.Bad -> info(R.string.set_import, r.message)
            is SettingsCodec.ImportResult.Ok -> {
                val s = store.settings
                // 読みこんだ設定は、ふつうの変更と同じ関門を通る（ゆるめる分は待ち時間・コミットメント中は拒否）
                val keepMine = r.settings.copy(zoneId = if (r.settings.zoneId == s.zoneId) s.zoneId else r.settings.zoneId)
                describeOutcome(store.submit(keepMine)); render()
            }
        }
    }
}
