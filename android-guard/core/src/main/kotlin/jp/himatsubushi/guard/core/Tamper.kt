package jp.himatsubushi.guard.core

import java.time.ZoneId

enum class TamperType {
    PERMISSION_REVOKED, ACCESSIBILITY_OFF, BATTERY_OPT_ON, SERVICE_KILLED, CLOCK_ROLLBACK, CLOCK_FORWARD,
    TIMEZONE_CHANGED, SETTINGS_PAGE_BLOCKED, ADMIN_DISABLED, FOCUS_STOPPED_EARLY, PIN_FAILED,
    COOLDOWN_STARTED, COOLDOWN_CANCELED, COOLDOWN_APPLIED, COMMITMENT_STARTED, CLOCK_RESYNC, UNINSTALL_ATTEMPT, LOOSEN_REJECTED;

    /** 「持ち主の都合による正常な操作」ではなく、すり抜けの疑いがある出来事か。 */
    val isTamper: Boolean
        get() = when (this) {
            COOLDOWN_STARTED, COOLDOWN_CANCELED, COOLDOWN_APPLIED, COMMITMENT_STARTED, CLOCK_RESYNC, LOOSEN_REJECTED -> false
            else -> true
        }
}

data class TamperEvent(val atMs: Long, val type: TamperType, val detail: String = "")

data class HonestyReport(
    val fromMs: Long,
    val toMs: Long,
    val tamperCounts: Map<TamperType, Int>,
    val tamperTotal: Int,
    val emergencyCount: Int,
    val emergencyEntries: List<EmergencyEntry>,
    val changeCount: Int,
    val cleanDays: Int,
    val events: List<TamperEvent>,
)

object HonestyReports {
    /** 過去 7 日（今日を含む）の「正直レポート」。 */
    fun build(events: List<TamperEvent>, emergencies: List<EmergencyEntry>, nowMs: Long, zone: ZoneId): HonestyReport {
        val todayStart = Schedule.dayStartMs(nowMs, zone)
        val from = Schedule.dayStartMs(todayStart - 6L * 86_400_000L + 3_600_000L, zone)
        val ev = events.filter { it.atMs in from..nowMs }.sortedByDescending { it.atMs }
        val tamper = ev.filter { it.type.isTamper }
        val counts = tamper.groupingBy { it.type }.eachCount()
        val em = emergencies.filter { it.atMs in from..nowMs }.sortedByDescending { it.atMs }
        val dirtyDays = (tamper.map { Schedule.dayKey(it.atMs, zone) } + em.map { Schedule.dayKey(it.atMs, zone) }).toSet()
        var clean = 0
        for (i in 0..6) {
            val k = Schedule.dayKey(todayStart - i * 86_400_000L + 3_600_000L, zone)
            if (k !in dirtyDays) clean++
        }
        val changes = ev.count { it.type == TamperType.COOLDOWN_STARTED }
        return HonestyReport(from, nowMs, counts, tamper.size, em.size, em, changes, clean, ev)
    }
}
