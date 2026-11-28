package jp.himatsubushi.guard

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.color.MaterialColors
import com.google.android.material.materialswitch.MaterialSwitch
import jp.himatsubushi.guard.core.Enforcer

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

fun Context.attrColor(attr: Int, fallback: Int = Color.GRAY): Int = MaterialColors.getColor(this, attr, fallback)

fun Context.vbox(pad: Int = 0): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    if (pad > 0) setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
}

fun Context.hbox(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
}

fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0, ctx: Context? = null): LinearLayout.LayoutParams =
    LinearLayout.LayoutParams(w, h).also { if (ctx != null && top > 0) it.topMargin = ctx.dp(top) }

fun Context.text(s: CharSequence, sizeSp: Float = 15f, bold: Boolean = false, colorAttr: Int = com.google.android.material.R.attr.colorOnSurface): TextView =
    TextView(this).apply {
        text = s; setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(attrColor(colorAttr))
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setLineSpacing(0f, 1.15f)
    }

fun Context.heading(s: CharSequence) = text(s, 18f, true).also { it.setPadding(0, dp(18), 0, dp(6)); ViewCompat.setAccessibilityHeading(it, true) }

fun Context.note(s: CharSequence) = text(s, 13f, false, com.google.android.material.R.attr.colorOnSurfaceVariant)

fun Context.btn(s: CharSequence, filled: Boolean = true, onClick: () -> Unit): MaterialButton =
    MaterialButton(this, null, if (filled) com.google.android.material.R.attr.materialButtonStyle else com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
        text = s; isAllCaps = false; minHeight = dp(48); minimumHeight = dp(48)
        setOnClickListener { onClick() }
    }

fun Context.card(vararg views: View): MaterialCardView = MaterialCardView(this).apply {
    radius = dp(16).toFloat(); cardElevation = 0f
    strokeWidth = dp(1); strokeColor = attrColor(com.google.android.material.R.attr.colorOutlineVariant)
    setCardBackgroundColor(attrColor(com.google.android.material.R.attr.colorSurfaceContainerLow, attrColor(com.google.android.material.R.attr.colorSurface)))
    val box = vbox(14)
    for (v in views) box.addView(v)
    addView(box)
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).also { it.topMargin = dp(10) }
}

fun Context.switchRow(label: CharSequence, checked: Boolean, onChange: (Boolean) -> Unit): View {
    val row = hbox()
    val t = text(label, 15f).also { it.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) }
    val sw = MaterialSwitch(this).apply { isChecked = checked; minimumHeight = dp(48); setOnCheckedChangeListener { _, c -> onChange(c) } }
    row.addView(t); row.addView(sw)
    row.minimumHeight = dp(48)
    return row
}

fun Context.progress(value: Int, max: Int, over: Boolean = false): ProgressBar =
    ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
        this.max = max.coerceAtLeast(1); progress = value.coerceIn(0, this.max)
        progressTintList = android.content.res.ColorStateList.valueOf(if (over) getColor(R.color.bad) else attrColor(com.google.android.material.R.attr.colorPrimary))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8)).also { it.topMargin = dp(6) }
    }

fun Context.toast(s: CharSequence) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

fun Context.fmtMin(ms: Long): String {
    val m = (ms / 60_000L).toInt().coerceAtLeast(0)
    return if (m >= 60) getString(R.string.fmt_hm, m / 60, m % 60) else getString(R.string.fmt_m, m)
}

fun Context.fmtClock(min: Int): String = "%d:%02d".format(min / 60, min % 60)

fun Context.dayNames(): List<String> = listOf(R.string.d_mon, R.string.d_tue, R.string.d_wed, R.string.d_thu, R.string.d_fri, R.string.d_sat, R.string.d_sun).map { getString(it) }

/** 全画面共通のつくり：ツールバー + スクロールする本文。毎回 render() で組み立て直す。 */
abstract class BaseActivity : AppCompatActivity() {
    protected lateinit var content: LinearLayout
    protected lateinit var toolbar: MaterialToolbar
    val app get() = application as GuardApp
    val store get() = app.store
    protected open val titleRes: Int = R.string.app_name
    protected open val showUp: Boolean = true
    protected open val needsGate: Boolean = true
    /** 入るときに PIN を求める画面（設定など） */
    protected open val pinForEntry: Boolean = false
    private var gateShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(attrColor(com.google.android.material.R.attr.colorSurface)) }
        toolbar = MaterialToolbar(this).apply {
            title = getString(titleRes)
            setTitleTextColor(attrColor(com.google.android.material.R.attr.colorOnSurface))
            if (showUp) { setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material); navigationContentDescription = getString(R.string.back); setNavigationOnClickListener { finish() } }
        }
        val scroll = ScrollView(this).apply { isFillViewport = true }
        content = vbox(16)
        scroll.addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(toolbar, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(b.left, b.top, b.right, b.bottom); insets
        }
    }

    override fun onResume() {
        super.onResume()
        if (needsGate && !gateShown && (selfProtected() || (pinForEntry && store.hasPin())) && !PinUi.recentlyOk()) {
            gateShown = true
            PinUi.require(this, R.string.pin_gate_title, onCancel = { finish() }) { gateShown = false; render() }
            return
        }
        if (!gateShown) render()
    }

    /** ブロック時間帯・コミットメントの最中で、「このアプリも守る」が ON のとき。 */
    private fun selfProtected(): Boolean {
        val s = store.settings
        return s.protectSelf && store.hasPin() && Enforcer.protectionActive(s, store.now())
    }

    protected fun rebuild(block: LinearLayout.() -> Unit) {
        content.removeAllViews()
        content.block()
    }

    protected abstract fun render()

    fun confirm(title: Int, msg: CharSequence, okText: Int = android.R.string.ok, onOk: () -> Unit) {
        AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton(okText) { _, _ -> onOk() }
            .setNegativeButton(android.R.string.cancel, null).show()
    }

    fun info(title: Int, msg: CharSequence) {
        AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton(android.R.string.ok, null).show()
    }

    fun describeOutcome(o: Store.SubmitOutcome) {
        val sb = StringBuilder()
        if (o.pending.isNotEmpty()) sb.append(getString(R.string.out_pending, store.settings.cooldownMin)).append('\n')
        if (o.rejected.isNotEmpty()) sb.append(getString(R.string.out_rejected)).append('\n')
        if (sb.isNotEmpty()) info(R.string.out_title, sb.toString().trim())
        else toast(getString(R.string.saved))
    }
}

/** PIN の入力（4〜8 けた）。PIN が決まっていなければ、そのまま通す。 */
object PinUi {
    private var okUntil = 0L

    fun recentlyOk(): Boolean = android.os.SystemClock.elapsedRealtime() < okUntil

    fun markOk() { okUntil = android.os.SystemClock.elapsedRealtime() + 3 * 60_000L }

    fun require(act: BaseActivity, titleRes: Int, onCancel: (() -> Unit)? = null, onOk: () -> Unit) {
        ask(act, act.store, titleRes, onCancel, onOk)
    }

    fun ask(ctx: Context, store: Store, titleRes: Int, onCancel: (() -> Unit)?, onOk: () -> Unit) {
        if (!store.hasPin()) { onOk(); return }
        val lock = store.pinLockoutMs()
        if (lock > 0) {
            AlertDialog.Builder(ctx).setTitle(titleRes).setMessage(ctx.getString(R.string.pin_wait, (lock + 999) / 1000))
                .setPositiveButton(android.R.string.ok) { _, _ -> onCancel?.invoke() }.setOnCancelListener { onCancel?.invoke() }.show()
            return
        }
        val et = pinField(ctx)
        val d = AlertDialog.Builder(ctx).setTitle(titleRes).setMessage(R.string.pin_enter).setView(wrap(ctx, et))
            .setPositiveButton(android.R.string.ok, null)
            .setNegativeButton(android.R.string.cancel) { _, _ -> onCancel?.invoke() }
            .setOnCancelListener { onCancel?.invoke() }.create()
        d.setOnShowListener {
            d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (store.checkPin(et.text.toString())) { markOk(); d.dismiss(); onOk() }
                else { et.error = ctx.getString(if (store.pinLockoutMs() > 0) R.string.pin_locked else R.string.pin_wrong); et.setText("") }
            }
        }
        d.show()
    }

    fun pinField(ctx: Context) = EditText(ctx).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        hint = ctx.getString(R.string.pin_hint); filters = arrayOf(android.text.InputFilter.LengthFilter(8))
        minimumHeight = ctx.dp(48)
    }

    fun wrap(ctx: Context, v: View): View = LinearLayout(ctx).apply { setPadding(ctx.dp(24), ctx.dp(8), ctx.dp(24), 0); addView(v, lp()) }
}

fun Activity.openOrToast(vararg intents: Intent) {
    if (!Perms.open(this, *intents)) Toast.makeText(this, R.string.cannot_open, Toast.LENGTH_LONG).show()
}

/** 起動できるアプリの一覧（自分と、絶対にブロックしないものは除く）。 */
object Apps {
    data class Entry(val pkg: String, val label: String)
    private var cache: List<Entry>? = null

    fun list(ctx: Context, refresh: Boolean = false): List<Entry> {
        if (!refresh) cache?.let { return it }
        val pm = ctx.packageManager
        val launchers = try {
            pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0).mapNotNull { it.activityInfo?.packageName }.toSet()
        } catch (e: Exception) { emptySet() }
        val out = try {
            pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
                .mapNotNull { ri ->
                    val p = ri.activityInfo?.packageName ?: return@mapNotNull null
                    if (jp.himatsubushi.guard.core.NeverBlock.isNever(p, ctx.packageName, launchers)) null
                    else Entry(p, ri.loadLabel(pm)?.toString() ?: p)
                }.distinctBy { it.pkg }.sortedBy { it.label.lowercase() }
        } catch (e: Exception) { emptyList() }
        cache = out
        return out
    }

    fun label(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationInfo(pkg, 0).loadLabel(pm).toString()
    } catch (e: Exception) { pkg }

    fun icon(ctx: Context, pkg: String): Drawable? = try { ctx.packageManager.getApplicationIcon(pkg) } catch (e: Exception) { null }
}
