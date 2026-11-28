package jp.himatsubushi.guard

import android.content.Context
import android.os.SystemClock
import android.provider.Settings as AndroidSettings
import jp.himatsubushi.guard.core.*
import java.io.File

/** 端末の中だけに保存する設定と状態。設定は settings.json、そのほかは state.json（どちらも端末の外へ出ない）。 */
class Store(private val ctx: Context) {
    private val settingsFile = File(ctx.filesDir, "settings.json")
    private val stateFile = File(ctx.filesDir, "state.json")

    @Volatile var settings: Settings = Settings()
        private set

    val usage = Ledger()
    val bonus = Ledger()
    var passUntil = LinkedHashMap<String, Long>()
    var emergencyLog = ArrayList<EmergencyEntry>()
    var tamper = ArrayList<TamperEvent>()
    var pendings = ArrayList<PendingChange>()
    var pinPending: PinPending? = null
    var adminRemovalAtMs = 0L
    @Volatile var focus: FocusSession? = null
    @Volatile var emergencyUntilMs = 0L
    var clock: ClockState? = null
    var setupDone = false
    var setupDay = ""
    var a11yEver = false
    var notifEver = false
    var permBits = 0
    var batteryOk: Boolean? = null
    var lastBeatElapsed = 0L
    var lastBeatBoot = -1L
    var expectedStop = false
    var quizCooldownUntilMs = 0L
    var recentQuizIds = ArrayList<String>()
    var lastSystemZone = ""
    var pinFails = 0
    var pinLastFailElapsed = 0L
    var pinLastFailBoot = -1L

    data class PinPending(val applyAtMs: Long, val remove: Boolean, val rec: PinHasher.Hashed?)

    init { load() }

    // ---------- 時刻 ----------
    fun bootId(): Long = try { AndroidSettings.Global.getInt(ctx.contentResolver, "boot_count", -1).toLong() } catch (e: Exception) { -1L }

    fun autoTime(): Boolean = try { AndroidSettings.Global.getInt(ctx.contentResolver, AndroidSettings.Global.AUTO_TIME, 1) == 1 } catch (e: Exception) { true }

    /** 信頼できる現在時刻（端末の時計を手で変えても、起動からの経過時間で進む）。 */
    fun now(): Long {
        val cs = clock ?: return System.currentTimeMillis()
        val el = SystemClock.elapsedRealtime()
        return if (el >= cs.anchorElapsedMs && bootId() == cs.bootId) cs.anchorWallMs + (el - cs.anchorElapsedMs)
        else maxOf(System.currentTimeMillis(), cs.lastTrustedMs)
    }

    fun zone() = Schedule.zoneOrDefault(settings.zoneId)

    fun today(): String = Schedule.dayKey(now(), zone())

    /** 端末の時計を見て、信頼する時計を更新する。改ざんの疑いがあれば記録する。 */
    @Synchronized
    fun observeClock(): Long {
        val r = TrustedClock.observe(clock, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootId(), autoTime())
        clock = r.state
        for (e in r.events) {
            val min = Math.abs(e.deltaMs) / 60_000L
            if (!e.accepted) {
                addTamper(if (e.kind == ClockEventKind.ROLLBACK) TamperType.CLOCK_ROLLBACK else TamperType.CLOCK_FORWARD, "${min}分", r.trustedNowMs)
            } else if (!autoTime()) {
                addTamper(if (e.kind == ClockEventKind.ROLLBACK) TamperType.CLOCK_ROLLBACK else TamperType.CLOCK_FORWARD, "${min}分", r.trustedNowMs)
            }
        }
        return r.trustedNowMs
    }

    @Synchronized
    fun resyncClock() {
        clock = TrustedClock.resync(clock, System.currentTimeMillis(), SystemClock.elapsedRealtime(), bootId())
        addTamper(TamperType.CLOCK_RESYNC, "", now())
        saveState()
    }

    // ---------- 記録 ----------
    @Synchronized
    fun addTamper(type: TamperType, detail: String = "", at: Long = now()) {
        tamper.add(TamperEvent(at, type, detail.take(200)))
        while (tamper.size > 500) tamper.removeAt(0)
        saveState()
    }

    // ---------- 設定の変更（待ち時間つき） ----------
    data class SubmitOutcome(val pending: List<Diff>, val rejected: List<Diff>, val appliedNow: List<Diff>)

    /**
     * 設定の変更を出す。きびしくする変更はすぐ反映され、ゆるめる変更は cooldownMin 分後（待ちのあいだは古い設定のまま）。
     * コミットメント中は、ゆるめる変更は受けつけない。
     */
    @Synchronized
    fun submit(proposed: Settings): SubmitOutcome {
        val now = now()
        val r = ChangeGate.submit(settings, proposed.copy(cooldownMin = proposed.cooldownMin.coerceAtLeast(1)), now)
        settings = r.applied
        if (r.pending.isNotEmpty()) {
            val keys = r.pending.map { it.key }.toSet()
            pendings.removeAll { p -> p.keys.any { it in keys } }
            pendings.add(ChangeGate.makePending("p${now}", now, settings.cooldownMin, r.pending, proposed))
            addTamper(TamperType.COOLDOWN_STARTED, r.pending.joinToString(",") { it.label }.take(150), now)
        }
        if (r.rejected.isNotEmpty()) addTamper(TamperType.LOOSEN_REJECTED, r.rejected.joinToString(",") { it.label }.take(150), now)
        saveSettings(); saveState()
        return SubmitOutcome(r.pending, r.rejected, r.appliedNow)
    }

    /** 持ち主が待ち中の変更を取りやめる（いつでもできる）。 */
    @Synchronized
    fun cancelPending(id: String) {
        if (pendings.removeAll { it.id == id }) addTamper(TamperType.COOLDOWN_CANCELED, "", now())
        saveState()
    }

    /** 待ち時間が過ぎた変更を反映する。変わったら true。 */
    @Synchronized
    fun applyMatured(): Boolean {
        val now = now()
        var changed = false
        if (pendings.isNotEmpty()) {
            val (s, rest) = ChangeGate.applyMatured(settings, pendings, now)
            val matured = pendings.size - rest.size
            if (matured > 0) {
                if (s != settings) { settings = s; saveSettings() }
                pendings = ArrayList(rest)
                addTamper(TamperType.COOLDOWN_APPLIED, "", now)
                changed = true
            }
        }
        val pp = pinPending
        if (pp != null && pp.applyAtMs <= now) {
            pinPending = null
            if (settings.commitmentActive(now)) { /* コミットメント中は捨てる */ }
            else if (pp.remove) SecureStore.clearPin(ctx) else if (pp.rec != null) SecureStore.writeRecord(ctx, pp.rec)
            changed = true
        }
        if (changed) saveState()
        return changed
    }

    @Synchronized
    fun startCommitment(days: Int) {
        val now = now()
        val until = maxOf(settings.commitmentUntilMs, now + days.coerceIn(1, 60) * 86_400_000L)
        settings = settings.copy(commitmentUntilMs = until)
        addTamper(TamperType.COMMITMENT_STARTED, "${days}日", now)
        saveSettings()
    }

    // ---------- 使用時間・おまけ ----------
    @Synchronized fun addUsage(day: String, pkg: String, ms: Long) { usage.add(day, pkg, ms) }
    @Synchronized fun usedToday(pkg: String): Long = usage.get(today(), pkg)
    @Synchronized fun bonusToday(pkg: String): Long = bonus.get(today(), pkg)

    @Synchronized
    fun grantBonus(pkg: String, minutes: Int, forWindow: Boolean) {
        if (minutes <= 0) return
        val now = now()
        if (forWindow) passUntil[pkg] = maxOf(passUntil[pkg] ?: 0L, now) + minutes * 60_000L
        else bonus.add(today(), pkg, minutes * 60_000L)
        saveState()
    }

    fun passUntilMs(pkg: String): Long = passUntil[pkg] ?: 0L

    @Synchronized
    fun rememberQuiz(ids: List<String>) {
        recentQuizIds.addAll(ids)
        while (recentQuizIds.size > 400) recentQuizIds.removeAt(0)
        saveState()
    }

    // ---------- 緊急解除 ----------
    @Synchronized
    fun startEmergency(pkg: String, reason: String) {
        val now = now()
        emergencyLog.add(EmergencyEntry(now, pkg, reason.take(200)))
        while (emergencyLog.size > 300) emergencyLog.removeAt(0)
        emergencyUntilMs = now + EmergencyLimiter.UNLOCK_MIN * 60_000L
        saveState()
    }

    fun emergencyCheck(): EmergencyLimiter.Check {
        val gap = if (settings.commitmentActive(now())) EmergencyLimiter.COMMITMENT_MIN_GAP_MIN else 0
        return EmergencyLimiter.check(emergencyLog, now(), zone(), settings.emergencyMaxPerDay, gap)
    }

    // ---------- 集中 ----------
    @Synchronized
    fun startFocus(minutes: Int, apps: Set<String>) {
        val now = now()
        focus = FocusSession(now, now + minutes * 60_000L, apps)
        saveState()
    }

    @Synchronized
    fun stopFocus(early: Boolean) {
        if (focus != null && early) addTamper(TamperType.FOCUS_STOPPED_EARLY, "", now())
        focus = null
        saveState()
    }

    // ---------- PIN ----------
    fun hasPin() = SecureStore.hasPin(ctx)

    @Synchronized
    fun pinLockoutMs(): Long {
        val el = SystemClock.elapsedRealtime()
        if (pinLastFailBoot != bootId()) return 0L
        return PinThrottle.remainingMs(pinFails, pinLastFailElapsed, el)
    }

    /** PIN が合っているか。まちがいは記録され、続くと待ち時間が入る。 */
    @Synchronized
    fun checkPin(pin: String): Boolean {
        if (pinLockoutMs() > 0) return false
        val rec = SecureStore.readRecord(ctx) ?: return true
        val ok = PinHasher.verify(pin, rec)
        if (ok) { pinFails = 0 }
        else {
            pinFails++
            pinLastFailElapsed = SystemClock.elapsedRealtime(); pinLastFailBoot = bootId()
            addTamper(TamperType.PIN_FAILED, "$pinFails", now())
        }
        saveState()
        return ok
    }

    // ---------- 保存と読み込み ----------
    @Synchronized
    fun saveSettings() { atomicWrite(settingsFile, SettingsCodec.toJson(settings)) }

    @Synchronized
    fun replaceSettingsDirect(s: Settings) { settings = s; saveSettings() }

    @Synchronized
    fun saveState() {
        val m = linkedMapOf<String, Any?>(
            "usage" to usage.toJson(), "bonus" to bonus.toJson(),
            "passUntil" to passUntil,
            "emergencyLog" to emergencyLog.map { mapOf("at" to it.atMs, "pkg" to it.pkg, "reason" to it.reason) },
            "tamper" to tamper.map { mapOf("at" to it.atMs, "type" to it.type.name, "detail" to it.detail) },
            "pendings" to pendings.map {
                mapOf("id" to it.id, "created" to it.createdMs, "applyAt" to it.applyAtMs, "keys" to it.keys, "labels" to it.labels,
                    "proposed" to SettingsCodec.toMap(it.proposed))
            },
            "pinPending" to pinPending?.let { mapOf("applyAt" to it.applyAtMs, "remove" to it.remove,
                "salt" to it.rec?.salt, "hash" to it.rec?.hash, "iter" to it.rec?.iterations) },
            "adminRemovalAt" to adminRemovalAtMs,
            "focus" to focus?.let { mapOf("start" to it.startMs, "end" to it.endMs, "apps" to it.apps.sorted()) },
            "emergencyUntil" to emergencyUntilMs,
            "clock" to clock?.let { mapOf("aw" to it.anchorWallMs, "ae" to it.anchorElapsedMs, "boot" to it.bootId, "lt" to it.lastTrustedMs, "rd" to it.reportedDriftMs) },
            "setupDone" to setupDone, "setupDay" to setupDay, "a11yEver" to a11yEver, "notifEver" to notifEver, "permBits" to permBits,
            "batteryOk" to batteryOk, "lastBeatElapsed" to lastBeatElapsed, "lastBeatBoot" to lastBeatBoot,
            "expectedStop" to expectedStop, "quizCooldown" to quizCooldownUntilMs, "recentQuiz" to recentQuizIds,
            "lastZone" to lastSystemZone, "pinFails" to pinFails, "pinLastFail" to pinLastFailElapsed, "pinLastFailBoot" to pinLastFailBoot,
        )
        atomicWrite(stateFile, Json.write(m))
    }

    private fun load() {
        try {
            if (settingsFile.exists()) SettingsCodec.fromJson(settingsFile.readText())?.let { settings = it }
        } catch (e: Exception) { /* 壊れていたら初期設定 */ }
        try {
            if (!stateFile.exists()) return
            val m = Json.parse(stateFile.readText()).asMap() ?: return
            m["usage"].asMap()?.let { u -> Ledger.fromJson(u).toMap().forEach { (d, mm) -> mm.forEach { (p, v) -> usage.add(d, p, v) } } }
            m["bonus"].asMap()?.let { u -> Ledger.fromJson(u).toMap().forEach { (d, mm) -> mm.forEach { (p, v) -> bonus.add(d, p, v) } } }
            m["passUntil"].asMap()?.forEach { (k, v) -> (v as? Long)?.let { passUntil[k] = it } }
            m["emergencyLog"].asList()?.forEach { e -> e.asMap()?.let { emergencyLog.add(EmergencyEntry(it.long("at"), it.str("pkg"), it.str("reason"))) } }
            m["tamper"].asList()?.forEach { e ->
                e.asMap()?.let { x ->
                    val t = try { TamperType.valueOf(x.str("type")) } catch (ex: Exception) { null }
                    if (t != null) tamper.add(TamperEvent(x.long("at"), t, x.str("detail")))
                }
            }
            m["pendings"].asList()?.forEach { e ->
                e.asMap()?.let { x ->
                    val ps = x["proposed"].asMap()?.let(SettingsCodec::fromMap) ?: return@let
                    pendings.add(PendingChange(x.str("id"), x.long("created"), x.long("applyAt"), x.strList("keys"), x.strList("labels"), ps))
                }
            }
            m["pinPending"].asMap()?.let { x ->
                val rec = if (x["hash"] is String) PinHasher.Hashed(x.str("salt"), x.str("hash"), x.int("iter", PinHasher.ITERATIONS)) else null
                pinPending = PinPending(x.long("applyAt"), x.bool("remove"), rec)
            }
            adminRemovalAtMs = m.long("adminRemovalAt")
            m["focus"].asMap()?.let { focus = FocusSession(it.long("start"), it.long("end"), it.strList("apps").toSet()) }
            emergencyUntilMs = m.long("emergencyUntil")
            m["clock"].asMap()?.let { clock = ClockState(it.long("aw"), it.long("ae"), it.long("boot"), it.long("lt"), it.long("rd")) }
            setupDone = m.bool("setupDone"); setupDay = m.str("setupDay"); a11yEver = m.bool("a11yEver"); notifEver = m.bool("notifEver")
            permBits = m.int("permBits"); batteryOk = m["batteryOk"] as? Boolean
            lastBeatElapsed = m.long("lastBeatElapsed"); lastBeatBoot = m.long("lastBeatBoot", -1L)
            expectedStop = m.bool("expectedStop"); quizCooldownUntilMs = m.long("quizCooldown")
            recentQuizIds = ArrayList(m.strList("recentQuiz")); lastSystemZone = m.str("lastZone")
            pinFails = m.int("pinFails"); pinLastFailElapsed = m.long("pinLastFail"); pinLastFailBoot = m.long("pinLastFailBoot", -1L)
        } catch (e: Exception) { /* 壊れていたら、読めたところまで */ }
    }

    private fun atomicWrite(f: File, text: String) {
        try {
            val tmp = File(f.parentFile, f.name + ".tmp")
            tmp.writeText(text)
            if (!tmp.renameTo(f)) { f.writeText(text); tmp.delete() }
        } catch (e: Exception) { /* 保存に失敗しても、動作は続ける */ }
    }
}
