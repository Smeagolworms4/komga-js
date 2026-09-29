// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/hash/Hasher.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { createRequire } from 'node:module'
import { readChunksAsync } from '../../port/async-io.js'
import { ByteArrayInputStream, InputStream, use } from '../../port/java-io.js'
import { inputStream } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

// PORT: com.appmattus.crypto.Algorithm.XXH3_128 -> xxhash-addon (liaison native de la bibliothèque xxHash de référence),
// XXHash128 en flux, graine 0 sur 8 octets. Empreinte identique vérifiée contre Komga (jshell) : chaînes et fichiers de test.
const { XXHash128 } = createRequire(import.meta.url)('xxhash-addon') as {
  XXHash128: new (seed: Buffer) => { update(data: Buffer): void; digest(): Buffer }
}

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.hash.Hasher')

const DEFAULT_BUFFER_SIZE = 8192
const SEED = 0

export class Hasher {
  // PORT: surcharges computeHash(path: Path) / computeHash(stream: InputStream) fusionnées (Path = string) ;
  // computeHash(string: String) ne peut pas en être distinguée : voir computeHashOfString.
  // PORT: async pour un fichier : lecture sur le pool de libuv (thread unique, voir PORTING.md « Architecture
  // d'exécution »), mêmes octets dans le même ordre, donc même empreinte ; un flux en mémoire reste synchrone
  computeHash(path: string): Promise<string>
  computeHash(stream: InputStream): string
  computeHash(pathOrStream: string | InputStream): string | Promise<string> {
    if (typeof pathOrStream === 'string') {
      const path = pathOrStream
      logger.debug(() => `Hashing: ${path}`)

      // PORT: this.computeHash(path.inputStream()) -> lecture asynchrone du fichier, par blocs
      return this.computeHashAsync(path)
    }
    const stream = pathOrStream
    // PORT: Seeded(SEED.toLong()) : graine 64 bits
    const seed = Buffer.alloc(8)
    seed.writeBigUInt64BE(BigInt(SEED))
    const hash = new XXHash128(seed)

    use(stream, (it) => {
      const buffer = new Uint8Array(DEFAULT_BUFFER_SIZE)
      let len: number

      do {
        len = it.read(buffer)
        if (len >= 0) hash.update(Buffer.from(buffer.buffer, buffer.byteOffset, len))
      } while (len >= 0)
    })

    return this.toHexString(hash.digest())
  }

  // PORT: computeHash(stream) sur le contenu du fichier, lu de façon asynchrone (Path.inputStream() : mêmes
  // exceptions, NoSuchFileException…)
  private async computeHashAsync(path: string): Promise<string> {
    const seed = Buffer.alloc(8)
    seed.writeBigUInt64BE(BigInt(SEED))
    const hash = new XXHash128(seed)
    await readChunksAsync(path, (chunk) => hash.update(chunk))
    return this.toHexString(hash.digest())
  }

  // PORT: computeHash(path) synchrone (l'ancienne forme), seulement là où l'appelant doit rester synchrone (dans une
  // transaction, voir LibraryContentLifecycle.tryRestoreBooksBlocking)
  computeHashBlocking(path: string): string {
    logger.debug(() => `Hashing: ${path}`)

    return this.computeHash(inputStream(path))
  }

  // PORT: surcharge computeHash(string: String)
  computeHashOfString(string: string): string {
    return this.computeHash(ByteArrayInputStream.ofString(string))
  }

  // PORT: fonction d'extension membre ByteArray.toHexString()
  toHexString(self: Uint8Array): string {
    return Array.from(self, (it) => it.toString(16).padStart(2, '0')).join('')
  }
}

// @Component
component(Hasher)
