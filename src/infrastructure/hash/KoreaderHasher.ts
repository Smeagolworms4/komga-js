// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/hash/KoreaderHasher.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { createHash } from 'node:crypto'
import { closeSync, fstatSync } from 'node:fs'
import { openAsync, preadManyAsync } from '../../port/async-io.js'
import { FileNotFoundException, fileNotFound } from '../../port/java-io.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.hash.KoreaderHasher')

export class KoreaderHasher {
  // PORT: async (lectures sur le pool de libuv, voir PORTING.md « Architecture d'exécution »)
  async computeHash(path: string): Promise<string> {
    logger.debug(() => `Koreader hashing: ${path}`)

    return await this.partialMd5(path)
  }

  /**
   * From https://github.com/koreader/koreader/blob/5bd3f3b42c95fd143d98f8fc9695d486fd92b7c8/frontend/util.lua#L1093-L1119
   */
  // PORT: async
  private async partialMd5(path: string): Promise<string> {
    const step = 1024n
    const size = 1024
    // PORT: com.appmattus.crypto Algorithm.MD5 -> node:crypto
    const digest = createHash('md5')

    // PORT: RandomAccessFile -> descripteur node:fs ; le fichier n'est jamais fermé en Kotlin (fermé par le GC de la JVM) : fermé ici
    // PORT: FileNotFoundException comme RandomAccessFile(file, "r") (voir openForRead)
    const file = await openForReadAsync(path)
    try {
      const buffer = new Uint8Array(size)
      // PORT: les 12 lectures sont faites ensemble sur le pool de libuv, puis rejouées dans l'ordre sur le même tampon
      const positions: number[] = []
      for (let it = -1; it <= 10; it++) {
        // PORT: Long shl n utilise n & 63 (it = -1 -> décalage de 62 -> 0), arithmétique 64 bits
        positions.push(Number(BigInt.asIntN(64, step << BigInt((2 * it) & 63))))
      }
      const reads = await preadManyAsync(file, positions, size)
      for (const [read, s] of reads) {
        // PORT: file.seek(pos) + file.read(buffer) -> lecture à la position (0 en fin de fichier au lieu de -1)
        buffer.set(read.subarray(0, s))
        // le tampon entier est ajouté, y compris les octets d'une lecture précédente si s < size (comme en Kotlin)
        if (s > 0) digest.update(buffer)
      }
    } finally {
      closeSync(file)
    }

    return digest.digest('hex')
  }
}

/** `openForRead` (port/java-io.ts) asynchrone : FileNotFoundException, répertoire refusé */
async function openForReadAsync(path: string): Promise<number> {
  let fd: number
  try {
    fd = await openAsync(path, false)
  } catch (e) {
    throw fileNotFound(e, path)
  }
  if (fstatSync(fd).isDirectory()) {
    closeSync(fd)
    throw new FileNotFoundException(`${path} (Is a directory)`)
  }
  return fd
}

// @Component
component(KoreaderHasher)
