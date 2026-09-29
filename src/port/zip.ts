// Support de portage : org.apache.commons.compress.archivers.zip.ZipFile (commons-compress 1.28.0), sans jumeau Kotlin.
// Lecteur ZIP synchrone : seul le répertoire central est chargé ; les données d'une entrée sont lues à la demande
// (fs.readSync), jamais l'archive entière. Même ordre des entrées (ordre du répertoire central), mêmes noms
// (UTF-8 par défaut avec remplacement '?', drapeau EFS, champ extra Unicode Path 0x7075 vérifié par CRC,
// '\' -> '/' pour les archives FAT), mêmes tailles (ZIP64), mêmes erreurs et messages.
// Méthodes : STORED, DEFLATED (zlib), ENHANCED_DEFLATED/Deflate64 (inflate64 ci-dessous), BZIP2 (seek-bzip).
// Vérifié contre la vraie bibliothèque (jshell) : test/port/zip.test.ts.
// PORT: thread unique (voir PORTING.md « Architecture d'exécution ») : `ZipFileBuilder.getAsync()` lit d'avance, sur le
// pool de libuv, les zones dont le lecteur synchrone aura besoin (fin du fichier, répertoire central, en-têtes locaux et
// début des données des entrées) ; `ZipFile.readEntryBytesAsync` lit une entrée entière et la décompresse sur le pool.
// Le code de lecture reste celui, synchrone, ci-dessous : une lecture hors des zones préchargées se fait par
// fs.readSync, avec le même résultat.
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { createRequire } from 'node:module'
import { constants as zc, crc32, inflateRawSync } from 'node:zlib'
import { closeAsync, inflateRawAsync, openAsync, preadFullyAsync } from './async-io.js'
import { EOFException, IOException, InputStream } from './java-io.js'
import { translateError } from './java-nio-file.js'
import { IllegalArgumentException } from './kotlin.js'

// PORT: bzip2 (BZip2CompressorInputStream) -> seek-bzip (JS pur, décodage synchrone complet)
const Bunzip = createRequire(import.meta.url)('seek-bzip') as { decode(input: Uint8Array): Buffer }

/** `java.util.zip.ZipException` */
export class ZipException extends IOException {}

/** `java.lang.NoClassDefFoundError` : une erreur JVM (Error), pas une Exception */
export class NoClassDefFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoClassDefFoundError'
  }
}

/** `UnsupportedZipFeatureException` */
export class UnsupportedZipFeatureException extends ZipException {}

/** `ZipMethod` : codes et noms (utilisés dans les messages d'erreur) */
const ZIP_METHODS: [string, number][] = [
  ['STORED', 0],
  ['UNSHRINKING', 1],
  ['EXPANDING_LEVEL_1', 2],
  ['EXPANDING_LEVEL_2', 3],
  ['EXPANDING_LEVEL_3', 4],
  ['EXPANDING_LEVEL_4', 5],
  ['IMPLODING', 6],
  ['TOKENIZATION', 7],
  ['DEFLATED', 8],
  ['ENHANCED_DEFLATED', 9],
  ['PKWARE_IMPLODING', 10],
  ['BZIP2', 12],
  ['LZMA', 14],
  ['ZSTD_DEPRECATED', 20],
  ['ZSTD', 93],
  ['XZ', 95],
  ['JPEG', 96],
  ['WAVPACK', 97],
  ['PPMD', 98],
  ['AES_ENCRYPTED', 99],
]

function methodName(code: number): string {
  return ZIP_METHODS.find(([, c]) => c === code)?.[0] ?? 'UNKNOWN'
}

const ZIP64_MAGIC = 0xffffffff
const ZIP64_MAGIC_SHORT = 0xffff
const MIN_EOCD_SIZE = 22
const MAX_EOCD_SIZE = MIN_EOCD_SIZE + ZIP64_MAGIC_SHORT
const CFH_LEN = 42
const CFD_LENGTH_OFFSET = 12
const ZIP64_EOCDL_LENGTH = 20
const ZIP64_EOCDL_LOCATOR_OFFSET = 8
const ZIP64_EOCD_CFD_LOCATOR_OFFSET = 48
const LFH_OFFSET_FOR_FILENAME_LENGTH = 26
const EOCD_SIG = [0x50, 0x4b, 0x05, 0x06]
const ZIP64_EOCD_LOC_SIG = [0x50, 0x4b, 0x06, 0x07]
const ZIP64_EOCD_SIG = [0x50, 0x4b, 0x06, 0x06]
const CFH_SIG = 0x02014b50
const LFH_SIG = [0x50, 0x4b, 0x03, 0x04]
const PLATFORM_FAT = 0
const UPATH_ID = 0x7075
const ZIP64_ID = 0x0001

// ---------------------------------------------------------------------------
// Décodage UTF-8 de Java (CharsetDecoder, REPLACE avec "?")
// ---------------------------------------------------------------------------

/**
 * `new String(bytes, UTF_8)` avec le remplacement de NioZipEncoding ('?') et les règles de découpage des séquences
 * invalides du décodeur UTF-8 du JDK (sun.nio.cs.UTF_8).
 */
export function decodeUtf8Java(b: Uint8Array): string {
  let out = ''
  let i = 0
  const n = b.length
  const cont = (x: number | undefined): boolean => x !== undefined && (x & 0xc0) === 0x80
  while (i < n) {
    const b1 = b[i] as number
    if (b1 < 0x80) {
      out += String.fromCharCode(b1)
      i++
    } else if (b1 >> 5 === 0x6 && (b1 & 0x1e) !== 0) {
      // 2 octets
      if (i + 1 >= n) {
        out += '?'
        i = n
        break
      }
      const b2 = b[i + 1] as number
      if (!cont(b2)) {
        out += '?'
        i += 1
        continue
      }
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f))
      i += 2
    } else if (b1 >> 4 === 0xe) {
      // 3 octets
      if (i + 2 >= n) {
        // fin de flux : séquence tronquée
        const b2 = b[i + 1]
        if (i + 1 < n && ((b1 === 0xe0 && ((b2 as number) & 0xe0) === 0x80) || !cont(b2))) {
          out += '?'
          i += 1
          continue
        }
        out += '?'
        i = n
        break
      }
      const b2 = b[i + 1] as number
      const b3 = b[i + 2] as number
      if ((b1 === 0xe0 && (b2 & 0xe0) === 0x80) || !cont(b2) || !cont(b3)) {
        // malformedN : 1 si le 2e octet est invalide, sinon 2
        out += '?'
        i += (b1 === 0xe0 && (b2 & 0xe0) === 0x80) || !cont(b2) ? 1 : 2
        continue
      }
      const c = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)
      if (c >= 0xd800 && c <= 0xdfff) {
        out += '?'
        i += 3
        continue
      }
      out += String.fromCharCode(c)
      i += 3
    } else if (b1 >> 3 === 0x1e) {
      // 4 octets
      if (i + 3 >= n) {
        const b2 = b[i + 1]
        const b3 = b[i + 2]
        if (i + 1 < n && (b1 > 0xf4 || (b1 === 0xf0 && ((b2 as number) < 0x90 || (b2 as number) > 0xbf)) || (b1 === 0xf4 && ((b2 as number) & 0xf0) !== 0x80) || !cont(b2))) {
          out += '?'
          i += 1
          continue
        }
        if (i + 2 < n && !cont(b3)) {
          out += '?'
          i += 2
          continue
        }
        out += '?'
        i = n
        break
      }
      const b2 = b[i + 1] as number
      const b3 = b[i + 2] as number
      const b4 = b[i + 3] as number
      const uc = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)
      if (!cont(b2) || !cont(b3) || !cont(b4) || uc < 0x10000 || uc > 0x10ffff) {
        // malformed4
        if (b1 > 0xf4 || (b1 === 0xf0 && (b2 < 0x90 || b2 > 0xbf)) || (b1 === 0xf4 && (b2 & 0xf0) !== 0x80) || !cont(b2)) i += 1
        else if (!cont(b3)) i += 2
        else i += 3
        out += '?'
        continue
      }
      out += String.fromCodePoint(uc)
      i += 4
    } else {
      out += '?'
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

type ExtraState = { id: number; kind: 'zip64'; raw: Uint8Array } | { id: number; kind: 'upath'; crc: number; name: Uint8Array } | { id: number; kind: 'other' }

/** `org.apache.commons.compress.archivers.ArchiveEntry` */
export const ArchiveEntry = {
  SIZE_UNKNOWN: -1,
}

export class ZipArchiveEntry {
  static readonly SIZE_UNKNOWN = -1

  name = ''
  rawName: Uint8Array = new Uint8Array(0)
  platform = 0
  method = 0
  gpFlag = 0
  crc = 0
  size = ZipArchiveEntry.SIZE_UNKNOWN
  compressedSize = ZipArchiveEntry.SIZE_UNKNOWN
  diskNumberStart = 0
  localHeaderOffset = 0
  dataOffset = -1
  /** champs extra (premier de chaque identifiant, comme getExtraField) */
  extraFields: ExtraState[] = []

  getName(): string {
    return this.name
  }

  getSize(): number {
    return this.size
  }

  getCompressedSize(): number {
    return this.compressedSize
  }

  getMethod(): number {
    return this.method
  }

  isDirectory(): boolean {
    return this.name.endsWith('/')
  }

  setName(name: string): void {
    if (this.platform === PLATFORM_FAT && !name.includes('/')) name = name.replace(/\\/g, '/')
    this.name = name
  }

  usesUTF8ForNames(): boolean {
    return (this.gpFlag & (1 << 11)) !== 0
  }

  usesEncryption(): boolean {
    return (this.gpFlag & 1) !== 0
  }

  getExtraField(id: number): ExtraState | null {
    return this.extraFields.find((f) => f.id === id) ?? null
  }
}

function u16(b: Uint8Array, o: number): number {
  return (b[o] as number) | ((b[o + 1] as number) << 8)
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16)) + (b[o + 3] as number) * 0x1000000
}

/** `ZipEightByteInteger.getLongValue()` (signé) */
function i64(b: Uint8Array, o: number): number {
  return Number(Buffer.from(b.buffer, b.byteOffset + o, 8).readBigInt64LE(0))
}

/** analyse d'un champ extra connu (`parseFromLocalFileData` / `parseFromCentralDirectoryData`) ; null si erreur (ZipException) */
function parseField(id: number, data: Uint8Array, local: boolean): ExtraState | null {
  if (id === ZIP64_ID) {
    if (local && data.length > 0 && data.length < 16) return null
    return { id, kind: 'zip64', raw: data.slice() }
  }
  if (id === UPATH_ID) {
    if (data.length < 5) return null
    if (((data[0] as number) << 24) >> 24 !== 0x01) return null
    return { id, kind: 'upath', crc: u32(data, 1), name: data.slice(5) }
  }
  return { id, kind: 'other' }
}

/** `ExtraFieldUtils.parse(data, local, BEST_EFFORT)` */
function parseExtra(data: Uint8Array, local: boolean): ExtraState[] {
  const v: ExtraState[] = []
  let start = 0
  while (start <= data.length - 4) {
    const id = u16(data, start)
    const length = u16(data, start + 2)
    if (start + 4 + length > data.length) {
      v.push({ id: -1, kind: 'other' })
      break
    }
    // fillAndMakeUnrecognizedOnError
    v.push(parseField(id, data.subarray(start + 4, start + 4 + length), local) ?? { id, kind: 'other' })
    start += length + 4
  }
  return v
}

/** `ZipArchiveEntry.mergeExtraFields` */
function mergeExtra(ze: ZipArchiveEntry, fields: ExtraState[], local: boolean, raw: Uint8Array): void {
  if (ze.extraFields.length === 0) {
    ze.extraFields = fields
    return
  }
  // positions des champs dans `raw` pour relire les octets d'un champ
  let start = 0
  for (const f of fields) {
    const length = start + 4 <= raw.length ? u16(raw, start + 2) : 0
    const bytes = raw.subarray(start + 4, Math.min(raw.length, start + 4 + length))
    start += length + 4
    const existing = f.id === -1 ? null : ze.getExtraField(f.id)
    if (existing === null) {
      ze.extraFields.push(f)
    } else {
      const parsed = parseField(existing.id, bytes, local)
      const idx = ze.extraFields.indexOf(existing)
      if (parsed === null) {
        ze.extraFields.splice(idx, 1)
        ze.extraFields.push({ id: existing.id, kind: 'other' })
      } else if (existing.kind === 'zip64' && parsed.kind === 'zip64') {
        // la relecture locale d'un champ ZIP64 ne change pas les tailles déjà appliquées
      } else {
        ze.extraFields[idx] = parsed
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Canal de fichier
// ---------------------------------------------------------------------------

class FileChannel {
  private pos = 0
  readonly length: number
  /** PORT: zones lues d'avance de façon asynchrone (triées par début) */
  private regions: { start: number; data: Uint8Array }[] = []
  private sorted = true

  constructor(readonly fd: number) {
    this.length = fstatSync(fd).size
  }

  /** PORT: lit d'avance [pos, pos + len) sur le pool de libuv ; les lectures comprises dans cette zone la réutilisent */
  async prefetch(pos: number, len: number): Promise<void> {
    const start = Math.max(0, pos)
    const end = Math.min(this.length, pos + len)
    if (end <= start || this.cached(start, end - start) !== null) return
    const data = new Uint8Array(end - start)
    const n = await preadFullyAsync(this.fd, data, 0, data.length, start)
    this.regions.push({ start, data: n < data.length ? data.subarray(0, n) : data })
    this.sorted = false
  }

  /** PORT: lit d'avance plusieurs zones (regroupées si elles se touchent), en parallèle */
  async prefetchAll(ranges: [number, number][]): Promise<void> {
    const r = ranges.map(([p, l]) => [Math.max(0, p), Math.min(this.length, p + l)] as [number, number]).filter(([a, b]) => b > a)
    r.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const [a, b] of r) {
      const last = merged[merged.length - 1]
      if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b)
      else merged.push([a, b])
    }
    await Promise.all(merged.map(([a, b]) => this.prefetch(a, b - a)))
  }

  /** zone préchargée contenant [pos, pos + len), et position dans cette zone */
  private cached(pos: number, len: number): { data: Uint8Array; off: number } | null {
    const regions = this.regions
    if (regions.length === 0) return null
    if (!this.sorted) {
      regions.sort((a, b) => a.start - b.start)
      this.sorted = true
    }
    // dernière zone qui commence au plus à pos (les zones ne se chevauchent pas, sauf préchargements répétés)
    let lo = 0
    let hi = regions.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if ((regions[mid] as { start: number }).start <= pos) {
        found = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    for (let i = found; i >= 0 && i >= found - 2; i--) {
      const r = regions[i] as { start: number; data: Uint8Array }
      if (pos + len <= r.start + r.data.length) return { data: r.data, off: pos - r.start }
    }
    return null
  }

  position(p?: number): number {
    if (p !== undefined) this.pos = p
    return this.pos
  }

  size(): number {
    return this.length
  }

  /** lecture positionnelle, nombre d'octets lus (0 en fin de fichier) */
  pread(buf: Uint8Array, off: number, len: number, pos: number): number {
    // PORT: zone préchargée (en fin de fichier, seulement les octets existants)
    const hit = pos >= 0 ? this.cached(pos, Math.min(len, Math.max(0, this.length - pos))) : null
    if (hit !== null) {
      const n = Math.min(len, hit.data.length - hit.off)
      buf.set(hit.data.subarray(hit.off, hit.off + n), off)
      return n
    }
    let total = 0
    while (total < len) {
      const n = readSync(this.fd, buf, off + total, len - total, pos + total)
      if (n <= 0) break
      total += n
    }
    return total
  }

  /** `IOUtils.readFully` : EOFException si incomplet */
  readFully(len: number): Uint8Array {
    const b = new Uint8Array(len)
    const n = this.pread(b, 0, len, this.pos)
    this.pos += n
    if (n < len) throw new EOFException()
    return b
  }

  /** `IOUtils.readRange` : au plus `len` octets */
  readRange(len: number): Uint8Array {
    const b = new Uint8Array(len)
    const n = this.pread(b, 0, len, this.pos)
    this.pos += n
    return n < len ? b.slice(0, n) : b
  }

  close(): void {
    this.regions = []
    closeSync(this.fd)
  }
}

function sigEquals(b: Uint8Array, sig: number[]): boolean {
  return b.length === 4 && b[0] === sig[0] && b[1] === sig[1] && b[2] === sig[2] && b[3] === sig[3]
}

/** `tryToLocateSignature` */
function tryToLocateSignature(channel: FileChannel, minDistanceFromEnd: number, maxDistanceFromEnd: number, sig: number[]): boolean {
  let off = channel.size() - minDistanceFromEnd
  const stopSearching = Math.max(0, channel.size() - maxDistanceFromEnd)
  if (off < 0) return false
  // PORT: lecture de la fin du fichier en un bloc au lieu de 4 octets par position
  const tail = new Uint8Array(off - stopSearching + 4)
  const n = channel.pread(tail, 0, tail.length, stopSearching)
  for (; off >= stopSearching; off--) {
    const i = off - stopSearching
    if (i + 4 > n) break
    if (tail[i] === sig[0] && tail[i + 1] === sig[1] && tail[i + 2] === sig[2] && tail[i + 3] === sig[3]) {
      channel.position(off)
      return true
    }
  }
  return false
}

function positionAtEndOfCentralDirectoryRecord(channel: FileChannel): boolean {
  if (!tryToLocateSignature(channel, MIN_EOCD_SIZE, MAX_EOCD_SIZE, EOCD_SIG)) throw new ZipException('Archive is not a ZIP archive')
  let found64 = false
  const position = channel.position()
  if (position > ZIP64_EOCDL_LENGTH) {
    channel.position(position - ZIP64_EOCDL_LENGTH)
    const wordBuf = channel.readFully(4)
    found64 = sigEquals(wordBuf, ZIP64_EOCD_LOC_SIG)
    if (!found64) channel.position(position)
    else channel.position(channel.position() - 4)
  }
  return found64
}

/** `openZipChannel` : contrôle du nombre de disques (maxNumberOfDisks = 1) */
function openZipChannel(path: string): FileChannel {
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch (e) {
    // FileChannel.open : NoSuchFileException, AccessDeniedException...
    throw translateError(e, path)
  }
  return checkZipChannel(new FileChannel(fd))
}

/**
 * PORT: `openZipChannel` asynchrone : ouverture sur le pool de libuv, fin du fichier (enregistrement de fin du
 * répertoire central) lue d'avance, puis le même contrôle
 */
async function openZipChannelAsync(path: string): Promise<FileChannel> {
  let fd: number
  try {
    fd = await openAsync(path, false)
  } catch (e) {
    throw translateError(e, path)
  }
  let channel: FileChannel
  try {
    channel = new FileChannel(fd)
    await channel.prefetch(channel.size() - MAX_EOCD_SIZE - ZIP64_EOCDL_LENGTH, MAX_EOCD_SIZE + ZIP64_EOCDL_LENGTH)
  } catch (e) {
    await closeAsync(fd)
    throw e
  }
  return checkZipChannel(channel)
}

/**
 * PORT: zones à lire d'avance pour ZipFile : répertoire central, puis (`entryBytes` > 0) en-tête local et début des
 * données de chaque entrée. Simple indication (lecture tolérante du répertoire central) : le vrai décodage reste celui
 * de ZipFile, qui relit de façon synchrone ce qui n'a pas été préchargé.
 */
async function prefetchZipContent(channel: FileChannel, entryBytes: number): Promise<void> {
  const eocd = channel.position()
  const word = new Uint8Array(8)
  let cdStart: number
  let cdEnd: number
  let base = 0
  // enregistrement ZIP64 : position lue dans l'enregistrement de fin ZIP64 (lecture synchrone d'au plus 56 octets)
  if (eocd >= ZIP64_EOCDL_LENGTH && channel.pread(word, 0, 4, eocd - ZIP64_EOCDL_LENGTH) === 4 && sigEquals(word.subarray(0, 4), ZIP64_EOCD_LOC_SIG)) {
    if (channel.pread(word, 0, 8, eocd - ZIP64_EOCDL_LENGTH + ZIP64_EOCDL_LOCATOR_OFFSET) !== 8) return
    const z64 = i64(word, 0)
    const rec = new Uint8Array(ZIP64_EOCD_CFD_LOCATOR_OFFSET + 8)
    if (z64 < 0 || channel.pread(rec, 0, rec.length, z64) !== rec.length) return
    cdStart = i64(rec, ZIP64_EOCD_CFD_LOCATOR_OFFSET)
    cdEnd = z64
  } else {
    const rec = new Uint8Array(MIN_EOCD_SIZE)
    if (channel.pread(rec, 0, rec.length, eocd) !== rec.length) return
    const cdLength = u32(rec, CFD_LENGTH_OFFSET)
    const cdRelative = u32(rec, CFD_LENGTH_OFFSET + 4)
    base = Math.max(eocd - cdLength - cdRelative, 0)
    cdStart = cdRelative + base
    cdEnd = eocd
  }
  if (cdStart < 0 || cdEnd <= cdStart || cdEnd > channel.size()) return
  await channel.prefetch(cdStart, cdEnd - cdStart)
  if (entryBytes <= 0) return
  const cd = new Uint8Array(cdEnd - cdStart)
  if (channel.pread(cd, 0, cd.length, cdStart) !== cd.length) return
  const ranges: [number, number][] = []
  let off = 0
  while (off + 46 <= cd.length && u32(cd, off) === CFH_SIG) {
    const nameLen = u16(cd, off + 28)
    const extraLen = u16(cd, off + 30)
    const commentLen = u16(cd, off + 32)
    const lfh = u32(cd, off + 42)
    // en-tête local (30 octets + nom + extra, supposé au plus aussi long que dans le répertoire central + 1 Kio) et
    // début des données
    if (lfh !== ZIP64_MAGIC) ranges.push([lfh + base, 30 + nameLen + extraLen + 1024 + entryBytes])
    off += 46 + nameLen + extraLen + commentLen
  }
  await channel.prefetchAll(ranges)
}

function checkZipChannel(channel: FileChannel): FileChannel {
  try {
    const is64 = positionAtEndOfCentralDirectoryRecord(channel)
    let numberOfDisks: number
    if (is64) {
      channel.position(channel.position() + 4 + 4 + 8)
      numberOfDisks = u32(channel.readFully(4), 0)
    } else {
      channel.position(channel.position() + 4)
      numberOfDisks = u16(channel.readFully(2), 0) + 1
    }
    if (numberOfDisks > 1) throw new IOException(`Too many disks for zip archive, max=1 actual=${numberOfDisks}`)
    return channel
  } catch (e) {
    channel.close()
    throw e
  }
}

// ---------------------------------------------------------------------------
// ZipFile
// ---------------------------------------------------------------------------

export class ZipFileBuilder {
  private path: string | null = null
  private useUnicodeExtraFields = true
  private ignoreLocalFileHeader = false

  setPath(path: string): this {
    this.path = path
    return this
  }

  setUseUnicodeExtraFields(b: boolean): this {
    this.useUnicodeExtraFields = b
    return this
  }

  setIgnoreLocalFileHeader(b: boolean): this {
    this.ignoreLocalFileHeader = b
    return this
  }

  get(): ZipFile {
    if (this.path === null) throw new IllegalArgumentException('origin == null')
    const channel = openZipChannel(this.path)
    return new ZipFile(channel, this.path, this.useUnicodeExtraFields, this.ignoreLocalFileHeader)
  }

  /**
   * PORT: `get()` avec lectures anticipées sur le pool de libuv (thread unique) : répertoire central, en-têtes locaux
   * (sauf `setIgnoreLocalFileHeader(true)`) et, avec `entryBytes` > 0, les `entryBytes` premiers octets des données de
   * chaque entrée (analyse d'un livre : type et dimensions de chaque page). Même résultat et mêmes exceptions que `get()`.
   */
  async getAsync({ entryBytes = 0 }: { entryBytes?: number } = {}): Promise<ZipFile> {
    if (this.path === null) throw new IllegalArgumentException('origin == null')
    const channel = await openZipChannelAsync(this.path)
    try {
      await prefetchZipContent(channel, this.ignoreLocalFileHeader ? entryBytes : Math.max(entryBytes, 1))
    } catch {
      // indication seulement : le décodage synchrone relit ce qui manque
    }
    return new ZipFile(channel, this.path, this.useUnicodeExtraFields, this.ignoreLocalFileHeader)
  }
}

export class ZipFile {
  private readonly entries: ZipArchiveEntry[] = []
  private readonly nameMap = new Map<string, ZipArchiveEntry[]>()
  private centralDirectoryStartOffset = 0
  private firstLocalFileHeaderOffset = 0
  private closed = true

  static builder(): ZipFileBuilder {
    return new ZipFileBuilder()
  }

  /** @internal utiliser `ZipFile.builder()` */
  constructor(
    private readonly archive: FileChannel,
    channelDescription: string,
    private readonly useUnicodeExtraFields: boolean,
    ignoreLocalFileHeader: boolean,
  ) {
    let success = false
    try {
      const entriesWithoutUTF8Flag = this.populateFromCentralDirectory()
      if (!ignoreLocalFileHeader) this.resolveLocalFileHeaderData(entriesWithoutUTF8Flag)
      this.fillNameMap()
      success = true
    } catch (e) {
      if (e instanceof IOException) {
        throw new IOException(`Error reading Zip content from ${channelDescription}`, e)
      }
      throw e
    } finally {
      this.closed = !success
      if (!success) this.archive.close()
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true
      this.archive.close()
    }
  }

  /** `getEntries()` : ordre du répertoire central */
  getEntries(): ZipArchiveEntry[] {
    return [...this.entries]
  }

  getEntry(name: string): ZipArchiveEntry | null {
    const e = this.nameMap.get(name)
    return e !== undefined ? (e[0] as ZipArchiveEntry) : null
  }

  private fillNameMap(): void {
    for (const ze of this.entries) {
      const l = this.nameMap.get(ze.name)
      if (l) l.push(ze)
      else this.nameMap.set(ze.name, [ze])
    }
  }

  private populateFromCentralDirectory(): Map<ZipArchiveEntry, [Uint8Array, Uint8Array]> {
    const noUTF8Flag = new Map<ZipArchiveEntry, [Uint8Array, Uint8Array]>()
    this.positionAtCentralDirectory()
    this.centralDirectoryStartOffset = this.archive.position()
    let sig = u32(this.archive.readFully(4), 0)
    if (sig !== CFH_SIG && this.startsWithLocalFileHeader()) throw new IOException("Central directory is empty, can't expand corrupt archive.")
    while (sig === CFH_SIG) {
      this.readCentralDirectoryEntry(noUTF8Flag)
      sig = u32(this.archive.readFully(4), 0)
    }
    return noUTF8Flag
  }

  private startsWithLocalFileHeader(): boolean {
    this.archive.position(this.firstLocalFileHeaderOffset)
    return sigEquals(this.archive.readFully(4), LFH_SIG)
  }

  private skipBytes(count: number): void {
    const newPosition = this.archive.position() + count
    if (newPosition > this.archive.size()) throw new EOFException()
    this.archive.position(newPosition)
  }

  private positionAtCentralDirectory(): void {
    const is64 = positionAtEndOfCentralDirectoryRecord(this.archive)
    if (!is64) this.positionAtCentralDirectory32()
    else this.positionAtCentralDirectory64()
  }

  private positionAtCentralDirectory32(): void {
    const endOfCentralDirectoryRecordOffset = this.archive.position()
    this.skipBytes(CFD_LENGTH_OFFSET)
    const centralDirectoryLength = u32(this.archive.readFully(4), 0)
    const centralDirectoryStartRelativeOffset = u32(this.archive.readFully(4), 0)
    this.firstLocalFileHeaderOffset = Math.max(endOfCentralDirectoryRecordOffset - centralDirectoryLength - centralDirectoryStartRelativeOffset, 0)
    this.archive.position(centralDirectoryStartRelativeOffset + this.firstLocalFileHeaderOffset)
  }

  private positionAtCentralDirectory64(): void {
    this.skipBytes(4)
    this.skipBytes(ZIP64_EOCDL_LOCATOR_OFFSET - 4)
    this.archive.position(i64(this.archive.readFully(8), 0))
    if (!sigEquals(this.archive.readFully(4), ZIP64_EOCD_SIG)) throw new ZipException("Archive's ZIP64 end of central directory locator is corrupt.")
    this.skipBytes(ZIP64_EOCD_CFD_LOCATOR_OFFSET - 4)
    this.archive.position(i64(this.archive.readFully(8), 0))
  }

  private readCentralDirectoryEntry(noUTF8Flag: Map<ZipArchiveEntry, [Uint8Array, Uint8Array]>): void {
    const cfhBuf = this.archive.readFully(CFH_LEN)
    let off = 0
    const ze = new ZipArchiveEntry()
    const versionMadeBy = u16(cfhBuf, off)
    off += 2
    ze.platform = (versionMadeBy >> 8) & 0x0f
    off += 2 // version required
    ze.gpFlag = u16(cfhBuf, off)
    const hasUTF8Flag = ze.usesUTF8ForNames()
    off += 2
    ze.method = u16(cfhBuf, off)
    off += 2
    off += 4 // time
    ze.crc = u32(cfhBuf, off)
    off += 4
    ze.compressedSize = u32(cfhBuf, off)
    off += 4
    ze.size = u32(cfhBuf, off)
    off += 4
    const fileNameLen = u16(cfhBuf, off)
    off += 2
    const extraLen = u16(cfhBuf, off)
    off += 2
    const commentLen = u16(cfhBuf, off)
    off += 2
    ze.diskNumberStart = u16(cfhBuf, off)
    off += 2
    off += 2 // internal attributes
    off += 4 // external attributes
    const fileName = this.archive.readRange(fileNameLen)
    if (fileName.length < fileNameLen) throw new EOFException()
    // PORT: seul l'encodage UTF-8 (défaut de ZipFile.builder()) est porté, comme l'utilise Komga
    ze.setName(decodeUtf8Java(fileName))
    ze.rawName = fileName
    ze.localHeaderOffset = u32(cfhBuf, off) + this.firstLocalFileHeaderOffset
    this.entries.push(ze)
    const cdExtraData = this.archive.readRange(extraLen)
    if (cdExtraData.length < extraLen) throw new EOFException()
    mergeExtra(ze, parseExtra(cdExtraData, false), false, cdExtraData)
    this.setSizesAndOffsetFromZip64Extra(ze)
    this.sanityCheckLFHOffset(ze)
    const comment = this.archive.readRange(commentLen)
    if (comment.length < commentLen) throw new EOFException()
    if (!hasUTF8Flag && this.useUnicodeExtraFields) noUTF8Flag.set(ze, [fileName, comment])
  }

  private setSizesAndOffsetFromZip64Extra(entry: ZipArchiveEntry): void {
    const z64 = entry.getExtraField(ZIP64_ID)
    if (z64 !== null && z64.kind !== 'zip64') throw new ZipException('archive contains unparseable zip64 extra field')
    if (z64 !== null && z64.kind === 'zip64') {
      const hasUncompressedSize = entry.size === ZIP64_MAGIC
      const hasCompressedSize = entry.compressedSize === ZIP64_MAGIC
      const hasRelativeHeaderOffset = entry.localHeaderOffset === ZIP64_MAGIC
      const hasDiskStart = entry.diskNumberStart === ZIP64_MAGIC_SHORT
      const raw = z64.raw
      const expectedLength = (hasUncompressedSize ? 8 : 0) + (hasCompressedSize ? 8 : 0) + (hasRelativeHeaderOffset ? 8 : 0) + (hasDiskStart ? 4 : 0)
      if (raw.length < expectedLength)
        throw new ZipException(`Central directory zip64 extended information extra field's length doesn't match central directory data.  Expected length ${expectedLength} but is ${raw.length}`)
      let offset = 0
      if (hasUncompressedSize) {
        const size = i64(raw, offset)
        offset += 8
        if (size < 0) throw new IOException('broken archive, entry with negative size')
        entry.size = size
      }
      if (hasCompressedSize) {
        const size = i64(raw, offset)
        offset += 8
        if (size < 0) throw new IOException('broken archive, entry with negative compressed size')
        entry.compressedSize = size
      }
      if (hasRelativeHeaderOffset) {
        entry.localHeaderOffset = i64(raw, offset)
        offset += 8
      }
      if (hasDiskStart) entry.diskNumberStart = u32(raw, offset)
    }
  }

  private sanityCheckLFHOffset(entry: ZipArchiveEntry): void {
    if (entry.diskNumberStart < 0) throw new IOException('broken archive, entry with negative disk number')
    if (entry.localHeaderOffset < 0) throw new IOException('broken archive, entry with negative local file header offset')
    if (entry.localHeaderOffset > this.centralDirectoryStartOffset) throw new IOException(`local file header for ${entry.name} starts after central directory`)
  }

  private resolveLocalFileHeaderData(entriesWithoutUTF8Flag: Map<ZipArchiveEntry, [Uint8Array, Uint8Array]>): void {
    for (const ze of this.entries) {
      const [fileNameLen, extraFieldLen] = this.setDataOffset(ze)
      this.skipBytes(fileNameLen)
      const localExtraData = this.archive.readRange(extraFieldLen)
      if (localExtraData.length < extraFieldLen) throw new EOFException()
      mergeExtra(ze, parseExtra(localExtraData, true), true, localExtraData)
      const nc = entriesWithoutUTF8Flag.get(ze)
      if (nc !== undefined) {
        // ZipUtil.setNameAndCommentFromExtraFields
        const f = ze.getExtraField(UPATH_ID)
        if (f !== null && f.kind === 'upath' && crc32(nc[0]) === f.crc) ze.setName(decodeUtf8Java(f.name))
      }
    }
  }

  private setDataOffset(entry: ZipArchiveEntry): [number, number] {
    const offset = entry.localHeaderOffset
    this.archive.position(offset + LFH_OFFSET_FOR_FILENAME_LENGTH)
    const wordBuf = this.archive.readFully(4)
    const fileNameLen = u16(wordBuf, 0)
    const extraFieldLen = u16(wordBuf, 2)
    entry.dataOffset = offset + LFH_OFFSET_FOR_FILENAME_LENGTH + 2 + 2 + fileNameLen + extraFieldLen
    if (entry.dataOffset + entry.compressedSize > this.centralDirectoryStartOffset) throw new IOException(`data for ${entry.name} overlaps with central directory.`)
    return [fileNameLen, extraFieldLen]
  }

  private getDataOffset(ze: ZipArchiveEntry): number {
    if (ze.dataOffset === -1) this.setDataOffset(ze)
    return ze.dataOffset
  }

  /**
   * PORT: `getInputStream(entry).readBytes()` avec les données de l'entrée lues sur le pool de libuv, et la
   * décompression DEFLATED faite sur le pool de libuv (même zlib, mêmes octets, mêmes exceptions)
   */
  async readEntryBytesAsync(entry: ZipArchiveEntry): Promise<Uint8Array> {
    // en-tête local (position des données, lue par getDataOffset) et données, en une lecture ; au-delà de 256 Mio,
    // lecture synchrone à la demande
    if (entry.compressedSize >= 0 && entry.compressedSize < 256 * 1024 * 1024) {
      if (entry.dataOffset === -1) await this.archive.prefetch(entry.localHeaderOffset, 30 + entry.rawName.length + 1024 + entry.compressedSize)
      else await this.archive.prefetch(entry.dataOffset, entry.compressedSize)
    }
    const stream = this.getInputStream(entry)
    try {
      if (stream instanceof DecodingInputStream) return await stream.readAllAsync()
      return stream.readBytes()
    } finally {
      stream.close()
    }
  }

  /** `getInputStream(entry)` : flux décompressé, lu à la demande */
  getInputStream(entry: ZipArchiveEntry): InputStream {
    // ZipUtil.checkRequestedFeatures
    if (entry.usesEncryption()) throw new UnsupportedZipFeatureException(`Unsupported feature encryption used in entry ${entry.name}`)
    const m = entry.method
    const supported = m === 0 || m === 1 || m === 6 || m === 8 || m === 9 || m === 12 || m === 20 || m === 93 || m === 95
    if (!supported) {
      // ZipMethod.getMethodByCode : null pour un code inconnu
      if (!ZIP_METHODS.some(([, c]) => c === m)) throw new UnsupportedZipFeatureException(`Unsupported feature compression method used in entry ${entry.name}`)
      throw new UnsupportedZipFeatureException(`Unsupported compression method ${m} (${methodName(m)}) used in entry ${entry.name}`)
    }
    const start = this.getDataOffset(entry)
    const raw = new BoundedInputStream(this.archive, start, entry.compressedSize)
    switch (m) {
      case 0:
        return raw
      case 8:
        return new DecodingInputStream(raw, entry.compressedSize, 'deflate')
      case 9:
        return new DecodingInputStream(raw, entry.compressedSize, 'deflate64')
      case 12:
        return new DecodingInputStream(raw, entry.compressedSize, 'bzip2')
      case 95:
        // xz (org.tukaani) n'est pas dans le classpath de Komga
        throw new NoClassDefFoundError('org/tukaani/xz/XZInputStream')
      case 20:
      case 93:
        // zstd-jni n'est pas dans le classpath de Komga
        throw new NoClassDefFoundError('com/github/luben/zstd/ZstdInputStream')
      default:
        // PORT: UNSHRINKING (1) et IMPLODING (6) (PKZIP 1.x) non portés
        throw new UnsupportedZipFeatureException(`Unsupported compression method ${m} (${methodName(m)}) used in entry ${entry.name}`)
    }
  }
}

/** `BoundedArchiveInputStream` sur le canal */
class BoundedInputStream extends InputStream {
  private loc: number
  private readonly end: number

  constructor(
    private readonly channel: FileChannel,
    start: number,
    remaining: number,
  ) {
    super()
    if (start < 0 || remaining < 0 || start + remaining < start) throw new IllegalArgumentException('Corrupted archive, stream boundaries are out of range')
    this.loc = start
    this.end = start + remaining
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (this.loc >= this.end) return -1
    if (len <= 0) return 0
    const n = this.channel.pread(b, off, Math.min(len, this.end - this.loc), this.loc)
    if (n <= 0) return -1
    this.loc += n
    return n
  }
}

/** lit tout le flux borné */
function readAll(s: InputStream, max: number): Uint8Array {
  const out = new Uint8Array(max)
  let n = 0
  while (n < max) {
    const r = s.read(out, n, max - n)
    if (r <= 0) break
    n += r
  }
  return n < max ? out.slice(0, n) : out
}

/**
 * Flux décompressé paresseux. DEFLATED : on décompresse d'abord des préfixes croissants des données compressées
 * (zlib, Z_SYNC_FLUSH) tant que le lecteur n'a besoin que du début de l'entrée (détection du type, dimensions),
 * puis l'entrée complète si nécessaire. Les erreurs zlib ont les mêmes messages que l'Inflater du JDK (même zlib).
 */
class DecodingInputStream extends InputStream {
  private out: Uint8Array = new Uint8Array(0)
  private pos = 0
  private complete = false
  private prefixLen = 0
  private compressed: Uint8Array | null = null

  constructor(
    private readonly raw: InputStream,
    private readonly compressedSize: number,
    private readonly kind: 'deflate' | 'deflate64' | 'bzip2',
  ) {
    super()
  }

  private compressedPrefix(len: number): Uint8Array {
    if (this.compressed === null || this.compressed.length < len) {
      const more = readAll(this.raw, len - (this.compressed?.length ?? 0))
      const c = new Uint8Array((this.compressed?.length ?? 0) + more.length)
      if (this.compressed) c.set(this.compressed)
      c.set(more, this.compressed?.length ?? 0)
      this.compressed = c
    }
    return this.compressed.length > len ? this.compressed.subarray(0, len) : this.compressed
  }

  private grow(): void {
    if (this.kind === 'deflate') {
      const next = this.prefixLen === 0 ? 16 * 1024 : this.prefixLen * 4
      if (next < this.compressedSize) {
        this.prefixLen = next
        try {
          const partial = inflateRawSync(this.compressedPrefix(next), { finishFlush: zc.Z_SYNC_FLUSH })
          if (partial.length > this.out.length) {
            this.out = partial
            return
          }
        } catch {
          // erreur dans le préfixe : décompression complète ci-dessous, qui lève l'erreur
        }
      }
      this.prefixLen = this.compressedSize
      const all = this.compressedPrefix(this.compressedSize)
      // InflaterInputStream + SequenceInputStream(is, 1 octet nul)
      const input = new Uint8Array(all.length + 1)
      input.set(all)
      try {
        this.out = inflateRawSync(input)
      } catch (e) {
        throw mapZlibError(e)
      }
      this.complete = true
      return
    }
    const all = this.compressedPrefix(this.compressedSize)
    if (this.kind === 'deflate64') {
      this.out = inflate64(all)
    } else {
      try {
        this.out = Bunzip.decode(all)
      } catch (e) {
        throw new IOException(String((e as Error).message ?? e))
      }
    }
    this.complete = true
  }

  /** PORT: lecture complète ; DEFLATED : décompression de l'entrée entière sur le pool de libuv, comme `grow()` */
  async readAllAsync(): Promise<Uint8Array> {
    if (this.pos !== 0 || this.out.length !== 0 || this.kind !== 'deflate') return this.readBytes()
    this.prefixLen = this.compressedSize
    const all = this.compressedPrefix(this.compressedSize)
    // InflaterInputStream + SequenceInputStream(is, 1 octet nul)
    const input = new Uint8Array(all.length + 1)
    input.set(all)
    let out: Uint8Array
    try {
      out = new Uint8Array(await inflateRawAsync(input))
    } catch (e) {
      throw mapZlibError(e)
    }
    this.out = out
    this.complete = true
    this.pos = out.length
    return out
  }

  read(b: Uint8Array, off = 0, len = b.length - off): number {
    if (len === 0) return 0
    while (this.pos >= this.out.length) {
      if (this.complete) return -1
      this.grow()
    }
    const n = Math.min(len, this.out.length - this.pos)
    b.set(this.out.subarray(this.pos, this.pos + n), off)
    this.pos += n
    return n
  }
}

function mapZlibError(e: unknown): Error {
  const err = e as Error & { code?: string }
  if (err.code === 'Z_BUF_ERROR') return new EOFException('Unexpected end of ZLIB input stream')
  return new ZipException(err.message ?? 'Invalid ZLIB data format')
}

// ---------------------------------------------------------------------------
// Deflate64 (ENHANCED_DEFLATED)
// ---------------------------------------------------------------------------

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 3]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 16]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 32769, 49153,
]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14]
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

type Huffman = { counts: Uint16Array; symbols: Uint16Array }

function buildHuffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(16)
  for (let i = 0; i < lengths.length; i++) counts[lengths[i] as number]!++
  counts[0] = 0
  const offs = new Uint16Array(16)
  for (let i = 1; i < 16; i++) offs[i] = (offs[i - 1] as number) + (counts[i - 1] as number)
  const symbols = new Uint16Array(lengths.length)
  for (let i = 0; i < lengths.length; i++) if (lengths[i] !== 0) symbols[offs[lengths[i] as number]!++] = i
  return { counts, symbols }
}

/**
 * Décompression Deflate64 complète (Deflate avec fenêtre de 64 Kio, code de longueur 285 à 16 bits supplémentaires,
 * codes de distance 30 et 31). PORT: Deflate64CompressorInputStream -> implémentation locale.
 */
export function inflate64(input: Uint8Array): Uint8Array {
  let out = new Uint8Array(Math.max(1024, input.length * 4))
  let outLen = 0
  let inPos = 0
  let bitBuf = 0
  let bitCnt = 0
  const ensure = (n: number): void => {
    if (outLen + n > out.length) {
      const o = new Uint8Array(Math.max(out.length * 2, outLen + n))
      o.set(out.subarray(0, outLen))
      out = o
    }
  }
  const bits = (need: number): number => {
    let val = bitBuf
    while (bitCnt < need) {
      if (inPos >= input.length) throw new EOFException('Truncated Deflate64 Stream')
      val |= (input[inPos++] as number) << bitCnt
      bitCnt += 8
    }
    bitBuf = val >>> need
    bitCnt -= need
    return val & ((1 << need) - 1)
  }
  const decode = (h: Huffman): number => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len < 16; len++) {
      code |= bits(1)
      const count = h.counts[len] as number
      if (code - count < first) return h.symbols[index + (code - first)] as number
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new IOException('Invalid Huffman code')
  }
  let last = 0
  do {
    last = bits(1)
    const type = bits(2)
    if (type === 0) {
      bitBuf = 0
      bitCnt = 0
      if (inPos + 4 > input.length) throw new EOFException('Truncated Deflate64 Stream')
      const len = u16(input, inPos)
      const nlen = u16(input, inPos + 2)
      inPos += 4
      if (len !== (~nlen & 0xffff)) throw new IOException('Illegal LEN / NLEN values')
      if (inPos + len > input.length) throw new EOFException('Truncated Deflate64 Stream')
      ensure(len)
      out.set(input.subarray(inPos, inPos + len), outLen)
      outLen += len
      inPos += len
    } else if (type === 1 || type === 2) {
      let lit: Huffman
      let dist: Huffman
      if (type === 1) {
        const l = new Uint8Array(288)
        l.fill(8, 0, 144)
        l.fill(9, 144, 256)
        l.fill(7, 256, 280)
        l.fill(8, 280, 288)
        lit = buildHuffman(l)
        dist = buildHuffman(new Uint8Array(32).fill(5))
      } else {
        const nlen = bits(5) + 257
        const ndist = bits(5) + 1
        const ncode = bits(4) + 4
        const cl = new Uint8Array(19)
        for (let i = 0; i < ncode; i++) cl[CL_ORDER[i] as number] = bits(3)
        const clh = buildHuffman(cl)
        const lengths = new Uint8Array(nlen + ndist)
        for (let i = 0; i < nlen + ndist; ) {
          const sym = decode(clh)
          if (sym < 16) lengths[i++] = sym
          else {
            let rep = 0
            let val = 0
            if (sym === 16) {
              if (i === 0) throw new IOException('Invalid repeat')
              val = lengths[i - 1] as number
              rep = 3 + bits(2)
            } else if (sym === 17) rep = 3 + bits(3)
            else rep = 11 + bits(7)
            if (i + rep > nlen + ndist) throw new IOException('Invalid repeat')
            while (rep--) lengths[i++] = val
          }
        }
        lit = buildHuffman(lengths.subarray(0, nlen))
        dist = buildHuffman(lengths.subarray(nlen))
      }
      for (;;) {
        const sym = decode(lit)
        if (sym < 256) {
          ensure(1)
          out[outLen++] = sym
        } else if (sym === 256) break
        else {
          const li = sym - 257
          if (li >= 29) throw new IOException('Illegal length symbol')
          const len = (LEN_BASE[li] as number) + bits(LEN_EXTRA[li] as number)
          const ds = decode(dist)
          if (ds >= 32) throw new IOException('Illegal distance symbol')
          const d = (DIST_BASE[ds] as number) + bits(DIST_EXTRA[ds] as number)
          if (d > outLen) throw new IOException('Illegal distance')
          ensure(len)
          for (let k = 0; k < len; k++) {
            out[outLen] = out[outLen - d] as number
            outLen++
          }
        }
      }
    } else throw new IOException(`Unsupported compression: ${type}`)
  } while (!last)
  return out.slice(0, outLen)
}
