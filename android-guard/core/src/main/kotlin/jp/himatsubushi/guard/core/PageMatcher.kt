package jp.himatsubushi.guard.core

enum class ProtectedPage { APP_INFO, ACCESSIBILITY, USAGE_ACCESS, DEVICE_ADMIN, DATE_TIME, SERVICE_PAGE, UNINSTALL_DIALOG }

/**
 * システム設定の画面のうち、保護するページかどうか。
 * 画面タイトル（ウィンドウ変化イベントの文言）と、画面の文字（見えている範囲）から判定する。
 * 設定アプリのトップ（タイトル「設定」）や、ほかのページは対象にしない。
 */
object PageMatcher {
    private val a11y = setOf("ユーザー補助", "アクセシビリティ", "accessibility")
    private val usage = setOf("使用状況へのアクセス", "アプリの使用状況へのアクセス", "使用状況アクセス", "usage access", "apps with usage access")
    private val admin = setOf("デバイス管理アプリ", "端末管理アプリ", "デバイス管理者アプリ", "device admin apps", "device admin app")
    private val dateTime = setOf("日付と時刻", "日付と時間", "date & time", "date and time")
    private val appInfo = setOf("アプリ情報", "アプリの情報", "app info")
    private val installerWords = listOf("アンインストール", "uninstall")

    private fun n(s: String) = s.trim().lowercase()

    fun classify(title: String, contents: List<String>, appLabels: Collection<String>, pkg: String): ProtectedPage? {
        val t = n(title)
        val labels = appLabels.map { n(it) }.filter { it.isNotEmpty() }
        val mentionsApp = contents.any { c -> val x = n(c); labels.any { x.contains(it) } } || labels.any { t.contains(it) }
        if (pkg in SettingsPackages.installers) {
            return if (mentionsApp && (installerWords.any { w -> t.contains(w) || contents.any { c -> n(c).contains(w) } })) ProtectedPage.UNINSTALL_DIALOG else null
        }
        if (pkg !in SettingsPackages.settings) return null
        if (t in a11y) return ProtectedPage.ACCESSIBILITY
        if (t in usage) return ProtectedPage.USAGE_ACCESS
        if (t in admin) return ProtectedPage.DEVICE_ADMIN
        if (t in dateTime) return ProtectedPage.DATE_TIME
        if (t in appInfo && mentionsApp) return ProtectedPage.APP_INFO
        // このアプリのユーザー補助サービスや管理者の詳細ページ（タイトルがアプリ名）
        if (labels.any { t == it }) return ProtectedPage.SERVICE_PAGE
        return null
    }

    /** 権限を戻す作業中は、そのページだけは開けるようにする。 */
    fun allowedWhileRestoring(p: ProtectedPage) =
        p == ProtectedPage.ACCESSIBILITY || p == ProtectedPage.USAGE_ACCESS || p == ProtectedPage.SERVICE_PAGE
}
