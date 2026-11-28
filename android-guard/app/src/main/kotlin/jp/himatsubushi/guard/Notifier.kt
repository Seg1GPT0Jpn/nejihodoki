package jp.himatsubushi.guard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import jp.himatsubushi.guard.core.Enforcer

object Notifier {
    const val CH_STATUS = "guard_status"
    const val CH_ALERT = "guard_alert"
    const val ID_STATUS = 1
    const val ID_ALERT = 2

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CH_STATUS, ctx.getString(R.string.ch_status), NotificationManager.IMPORTANCE_LOW).apply {
            description = ctx.getString(R.string.ch_status_desc); setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(CH_ALERT, ctx.getString(R.string.ch_alert), NotificationManager.IMPORTANCE_HIGH).apply {
            description = ctx.getString(R.string.ch_alert_desc)
        })
    }

    fun statusText(ctx: Context, store: Store, health: Health, now: Long): String {
        val f = store.focus
        return when {
            !health.ok -> ctx.getString(R.string.notif_restore)
            f != null && f.active(now) -> ctx.getString(R.string.notif_focus, ((f.endMs - now + 59_999) / 60_000L).toInt())
            store.emergencyUntilMs > now -> ctx.getString(R.string.notif_emergency)
            store.pendings.isNotEmpty() -> ctx.getString(R.string.notif_pending, store.pendings.size)
            store.settings.commitmentActive(now) -> ctx.getString(R.string.notif_commitment,
                ((store.settings.commitmentUntilMs - now + 86_399_999L) / 86_400_000L).toInt())
            else -> ctx.getString(R.string.notif_ok)
        }
    }

    fun buildStatus(ctx: Context): Notification {
        val app = ctx.applicationContext as GuardApp
        val store = app.store
        val now = store.now()
        val text = statusText(ctx, store, app.engine.health, now)
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = NotificationCompat.Builder(ctx, CH_STATUS)
            .setSmallIcon(R.drawable.ic_stat_guard)
            .setContentTitle(ctx.getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        val f = store.focus
        if (f != null && f.active(now)) {
            b.setUsesChronometer(true).setChronometerCountDown(true).setWhen(System.currentTimeMillis() + (f.endMs - now)).setShowWhen(true)
        } else b.setShowWhen(false)
        return b.build()
    }

    /** ロック画面を出せなかったとき（アプリが背面から画面を出せない端末など）の代わりの知らせ。 */
    fun lockFallback(ctx: Context) {
        try {
            val open = PendingIntent.getActivity(ctx, 1, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(ctx, CH_ALERT)
                .setSmallIcon(R.drawable.ic_stat_guard)
                .setContentTitle(ctx.getString(R.string.notif_blocked_title))
                .setContentText(ctx.getString(R.string.notif_blocked_text))
                .setContentIntent(open).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).build()
            if (Perms.notifications(ctx)) NotificationManagerCompat.from(ctx).notify(ID_ALERT, n)
        } catch (e: SecurityException) { /* 通知が許可されていない */ }
    }

    fun serviceDown(ctx: Context) {
        try {
            val open = PendingIntent.getActivity(ctx, 2, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(ctx, CH_ALERT)
                .setSmallIcon(R.drawable.ic_stat_guard)
                .setContentTitle(ctx.getString(R.string.notif_down_title))
                .setContentText(ctx.getString(R.string.notif_down_text))
                .setContentIntent(open).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).build()
            if (Perms.notifications(ctx)) NotificationManagerCompat.from(ctx).notify(ID_ALERT + 1, n)
        } catch (e: SecurityException) { }
    }
}
