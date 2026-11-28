package jp.himatsubushi.guard

import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.os.SystemClock
import jp.himatsubushi.guard.core.*
import java.time.ZoneId

/**
 * 見張りの本体。前面のアプリを知り、使った時間を数え、制限に当たったらロック画面を出す。
 * GuardService（常駐）と GuardAccessibilityService のどちらが生きていても動く。
 * 端末の時計ではなく、起動からの経過時間（elapsedRealtime）で時間を数える。
 */
class Engine(private val app: Context) {
    private val store: Store get() = (app as GuardApp).store
    private val reader = UsageReader(app)
    private val thread = HandlerThread("guard-engine").also { it.start() }
    private val handler = Handler(thread.looper)
    private val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager

    @Volatile private var started = false
    @Volatile var a11yConnected = false
    @Volatile private var a11yFg: String? = null
    @Volatile var health: Health = Health(0, emptyList(), false)
    private var prevFg: String? = null
    private var lastTickElapsed = 0L
    private var lastReconcile = 0L
    private var lastHealth = 0L
    private var lastBeatSave = 0L
    private var lastLaunch = 0L
    private var lastRestoreLaunch = 0L
    private var lastPageBlock = 0L
    private var lastDay = ""
    private var launchers: Set<String> = emptySet()
    private var launchersAt = 0L
    private var imePkgs: Set<String> = emptySet()
    private var lastNotifText = ""

    private val tickRunnable = Runnable { tick() }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_OFF -> post {
                    // 画面が消えているあいだは数えない。心拍の記録も止める（眠っている間を「止められた」と誤判定しない）
                    accountUntilNow()
                    prevFg = null; a11yFg = null; reader.resetForeground()
                    store.lastBeatElapsed = 0L
                    handler.removeCallbacks(tickRunnable)
                    store.saveState()
                }
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> post { lastTickElapsed = SystemClock.elapsedRealtime(); tick() }
                Intent.ACTION_TIME_CHANGED, Intent.ACTION_DATE_CHANGED -> post { store.observeClock() }
                Intent.ACTION_TIMEZONE_CHANGED -> post { checkZone() }
            }
        }
    }

    fun post(r: () -> Unit) { handler.post { try { r() } catch (e: Exception) { /* 見張りは止めない */ } } }

    /** 何度呼んでもよい。 */
    @Synchronized
    fun start() {
        if (started) { post { tick() }; return }
        started = true
        val f = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_TIME_CHANGED); addAction(Intent.ACTION_DATE_CHANGED); addAction(Intent.ACTION_TIMEZONE_CHANGED)
        }
        try { app.registerReceiver(receiver, f) } catch (e: Exception) { /* 登録できなくてもポーリングは動く */ }
        post {
            store.observeClock()
            val gap = HeartbeatCheck.killedGapMs(store.lastBeatElapsed, store.lastBeatBoot, SystemClock.elapsedRealtime(), store.bootId(), store.expectedStop)
            if (gap != null) store.addTamper(TamperType.SERVICE_KILLED, "${gap / 60_000}分")
            store.expectedStop = false
            lastTickElapsed = SystemClock.elapsedRealtime()
            tick()
        }
    }

    // ---------- アクセシビリティからの知らせ ----------
    fun onA11yForeground(pkg: String) {
        if (pkg in NeverBlock.fixed || pkg in imePackages()) return
        post {
            if (pkg == a11yFg) return@post
            accountUntilNow()
            a11yFg = pkg
            prevFg = pkg
            evaluate(pkg)
        }
    }

    fun onSettingsPage(pkg: String, title: String, contents: List<String>, goHome: () -> Unit) {
        post {
            val s = store.settings
            val now = store.now()
            if (!s.protectSystemPages || store.emergencyUntilMs > now) return@post
            if (!Enforcer.protectionActive(s, now)) return@post
            val page = PageMatcher.classify(title, contents, appLabels(), pkg) ?: return@post
            if (!health.ok && PageMatcher.allowedWhileRestoring(page)) return@post
            val el = SystemClock.elapsedRealtime()
            if (el - lastPageBlock > 20_000) { lastPageBlock = el; store.addTamper(TamperType.SETTINGS_PAGE_BLOCKED, page.name) }
            goHome()
            val until = if (s.commitmentActive(now)) s.commitmentUntilMs else null
            launchLock(app.packageName, BlockInfo(Reason.PROTECTED_SETTINGS, until, false, "page"))
        }
    }

    private fun appLabels(): List<String> = listOf("ひまつぶしガード", "Himatsubushi Guard", app.getString(R.string.app_name)).distinct()

    // ---------- 本体 ----------
    private fun interactive() = try { pm.isInteractive } catch (e: Exception) { true }

    private fun launcherSet(): Set<String> {
        val el = SystemClock.elapsedRealtime()
        if (launchers.isEmpty() || el - launchersAt > 600_000L) {
            launchersAt = el
            launchers = try {
                app.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
                    .mapNotNull { it.activityInfo?.packageName }.toSet()
            } catch (e: Exception) { emptySet() }
        }
        return launchers
    }

    private fun imePackages(): Set<String> {
        if (imePkgs.isEmpty()) imePkgs = try {
            (app.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                .inputMethodList.map { it.packageName }.toSet()
        } catch (e: Exception) { emptySet() }
        return imePkgs
    }

    private fun tracked(pkg: String?): Boolean {
        if (pkg == null) return false
        val s = store.settings
        return s.rules.any { it.pkg == pkg && it.enabled }
    }

    /** 直前の tick からいままでを、前面にいたアプリに数える。 */
    private fun accountUntilNow() {
        val el = SystemClock.elapsedRealtime()
        val delta = el - lastTickElapsed
        lastTickElapsed = el
        val p = prevFg
        if (p != null && delta in 1..30_000L && tracked(p)) store.addUsage(store.today(), p, delta)
    }

    fun tick() {
        handler.removeCallbacks(tickRunnable)
        try { doTick() } catch (e: Exception) { /* 何があっても次の tick を予約する */ }
        if (interactive()) handler.postDelayed(tickRunnable, nextDelay())
    }

    private fun nextDelay(): Long {
        val fg = if (a11yConnected) a11yFg else prevFg
        val s = store.settings
        val guarded = fg != null && (tracked(fg) || (store.focus?.apps?.contains(fg) == true) || fg in SettingsPackages.settings)
        return when {
            !health.ok -> 2_000L
            a11yConnected -> if (guarded) 5_000L else 15_000L
            guarded -> 1_500L
            s.rules.isEmpty() && store.focus == null -> 5_000L
            else -> 3_000L
        }
    }

    private fun doTick() {
        if (!interactive()) { prevFg = null; return }
        val el = SystemClock.elapsedRealtime()
        val now = store.observeClock()
        if (store.applyMatured()) { /* 設定が変わった */ }
        removeAdminIfDue(now)
        store.focus?.let { if (now >= it.endMs) store.stopFocus(false) }

        // 前面のアプリ
        val fg: String? = if (a11yConnected) a11yFg else reader.pollForeground(System.currentTimeMillis())
        accountUntilNow()
        prevFg = fg

        val day = store.today()
        if (day != lastDay) {
            lastDay = day
            val keep = Ledger.lastDays(now, store.zone(), 35).toSet()
            store.usage.prune(keep); store.bonus.prune(keep)
            store.passUntil.entries.removeAll { it.value < now }
            store.saveState()
        }

        if (el - lastReconcile > 60_000L) { lastReconcile = el; reconcile() }
        if (el - lastHealth > 10_000L) { lastHealth = el; checkHealth(el) }
        if (el - lastBeatSave > 60_000L) {
            lastBeatSave = el
            store.lastBeatElapsed = el; store.lastBeatBoot = store.bootId()
            store.saveState()
        } else { store.lastBeatElapsed = el; store.lastBeatBoot = store.bootId() }

        if (fg != null) evaluate(fg)
        refreshNotification(now)
    }

    /** 使用状況イベントから求めた値のほうが大きければ採用（サービスが止まっていた間の分を取り戻す）。 */
    private fun reconcile() {
        val cs = store.clock
        if (cs != null && Math.abs(cs.reportedDriftMs) > TrustedClock.TOLERANCE_MS) return
        val pkgs = store.settings.rules.filter { it.enabled }.map { it.pkg }.toSet()
        if (pkgs.isEmpty() || !health.let { it.bits and Perms.B_USAGE != 0 }) return
        val zone: ZoneId = store.zone()
        val wall = System.currentTimeMillis()
        val from = Schedule.dayStartMs(wall, zone)
        val totals = reader.dayTotals(from, wall, zone)
        val d = Schedule.dayKey(wall, zone)
        if (d != store.today()) return
        totals[d]?.forEach { (p, ms) -> if (p in pkgs) store.usage.mergeMax(d, p, ms) }
    }

    private fun checkHealth(el: Long) {
        val h = Health.compute(app, store)
        health = h
        if (store.setupDone) {
            val old = store.permBits
            val now = h.bits
            val lost = old and now.inv()
            if (lost and Perms.B_USAGE != 0) store.addTamper(TamperType.PERMISSION_REVOKED, "usage")
            if (lost and Perms.B_OVERLAY != 0) store.addTamper(TamperType.PERMISSION_REVOKED, "overlay")
            if (lost and Perms.B_NOTIF != 0) store.addTamper(TamperType.PERMISSION_REVOKED, "notification")
            if (lost and Perms.B_A11Y != 0) store.addTamper(TamperType.ACCESSIBILITY_OFF)
            if (lost and Perms.B_BATTERY != 0 && store.batteryOk == true) store.addTamper(TamperType.BATTERY_OPT_ON)
            if (lost and Perms.B_ADMIN != 0) store.addTamper(TamperType.ADMIN_DISABLED)
            var changed = old != now
            if (now and Perms.B_NOTIF != 0 && !store.notifEver) { store.notifEver = true; changed = true }
            if (now and Perms.B_A11Y != 0 && !store.a11yEver) { store.a11yEver = true; changed = true }
            if (now and Perms.B_BATTERY != 0 && store.batteryOk != true) { store.batteryOk = true; changed = true }
            store.permBits = now
            if (changed) store.saveState()
        }
        checkZone()
        WatchdogReceiver.schedule(app)
    }

    private fun checkZone() {
        val id = try { java.util.TimeZone.getDefault().id } catch (e: Exception) { return }
        if (store.lastSystemZone.isNotEmpty() && store.lastSystemZone != id) {
            store.addTamper(TamperType.TIMEZONE_CHANGED, "${store.lastSystemZone} → $id")
        }
        if (store.lastSystemZone != id) { store.lastSystemZone = id; store.saveState() }
    }

    private fun removeAdminIfDue(now: Long) {
        val at = store.adminRemovalAtMs
        if (at in 1..now) {
            store.adminRemovalAtMs = 0L
            if (!store.settings.commitmentActive(now)) {
                try {
                    (app.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager).removeActiveAdmin(Perms.adminComponent(app))
                } catch (e: Exception) { /* すでに外れている */ }
            }
            store.saveState()
        }
    }

    // ---------- 判定とロック ----------
    private val exemptFromRestore get() = SettingsPackages.settings + SettingsPackages.installers + NeverBlock.fixed

    private fun evaluate(pkg: String) {
        if (pkg == app.packageName) return
        val now = store.now()
        if (!health.ok) {
            if (pkg !in exemptFromRestore && pkg !in launcherSet()) launchRestore()
            return
        }
        val used = store.usedToday(pkg)
        val info = Enforcer.evaluate(EvalInput(
            pkg, store.settings, now, used, store.bonusToday(pkg), store.emergencyUntilMs, store.focus,
            app.packageName, launcherSet(), store.passUntilMs(pkg),
        )) ?: return
        launchLock(pkg, info)
    }

    private fun launchLock(pkg: String, info: BlockInfo) {
        val el = SystemClock.elapsedRealtime()
        if (LockActivity.visibleFor == pkg && LockActivity.visible) return
        if (el - lastLaunch < 1_200L) return
        lastLaunch = el
        val i = Intent(app, LockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            .putExtra(LockActivity.X_PKG, pkg).putExtra(LockActivity.X_REASON, info.reason.name)
            .putExtra(LockActivity.X_UNLOCK, info.unlockAtMs ?: 0L).putExtra(LockActivity.X_QUIZ, info.quizAllowed)
            .putExtra(LockActivity.X_LABEL, info.label)
        try { app.startActivity(i) } catch (e: Exception) { Notifier.lockFallback(app) }
    }

    private fun launchRestore() {
        val el = SystemClock.elapsedRealtime()
        if (RestoreActivity.visible || el - lastRestoreLaunch < 2_500L) return
        lastRestoreLaunch = el
        val i = Intent(app, RestoreActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION)
        try { app.startActivity(i) } catch (e: Exception) { Notifier.lockFallback(app) }
    }

    // ---------- 通知 ----------
    private fun refreshNotification(now: Long) {
        val text = Notifier.statusText(app, store, health, now)
        if (text != lastNotifText) { lastNotifText = text; GuardService.instance?.update() }
    }

    fun forceNotificationRefresh() { lastNotifText = ""; post { refreshNotification(store.now()) } }

    companion object {
        fun get(ctx: Context): Engine = (ctx.applicationContext as GuardApp).engine
    }
}
