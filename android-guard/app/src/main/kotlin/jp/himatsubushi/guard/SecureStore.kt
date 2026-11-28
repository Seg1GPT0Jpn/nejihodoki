package jp.himatsubushi.guard

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import jp.himatsubushi.guard.core.Json
import jp.himatsubushi.guard.core.PinHasher
import jp.himatsubushi.guard.core.asMap
import jp.himatsubushi.guard.core.int
import jp.himatsubushi.guard.core.str
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * PIN の保管（ソルトつきハッシュ）。Android Keystore の AES-GCM 鍵で、さらに暗号化して SharedPreferences に置く。
 * Keystore が使えない端末では、暗号化なし（ハッシュのみ）で保存する。外部ライブラリは使わない。
 */
object SecureStore {
    private const val PREFS = "secure"
    private const val KEY_ALIAS = "guard_pin_key_v1"
    private const val K_ENC = "pin_enc"
    private const val K_PLAIN = "pin_plain"

    private fun key(): SecretKey? = try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
            generateKey()
        }
    } catch (e: Exception) { null }

    fun hasPin(ctx: Context): Boolean {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return p.contains(K_ENC) || p.contains(K_PLAIN)
    }

    fun writeRecord(ctx: Context, r: PinHasher.Hashed) {
        val json = Json.write(mapOf("salt" to r.salt, "hash" to r.hash, "iter" to r.iterations))
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        val k = key()
        var done = false
        if (k != null) try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, k)
            val ct = c.doFinal(json.toByteArray(Charsets.UTF_8))
            p.putString(K_ENC, Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP))
            p.remove(K_PLAIN)
            done = true
        } catch (e: Exception) { done = false }
        if (!done) { p.putString(K_PLAIN, json); p.remove(K_ENC) }
        p.commit()
    }

    fun readRecord(ctx: Context): PinHasher.Hashed? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val text: String? = p.getString(K_ENC, null)?.let { enc ->
            try {
                val (iv, ct) = enc.split(":").let { Base64.decode(it[0], Base64.NO_WRAP) to Base64.decode(it[1], Base64.NO_WRAP) }
                val c = Cipher.getInstance("AES/GCM/NoPadding")
                c.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(128, iv))
                String(c.doFinal(ct), Charsets.UTF_8)
            } catch (e: Exception) { null }
        } ?: p.getString(K_PLAIN, null)
        val m = text?.let { Json.parseOrNull(it).asMap() } ?: return null
        return PinHasher.Hashed(m.str("salt"), m.str("hash"), m.int("iter", PinHasher.ITERATIONS))
    }

    fun clearPin(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    }
}
