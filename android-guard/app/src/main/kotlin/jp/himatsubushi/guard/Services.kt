package jp.himatsubushi.guard

import android.accessibilityservice.AccessibilityService
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.app.admin.DeviceAdminReceiver
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.content.ContextCompat
import jp.himatsubushi.guard.core.NeverBlock
import jp.himatsubushi.guard.core.SettingsPackages
import jp.himatsubushi.guard.core.TamperType

/** 常駐（フォアグラウンド）サービス。通知を出しつづけ、見張り本体（Engine）を動かす。 */
class GuardService : Service() {
    companion object {
        @Volatile var instance: GuardService? = null

        /** 起動する。バックグラウンドから起動できない端末では、false を返して通知で知らせる。 */
        fun ensureRunning(ctx: Context): Boolean {
            if (instance != null) { Engine.get(ctx).start(); return true }
            return try {
                ContextCompat.startForegroundService(ctx, Intent(ctx, GuardService::class.java)); true
            } catch (e: Exception) {
                try { Engine.get(ctx).start() } catch (e2: Exception) { }
                Notifier.serviceDown(ctx); false
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Notifier.ensureChannels(this)
        try {
            val n = Notifier.buildStatus(this)
            if (Build.VERSION.SDK_INT >= 34) startForeground(Notifier.ID_STATUS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            else startForeground(Notifier.ID_STATUS, n)
        } catch (e: Exception) { /* 通知が出せなくても見張りは続ける */ }
        Engine.get(this).start()
        WatchdogReceiver.schedule(this)
        WatchdogJobService.schedule(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Engine.get(this).start()
        return START_STICKY
    }

    fun update() {
        try {
            (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(Notifier.ID_STATUS, Notifier.buildStatus(this))
        } catch (e: Exception) { }
    }

    override fun onTaskRemoved(rootIntent: Intent?) { WatchdogReceiver.scheduleSoon(this); super.onTaskRemoved(rootIntent) }

    override fun onDestroy() {
        instance = null
        WatchdogReceiver.scheduleSoon(this)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

/** 画面の切り替わりをすぐに知るためのサービス（任意）。設定ページの保護にも使う。 */
class GuardAccessibilityService : AccessibilityService() {
    private val main = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        val e = Engine.get(this)
        e.a11yConnected = true
        e.start()
        GuardService.ensureRunning(this)
        e.forceNotificationRefresh()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        val eng = Engine.get(this)
        eng.onA11yForeground(pkg)
        val app = application as GuardApp
        if ((pkg in SettingsPackages.settings || pkg in SettingsPackages.installers) && app.store.settings.protectSystemPages) {
            val title = event.text.joinToString(" ") { it?.toString().orEmpty() }
            checkPage(pkg, title)
            main.postDelayed({ checkPage(pkg, title) }, 450)
        }
    }

    private fun checkPage(pkg: String, eventTitle: String) {
        val root = try { rootInActiveWindow } catch (e: Exception) { null }
        val texts = ArrayList<String>()
        var title = eventTitle
        if (root != null && root.packageName?.toString() == pkg) {
            collect(root, texts, 0)
            if (title.isBlank()) title = texts.firstOrNull().orEmpty()
        }
        Engine.get(this).onSettingsPage(pkg, title, texts) { performGlobalAction(GLOBAL_ACTION_HOME) }
    }

    private fun collect(n: AccessibilityNodeInfo, out: MutableList<String>, depth: Int) {
        if (out.size > 150 || depth > 25) return
        n.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it) }
        n.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it) }
        for (i in 0 until n.childCount) {
            val c = try { n.getChild(i) } catch (e: Exception) { null } ?: continue
            collect(c, out, depth + 1)
        }
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        Engine.get(this).a11yConnected = false
        Engine.get(this).forceNotificationRefresh()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        Engine.get(this).a11yConnected = false
        super.onDestroy()
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as GuardApp
        if (!app.store.setupDone) return
        GuardService.ensureRunning(context)
        WatchdogReceiver.schedule(context)
        WatchdogJobService.schedule(context)
    }
}

/** 5 分ごとの見回り（AlarmManager、正確でないアラーム＝特別な権限なし）。サービスが止まっていたら起こす。 */
class WatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as GuardApp
        if (!app.store.setupDone) return
        GuardService.ensureRunning(context)
        schedule(context)
    }

    companion object {
        private fun pi(ctx: Context) = PendingIntent.getBroadcast(ctx, 7, Intent(ctx, WatchdogReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        fun schedule(ctx: Context, afterMs: Long = 5 * 60_000L) {
            try {
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + afterMs, pi(ctx))
            } catch (e: Exception) { }
        }

        fun scheduleSoon(ctx: Context) = schedule(ctx, 5_000L)
    }
}

class WatchdogJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        val app = application as GuardApp
        if (app.store.setupDone) GuardService.ensureRunning(this)
        return false
    }

    override fun onStopJob(params: JobParameters?): Boolean = true

    companion object {
        fun schedule(ctx: Context) {
            try {
                val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
                if (js.getPendingJob(77) != null) return
                js.schedule(JobInfo.Builder(77, ComponentName(ctx, WatchdogJobService::class.java))
                    .setPeriodic(15 * 60_000L).setPersisted(true).build())
            } catch (e: Exception) { }
        }
    }
}

/** 端末管理者（アンインストールしにくくするためだけ。端末の操作を制限する権限は要求しない）。 */
class GuardAdminReceiver : DeviceAdminReceiver() {
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence =
        context.getString(R.string.admin_disable_warning)

    override fun onDisabled(context: Context, intent: Intent) {
        try { (context.applicationContext as GuardApp).store.addTamper(TamperType.ADMIN_DISABLED, "") } catch (e: Exception) { }
    }
}
