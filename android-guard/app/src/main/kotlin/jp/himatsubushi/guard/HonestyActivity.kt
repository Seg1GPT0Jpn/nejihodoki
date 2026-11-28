package jp.himatsubushi.guard

import android.content.Context
import jp.himatsubushi.guard.core.*
import java.text.DateFormat
import java.util.Date

/** 週の「正直レポート」：すり抜けの疑いのある出来事と、緊急解除の記録。自分に隠さないための画面。 */
class HonestyActivity : BaseActivity() {
    override val titleRes = R.string.honesty_title

    private fun label(ctx: Context, t: TamperType): String = ctx.getString(when (t) {
        TamperType.PERMISSION_REVOKED -> R.string.t_permission
        TamperType.ACCESSIBILITY_OFF -> R.string.t_a11y
        TamperType.BATTERY_OPT_ON -> R.string.t_battery
        TamperType.SERVICE_KILLED -> R.string.t_killed
        TamperType.CLOCK_ROLLBACK -> R.string.t_clock_back
        TamperType.CLOCK_FORWARD -> R.string.t_clock_fwd
        TamperType.TIMEZONE_CHANGED -> R.string.t_zone
        TamperType.SETTINGS_PAGE_BLOCKED -> R.string.t_page
        TamperType.ADMIN_DISABLED -> R.string.t_admin
        TamperType.FOCUS_STOPPED_EARLY -> R.string.t_focus_stop
        TamperType.PIN_FAILED -> R.string.t_pin_fail
        TamperType.COOLDOWN_STARTED -> R.string.t_cd_start
        TamperType.COOLDOWN_CANCELED -> R.string.t_cd_cancel
        TamperType.COOLDOWN_APPLIED -> R.string.t_cd_apply
        TamperType.COMMITMENT_STARTED -> R.string.t_commit
        TamperType.CLOCK_RESYNC -> R.string.t_resync
        TamperType.UNINSTALL_ATTEMPT -> R.string.t_uninstall
        TamperType.LOOSEN_REJECTED -> R.string.t_rejected
    })

    override fun render() {
        val r = HonestyReports.build(store.tamper, store.emergencyLog, store.now(), store.zone())
        val df = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
        rebuild {
            addView(note(getString(R.string.honesty_intro)))
            val head = vbox()
            head.addView(text(getString(R.string.honesty_clean, r.cleanDays), 20f, true, com.google.android.material.R.attr.colorPrimary))
            head.addView(text(getString(R.string.honesty_counts, r.tamperTotal, r.emergencyCount, r.changeCount), 15f).also { it.setPadding(0, dp(6), 0, 0) })
            addView(card(head))

            if (r.tamperCounts.isNotEmpty()) {
                addView(heading(getString(R.string.honesty_by_type)))
                val b = vbox()
                for ((t, n) in r.tamperCounts.entries.sortedByDescending { it.value }) b.addView(text("${label(this@HonestyActivity, t)}  ×$n", 15f))
                addView(card(b))
            }

            addView(heading(getString(R.string.honesty_emergency)))
            if (r.emergencyEntries.isEmpty()) addView(note(getString(R.string.honesty_none)))
            else {
                val b = vbox()
                for (e in r.emergencyEntries.take(30)) {
                    b.addView(text(df.format(Date(e.atMs)) + "  " + (if (e.pkg == "-") "" else Apps.label(this@HonestyActivity, e.pkg)), 14f, true).also { it.setPadding(0, dp(8), 0, 0) })
                    b.addView(note("「" + e.reason + "」"))
                }
                addView(card(b))
            }

            addView(heading(getString(R.string.honesty_log)))
            if (r.events.isEmpty()) addView(note(getString(R.string.honesty_none)))
            else {
                val b = vbox()
                for (e in r.events.take(60)) b.addView(note(df.format(Date(e.atMs)) + "  " + label(this@HonestyActivity, e.type) + (if (e.detail.isNotBlank()) "  (" + e.detail + ")" else "")).also { it.setPadding(0, dp(3), 0, dp(3)) })
                addView(card(b))
            }
            addView(note(getString(R.string.honesty_footer)).also { it.setPadding(0, dp(12), 0, 0) })
        }
    }
}
