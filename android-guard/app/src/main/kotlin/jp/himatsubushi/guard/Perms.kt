package jp.himatsubushi.guard

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/** 特別な権限の状態の確認と、設定画面への入口。どれも、足りなくても落ちない。 */
object Perms {
    const val B_USAGE = 1
    const val B_OVERLAY = 2
    const val B_NOTIF = 4
    const val B_A11Y = 8
    const val B_BATTERY = 16
    const val B_ADMIN = 32

    fun usage(ctx: Context): Boolean = try {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        mode == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) { false }

    fun overlay(ctx: Context): Boolean = try { Settings.canDrawOverlays(ctx) } catch (e: Exception) { false }

    fun notifications(ctx: Context): Boolean = try { NotificationManagerCompat.from(ctx).areNotificationsEnabled() } catch (e: Exception) { false }

    fun a11yComponent(ctx: Context) = ComponentName(ctx, GuardAccessibilityService::class.java)

    fun a11y(ctx: Context): Boolean = try {
        val enabled = Settings.Secure.getInt(ctx.contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1
        val list = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        val c = a11yComponent(ctx)
        enabled && list.split(':').any { it.equals(c.flattenToString(), true) || it.equals(c.flattenToShortString(), true) }
    } catch (e: Exception) { false }

    fun battery(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    } catch (e: Exception) { false }

    fun adminComponent(ctx: Context) = ComponentName(ctx, GuardAdminReceiver::class.java)

    fun admin(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager).isAdminActive(adminComponent(ctx))
    } catch (e: Exception) { false }

    fun bits(ctx: Context): Int =
        (if (usage(ctx)) B_USAGE else 0) or (if (overlay(ctx)) B_OVERLAY else 0) or (if (notifications(ctx)) B_NOTIF else 0) or
            (if (a11y(ctx)) B_A11Y else 0) or (if (battery(ctx)) B_BATTERY else 0) or (if (admin(ctx)) B_ADMIN else 0)

    // ---- 設定画面の入口（どれも、なければ一つ手前の画面へ） ----
    private fun pkgUri(ctx: Context) = Uri.parse("package:${ctx.packageName}")

    fun usageIntent(ctx: Context) = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkgUri(ctx))
    fun usageIntentFallback() = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    fun overlayIntent(ctx: Context) = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri(ctx))
    fun a11yIntent() = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    fun notifIntent(ctx: Context) = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
    fun batteryIntent(ctx: Context) = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri(ctx))
    fun batteryListIntent() = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
    fun appDetailsIntent(ctx: Context) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri(ctx))
    fun adminIntent(ctx: Context) = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent(ctx))
        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, ctx.getString(R.string.admin_explanation))

    /** 開けなければ代わりの画面を、それでも開けなければ false。 */
    fun open(ctx: Context, vararg intents: Intent): Boolean {
        for (i in intents) {
            try {
                if (ctx !is android.app.Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(i); return true
            } catch (e: Exception) { /* 次へ */ }
        }
        return false
    }
}

/** 見張りに必要な権限のうち、外れているもの。 */
data class Health(val bits: Int, val missing: List<Int>, val batteryLost: Boolean) {
    val ok get() = missing.isEmpty()

    companion object {
        fun compute(ctx: Context, store: Store): Health {
            val b = Perms.bits(ctx)
            val miss = ArrayList<Int>()
            if (store.setupDone) {
                if (b and Perms.B_USAGE == 0) miss.add(Perms.B_USAGE)
                if (b and Perms.B_OVERLAY == 0) miss.add(Perms.B_OVERLAY)
                if (store.notifEver && b and Perms.B_NOTIF == 0) miss.add(Perms.B_NOTIF)
                if (store.a11yEver && b and Perms.B_A11Y == 0) miss.add(Perms.B_A11Y)
            }
            return Health(b, miss, store.batteryOk == true && b and Perms.B_BATTERY == 0)
        }
    }
}
