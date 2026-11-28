package jp.himatsubushi.guard.core

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** PIN のハッシュ（PBKDF2-HMAC-SHA256 + ソルト）。平文の PIN は保存しない。 */
object PinHasher {
    const val ITERATIONS = 60_000
    const val KEY_BITS = 256

    data class Hashed(val salt: String, val hash: String, val iterations: Int)

    fun isValidFormat(pin: String) = pin.length in 4..8 && pin.all { it in '0'..'9' }

    fun newSalt(random: SecureRandom = SecureRandom()): ByteArray = ByteArray(16).also { random.nextBytes(it) }

    fun hash(pin: String, salt: ByteArray, iterations: Int = ITERATIONS): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, iterations, KEY_BITS)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally { spec.clearPassword() }
    }

    fun create(pin: String, random: SecureRandom = SecureRandom(), iterations: Int = ITERATIONS): Hashed {
        val salt = newSalt(random)
        return Hashed(hex(salt), hex(hash(pin, salt, iterations)), iterations)
    }

    fun verify(pin: String, h: Hashed): Boolean {
        if (!isValidFormat(pin)) return false
        val expected = unhex(h.hash) ?: return false
        val salt = unhex(h.salt) ?: return false
        return MessageDigest.isEqual(expected, hash(pin, salt, h.iterations))
    }

    fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

    fun unhex(s: String): ByteArray? {
        if (s.length % 2 != 0) return null
        return try { ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() } } catch (e: NumberFormatException) { null }
    }
}

/** まちがえつづけたときの待ち時間（秒）。5 回までは待たない。 */
object PinThrottle {
    fun lockoutSec(failCount: Int): Int = when {
        failCount < 5 -> 0
        failCount < 8 -> 30
        failCount < 10 -> 120
        failCount < 15 -> 600
        else -> 1800
    }

    fun remainingMs(failCount: Int, lastFailElapsedMs: Long, nowElapsedMs: Long): Long {
        val total = lockoutSec(failCount) * 1000L
        if (total == 0L || lastFailElapsedMs <= 0L) return 0L
        return (lastFailElapsedMs + total - nowElapsedMs).coerceIn(0L, total)
    }
}
