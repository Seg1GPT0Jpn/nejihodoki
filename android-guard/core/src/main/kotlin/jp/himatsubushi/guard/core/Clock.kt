package jp.himatsubushi.guard.core

data class ClockState(
    val anchorWallMs: Long,
    val anchorElapsedMs: Long,
    val bootId: Long,
    val lastTrustedMs: Long,
    /** 最後に報告したずれ（同じずれを何度も記録しないため） */
    val reportedDriftMs: Long = 0L,
)

enum class ClockEventKind { ROLLBACK, FORWARD }

/** accepted = 端末の時計を信じて合わせた（自動日時が ON のときなど）。false = 無視して、信頼する時計はそのまま進めた。 */
data class ClockEvent(val kind: ClockEventKind, val deltaMs: Long, val accepted: Boolean)

data class ClockResult(val state: ClockState, val trustedNowMs: Long, val events: List<ClockEvent>)

/**
 * 端末の時計を変えても、使える時間が増えないようにする時計。
 * 起動からの経過時間（elapsedRealtime）で進め、壁時計とのずれを見張る。
 * 自動日時が OFF のときは、手動で変えられた時計（過去・未来どちらも）を採用しない。
 * 再起動のあとは、最後に信頼していた時刻より前には戻さない。
 */
object TrustedClock {
    const val TOLERANCE_MS = 90_000L

    fun observe(prev: ClockState?, wallMs: Long, elapsedMs: Long, bootId: Long, autoTime: Boolean): ClockResult {
        if (prev == null) {
            val s = ClockState(wallMs, elapsedMs, bootId, wallMs)
            return ClockResult(s, wallMs, emptyList())
        }
        val events = ArrayList<ClockEvent>()
        val rebooted = bootId != prev.bootId || elapsedMs < prev.anchorElapsedMs
        if (rebooted) {
            // 再起動：壁時計から始め直す。自動日時が OFF で、壁時計が最後の信頼時刻より前なら、最後の時刻から。
            val floor = prev.lastTrustedMs
            if (!autoTime && wallMs < floor - TOLERANCE_MS) {
                events.add(ClockEvent(ClockEventKind.ROLLBACK, wallMs - floor, false))
                val s = ClockState(floor, elapsedMs, bootId, floor, wallMs - floor)
                return ClockResult(s, floor, events)
            }
            val t = if (autoTime) wallMs else maxOf(wallMs, floor)
            return ClockResult(ClockState(t, elapsedMs, bootId, t), t, events)
        }
        val trusted = prev.anchorWallMs + (elapsedMs - prev.anchorElapsedMs)
        val drift = wallMs - trusted
        if (Math.abs(drift) <= TOLERANCE_MS) {
            // ふつうの誤差：壁時計に合わせて錨を打ち直す
            val s = ClockState(wallMs, elapsedMs, bootId, wallMs)
            return ClockResult(s, wallMs, events)
        }
        val kind = if (drift < 0) ClockEventKind.ROLLBACK else ClockEventKind.FORWARD
        if (autoTime) {
            events.add(ClockEvent(kind, drift, true))
            val s = ClockState(wallMs, elapsedMs, bootId, wallMs)
            return ClockResult(s, wallMs, events)
        }
        // 自動日時が OFF：壁時計の変更を採用しない
        if (Math.abs(drift - prev.reportedDriftMs) > TOLERANCE_MS) events.add(ClockEvent(kind, drift, false))
        val s = prev.copy(lastTrustedMs = maxOf(prev.lastTrustedMs, trusted), reportedDriftMs = drift)
        return ClockResult(s, trusted, events)
    }

    /** 持ち主が PIN で「いまの端末の時計を正しい」と決めたとき。 */
    fun resync(prev: ClockState?, wallMs: Long, elapsedMs: Long, bootId: Long): ClockState =
        ClockState(wallMs, elapsedMs, bootId, wallMs)
}

/** 緊急解除の回数・間隔の制限。 */
object EmergencyLimiter {
    const val UNLOCK_MIN = 5
    const val COMMITMENT_MIN_GAP_MIN = 30

    enum class Verdict { OK, DAILY_MAX, TOO_SOON }
    data class Check(val verdict: Verdict, val nextAllowedMs: Long)

    fun check(log: List<EmergencyEntry>, nowMs: Long, zone: java.time.ZoneId, maxPerDay: Int, minGapMin: Int): Check {
        val dayStart = Schedule.dayStartMs(nowMs, zone)
        val today = log.filter { it.atMs >= dayStart }
        if (maxPerDay > 0 && today.size >= maxPerDay) return Check(Verdict.DAILY_MAX, Schedule.nextDayStartMs(nowMs, zone))
        val last = log.maxOfOrNull { it.atMs }
        if (last != null && minGapMin > 0) {
            val next = last + minGapMin * 60_000L
            if (nowMs < next) return Check(Verdict.TOO_SOON, next)
        }
        return Check(Verdict.OK, nowMs)
    }
}

/** サービスが止められていたかの判定（心拍の間があいた）。 */
object HeartbeatCheck {
    const val GRACE_MS = 3 * 60_000L

    /** 同じ起動中に、予定外で GRACE を超えて心拍が途切れていたら、その長さを返す。 */
    fun killedGapMs(lastBeatElapsedMs: Long, lastBootId: Long, nowElapsedMs: Long, nowBootId: Long, expectedStop: Boolean): Long? {
        if (lastBeatElapsedMs <= 0L || expectedStop) return null
        if (lastBootId != nowBootId) return null
        val gap = nowElapsedMs - lastBeatElapsedMs
        return if (gap > GRACE_MS) gap else null
    }
}
