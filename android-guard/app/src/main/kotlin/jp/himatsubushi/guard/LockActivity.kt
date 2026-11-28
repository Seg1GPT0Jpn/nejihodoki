package jp.himatsubushi.guard

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import jp.himatsubushi.guard.core.*
import kotlin.random.Random

/** 制限に当たったときに、ほかのアプリの上に全画面で出る画面。解除までのカウントダウン・クイズ・緊急解除。 */
class LockActivity : BaseActivity() {
    companion object {
        const val X_PKG = "pkg"; const val X_REASON = "reason"; const val X_UNLOCK = "unlock"; const val X_QUIZ = "quiz"; const val X_LABEL = "label"
        @Volatile var visible = false
        @Volatile var visibleFor: String? = null
    }

    override val titleRes = R.string.lock_title
    override val showUp = false
    override val needsGate = false

    private enum class Mode { INFO, QUIZ, RESULT }
    private var mode = Mode.INFO
    private var pkg = ""
    private var reason = Reason.DAILY_LIMIT
    private var unlockAt = 0L
    private var quizAllowed = false
    private var wlabel = ""
    private val ui = Handler(Looper.getMainLooper())
    private var countdown: TextView? = null
    private var presented: List<Presented> = emptyList()
    private var qIndex = 0
    private var correct = 0
    private var answered = false
    private var resultText = ""
    private var resultEarned = 0

    private val tick = object : Runnable {
        override fun run() {
            if (!stillBlocked()) { finish(); return }
            updateCountdown()
            ui.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        readIntent(intent)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (mode == Mode.INFO) goHome() else { mode = Mode.INFO; render() } }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent); readIntent(intent); mode = Mode.INFO; render()
    }

    private fun readIntent(i: Intent) {
        pkg = i.getStringExtra(X_PKG) ?: ""
        reason = try { Reason.valueOf(i.getStringExtra(X_REASON) ?: "") } catch (e: Exception) { Reason.DAILY_LIMIT }
        unlockAt = i.getLongExtra(X_UNLOCK, 0L)
        quizAllowed = i.getBooleanExtra(X_QUIZ, false)
        wlabel = i.getStringExtra(X_LABEL) ?: ""
        visibleFor = pkg
    }

    override fun onStart() { super.onStart(); visible = true; visibleFor = pkg }
    override fun onStop() { visible = false; ui.removeCallbacks(tick); super.onStop() }

    override fun onResume() {
        super.onResume()
        ui.removeCallbacks(tick); ui.postDelayed(tick, 1000)
    }


    private fun goHome() {
        startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    /** まだブロックされているか（待ち時間の反映・緊急解除・クイズ合格で解けたら閉じる）。 */
    private fun stillBlocked(): Boolean {
        val now = store.now()
        if (store.emergencyUntilMs > now) return false
        if (reason == Reason.PROTECTED_SETTINGS && wlabel == "page") return Enforcer.protectionActive(store.settings, now) && (unlockAt == 0L || now < unlockAt)
        if (unlockAt in 1..now) return false
        if (pkg.isEmpty()) return false
        val launchers = emptySet<String>()
        return Enforcer.evaluate(EvalInput(pkg, store.settings, now, store.usedToday(pkg), store.bonusToday(pkg),
            store.emergencyUntilMs, store.focus, packageName, launchers, store.passUntilMs(pkg))) != null
    }

    private fun updateCountdown() {
        val t = countdown ?: return
        val now = store.now()
        t.text = if (unlockAt > 0) getString(R.string.lock_countdown, hms(unlockAt - now)) else getString(R.string.lock_no_time)
    }

    private fun hms(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        return "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
    }

    override fun render() {
        when (mode) {
            Mode.INFO -> renderInfo()
            Mode.QUIZ -> renderQuiz()
            Mode.RESULT -> renderResult()
        }
    }

    private fun reasonText(): String = when (reason) {
        Reason.DAILY_LIMIT -> getString(R.string.lock_reason_limit)
        Reason.WINDOW -> getString(R.string.lock_reason_window, if (wlabel.isNotBlank()) wlabel else getString(R.string.lock_window_default))
        Reason.FOCUS -> getString(R.string.lock_reason_focus)
        Reason.PROTECTED_SETTINGS -> getString(if (wlabel == "page") R.string.lock_reason_page else R.string.lock_reason_settings)
    }

    private fun renderInfo() = rebuild {
        gravity = android.view.Gravity.CENTER_HORIZONTAL
        if (pkg.isNotEmpty() && pkg != packageName) {
            addView(ImageView(this@LockActivity).apply { setImageDrawable(Apps.icon(this@LockActivity, pkg)); layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)).also { it.topMargin = dp(24) ; it.gravity = android.view.Gravity.CENTER_HORIZONTAL } })
            addView(text(Apps.label(this@LockActivity, pkg), 20f, true).also { it.gravity = android.view.Gravity.CENTER; it.setPadding(0, dp(8), 0, 0) })
        }
        addView(text(reasonText(), 22f, true).also { it.gravity = android.view.Gravity.CENTER; it.setPadding(0, dp(16), 0, dp(8)) })
        val c = text("", 30f, true, com.google.android.material.R.attr.colorPrimary).also { it.gravity = android.view.Gravity.CENTER; it.setPadding(0, dp(8), 0, dp(16)); it.contentDescription = getString(R.string.lock_countdown_desc) }
        countdown = c; addView(c); updateCountdown()
        addView(btn(getString(R.string.lock_home)) { goHome() }, lp(top = 8, ctx = this@LockActivity))

        if (quizAllowed) {
            val wait = store.quizCooldownUntilMs - store.now()
            if (wait > 0) addView(note(getString(R.string.lock_quiz_wait, (wait + 999) / 1000)).also { it.gravity = android.view.Gravity.CENTER; it.setPadding(0, dp(12), 0, 0) })
            else addView(btn(getString(R.string.lock_quiz, store.settings.quiz.count, store.settings.quiz.rewardMin), false) { startQuiz() }, lp(top = 12, ctx = this@LockActivity))
        }
        addView(btn(getString(R.string.lock_emergency, EmergencyLimiter.UNLOCK_MIN), false) { emergency() }, lp(top = 12, ctx = this@LockActivity))
        addView(note(getString(R.string.lock_footer)).also { it.gravity = android.view.Gravity.CENTER; it.setPadding(0, dp(20), 0, 0) })
    }

    // ---------- クイズ ----------
    private fun startQuiz() {
        val cfg = store.settings.quiz
        val rng = Random(System.nanoTime())
        val pool = QuestionBank.all(this)
        val qs = QuizSelector.select(pool, cfg, cfg.count, rng, store.recentQuizIds.toSet())
        if (qs.isEmpty()) { toast(getString(R.string.quiz_none)); return }
        presented = qs.map { QuizSelector.present(it, rng) }
        store.rememberQuiz(qs.map { it.id })
        qIndex = 0; correct = 0; answered = false; mode = Mode.QUIZ; render()
    }

    private fun renderQuiz() = rebuild {
        val p = presented[qIndex]
        addView(note(getString(R.string.quiz_progress, qIndex + 1, presented.size)))
        addView(text(p.question.text, 24f, true).also { it.setPadding(0, dp(12), 0, dp(16)) })
        val ch = p.choices
        if (ch != null) {
            ch.forEachIndexed { i, c ->
                val b = btn(c, false) { answerChoice(i) }
                b.minHeight = dp(56); b.textSize = 18f
                if (answered) {
                    b.isEnabled = false
                    if (i == p.correctIndex) b.setBackgroundColor(getColor(R.color.ok)).also { b.setTextColor(0xFFFFFFFF.toInt()) }
                }
                addView(b, lp(top = 8, ctx = this@LockActivity))
            }
        } else {
            val et = EditText(this@LockActivity).apply { hint = getString(R.string.quiz_type_hint); inputType = InputType.TYPE_CLASS_TEXT; setSingleLine(); minimumHeight = dp(56); textSize = 18f; isEnabled = !answered }
            addView(et, lp())
            if (!answered) addView(btn(getString(R.string.quiz_submit)) { answerTyped(et.text.toString()) }, lp(top = 8, ctx = this@LockActivity))
        }
        if (answered) {
            val ok = lastCorrect
            addView(text(getString(if (ok) R.string.quiz_right else R.string.quiz_wrong, p.question.answer), 18f, true)
                .also { it.setTextColor(getColor(if (ok) R.color.ok else R.color.bad)); it.setPadding(0, dp(12), 0, 0) })
            addView(btn(getString(if (qIndex + 1 < presented.size) R.string.quiz_next else R.string.quiz_finish)) { next() }, lp(top = 12, ctx = this@LockActivity))
        }
        addView(btn(getString(R.string.quiz_quit), false) { mode = Mode.INFO; render() }, lp(top = 16, ctx = this@LockActivity))
    }

    private var lastCorrect = false

    private fun answerChoice(i: Int) {
        if (answered) return
        lastCorrect = i == presented[qIndex].correctIndex
        if (lastCorrect) correct++
        answered = true; render()
    }

    private fun answerTyped(s: String) {
        if (answered) return
        lastCorrect = AnswerCheck.isCorrect(presented[qIndex].question, s)
        if (lastCorrect) correct++
        answered = true; render()
    }

    private fun next() {
        if (qIndex + 1 < presented.size) { qIndex++; answered = false; render() } else finishQuiz()
    }

    private fun finishQuiz() {
        val cfg = store.settings.quiz
        val r = Reward.compute(cfg, presented.size, correct)
        val now = store.now()
        val forWindow = reason == Reason.WINDOW
        val already = if (forWindow) 0 else (store.bonusToday(pkg) / 60_000L).toInt()
        val earned = if (r.earnedMin > 0) Reward.capByDay(cfg, already, r.earnedMin) else 0
        if (earned > 0) store.grantBonus(pkg, earned, forWindow)
        if (r.cooldownSec > 0) { store.quizCooldownUntilMs = now + r.cooldownSec * 1000L; store.saveState() }
        resultEarned = earned
        resultText = when {
            earned > 0 -> getString(R.string.quiz_result_earned, correct, presented.size, earned)
            r.passed -> getString(R.string.quiz_result_capped, correct, presented.size)
            else -> getString(R.string.quiz_result_failed, correct, presented.size)
        } + if (r.cooldownSec > 0) "\n" + getString(R.string.quiz_result_cooldown, r.cooldownSec) else ""
        mode = Mode.RESULT; render()
    }

    private fun renderResult() = rebuild {
        addView(text(resultText, 20f, true).also { it.setPadding(0, dp(24), 0, dp(16)) })
        addView(btn(getString(if (resultEarned > 0) R.string.quiz_use_time else R.string.quiz_back)) {
            if (resultEarned > 0) finish() else { mode = Mode.INFO; render() }
        })
    }

    // ---------- 緊急解除 ----------
    private fun emergency() {
        val chk = store.emergencyCheck()
        if (chk.verdict != EmergencyLimiter.Verdict.OK) {
            val whenText = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(chk.nextAllowedMs - store.now() + System.currentTimeMillis()))
            info(R.string.lock_emergency_title, getString(if (chk.verdict == EmergencyLimiter.Verdict.DAILY_MAX) R.string.lock_emergency_max else R.string.lock_emergency_soon, whenText))
            return
        }
        PinUi.ask(this, store, R.string.lock_emergency_title, null) { askReason() }
    }

    private fun askReason() {
        val et = EditText(this).apply { hint = getString(R.string.lock_reason_hint); minLines = 2; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE }
        val d = AlertDialog.Builder(this).setTitle(R.string.lock_emergency_title).setMessage(getString(R.string.lock_emergency_msg, EmergencyLimiter.UNLOCK_MIN))
            .setView(PinUi.wrap(this, et)).setPositiveButton(android.R.string.ok, null).setNegativeButton(android.R.string.cancel, null).create()
        d.setOnShowListener {
            d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val r = et.text.toString().trim()
                if (r.length < 2) { et.error = getString(R.string.lock_reason_need); return@setOnClickListener }
                val chk = store.emergencyCheck()
                if (chk.verdict != EmergencyLimiter.Verdict.OK) { d.dismiss(); return@setOnClickListener }
                store.startEmergency(pkg.ifEmpty { "-" }, r)
                d.dismiss()
                Engine.get(this).forceNotificationRefresh()
                toast(getString(R.string.lock_emergency_started, EmergencyLimiter.UNLOCK_MIN))
                finish()
            }
        }
        d.show()
    }
}
