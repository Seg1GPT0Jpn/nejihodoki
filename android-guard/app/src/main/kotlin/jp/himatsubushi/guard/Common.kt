package jp.himatsubushi.guard

import android.view.View
import jp.himatsubushi.guard.core.PendingChange

/** 待ち中の変更（ゆるめる変更は、待ち時間のあとに反映される）の一覧。なければ null。 */
fun BaseActivity.pendingView(): View? {
    val s = store
    val now = s.now()
    val box = vbox()
    var any = false
    for (p in s.pendings) {
        any = true
        box.addView(pendingRow(p, now))
    }
    s.pinPending?.let { pp ->
        any = true
        val row = vbox()
        row.addView(text(getString(if (pp.remove) R.string.pending_pin_remove else R.string.pending_pin_change), 14f, true))
        row.addView(note(getString(R.string.pending_in, fmtMin(pp.applyAtMs - now + 59_999))))
        row.addView(btn(getString(R.string.pending_cancel), false) { s.pinPending = null; s.cancelPending("-"); render2() })
        box.addView(row)
    }
    if (s.adminRemovalAtMs > now) {
        any = true
        val row = vbox()
        row.addView(text(getString(R.string.pending_admin_remove), 14f, true))
        row.addView(note(getString(R.string.pending_in, fmtMin(s.adminRemovalAtMs - now + 59_999))))
        row.addView(btn(getString(R.string.pending_cancel), false) { s.adminRemovalAtMs = 0L; s.cancelPending("-"); render2() })
        box.addView(row)
    }
    if (!any) return null
    return card(text(getString(R.string.pending_head), 16f, true), note(getString(R.string.pending_note)), box)
}

private fun BaseActivity.render2() { recreate() }

private fun BaseActivity.pendingRow(p: PendingChange, now: Long): View {
    val row = vbox()
    row.setPadding(0, dp(8), 0, 0)
    val names = p.keys.map { k -> keyName(this, k) }
    row.addView(text(names.joinToString("、"), 14f, true))
    row.addView(note(getString(R.string.pending_in, fmtMin(p.applyAtMs - now + 59_999))))
    row.addView(btn(getString(R.string.pending_cancel), false) { store.cancelPending(p.id); recreate() })
    return row
}

fun keyName(a: BaseActivity, key: String): String = when {
    key.startsWith("rule:") -> Apps.label(a, key.removePrefix("rule:"))
    key == "focusApps" -> a.getString(R.string.k_focus)
    key == "quiz" -> a.getString(R.string.k_quiz)
    key == "emergency" -> a.getString(R.string.k_emergency)
    key == "protectSettingsApp" -> a.getString(R.string.k_protect_settings)
    key == "protectSelf" -> a.getString(R.string.k_protect_self)
    key == "protectSystemPages" -> a.getString(R.string.k_protect_pages)
    key == "cooldown" -> a.getString(R.string.k_cooldown)
    key == "zone" -> a.getString(R.string.k_zone)
    key == "commitment" -> a.getString(R.string.k_commitment)
    else -> key
}
