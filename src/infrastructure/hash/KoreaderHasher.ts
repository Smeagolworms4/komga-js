// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/hash/KoreaderHasher.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { createHash } from 'node:crypto'
import { closeSync, readSync } from 'node:fs'
import { openForRead } from '../../port/java-io.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.hash.KoreaderHasher')

export class KoreaderHasher {
  computeHash(path: string): string {
    logger.debug(() => `Koreader hashing: ${path}`)

    return this.partialMd5(path)
  }

  /**
   * From https://github.com/koreader/koreader/blob/5bd3f3b42c95fd143d98f8fc9695d486fd92b7c8/frontend/util.lua#L1093-L1119
   */
  private partialMd5(path: string): string {
    const step = 1024n
    const size = 1024
    // PORT: com.appmattus.crypto Algorithm.MD5 -> node:crypto
    const digest = createHash('md5')

    // PORT: RandomAccessFile -> descripteur node:fs ; le fichier n'est jamais fermé en Kotlin (fermé par le GC de la JVM) : fermé ici
    // PORT: openForRead lève FileNotFoundException comme RandomAccessFile(file, "r")
    const file = openForRead(path)
    try {
      const buffer = new Uint8Array(size)
      for (let it = -1; it <= 10; it++) {
        // PORT: Long shl n utilise n & 63 (it = -1 -> décalage de 62 -> 0), arithmétique 64 bits
        const pos = BigInt.asIntN(64, step << BigInt((2 * it) & 63))
        // PORT: file.seek(pos) + file.read(buffer) -> readSync à la position (0 en fin de fichier au lieu de -1)
        const s = readSync(file, buffer, 0, size, Number(pos))
        // le tampon entier est ajouté, y compris les octets d'une lecture précédente si s < size (comme en Kotlin)
        if (s > 0) digest.update(buffer)
      }
    } finally {
      closeSync(file)
    }

    return digest.digest('hex')
  }
}

// @Component
component(KoreaderHasher)
