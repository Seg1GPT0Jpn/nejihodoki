package jp.himatsubushi.guard

import android.app.Application

class GuardApp : Application() {
    lateinit var store: Store
        private set
    val engine: Engine by lazy { Engine(this) }

    override fun onCreate() {
        super.onCreate()
        store = Store(this)
        Notifier.ensureChannels(this)
        if (store.setupDone) {
            try { engine.start() } catch (e: Exception) { /* 次の機会に */ }
            WatchdogJobService.schedule(this)
        }
    }
}
