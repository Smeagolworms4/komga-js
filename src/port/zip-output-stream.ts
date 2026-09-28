// Support de portage : org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream (commons-compress 1.28.0)
// écrivant dans un flux de sortie non positionnable (`ZipArchiveOutputStream(responseStream)`, StreamingResponseBody),
// avec `setUseZip64(Zip64Mode.Always)`. Ce fichier n'a pas de jumeau Kotlin.
// Structure relevée sur Komga (téléchargement d'une série) :
// - en-tête local : version 4.5, drapeaux bit 3 (data descriptor) + bit 11 (UTF-8), CRC 0, tailles 0xFFFFFFFF,
//   extra ZIP64 (0x0001, 16 octets : tailles à 0) ;
// - data descriptor : signature, CRC, tailles sur 8 octets ;
// - répertoire central : version 4.5 / 4.5, tailles et offset 0xFFFFFFFF, extra ZIP64 (28 octets : taille, taille
//   compressée, offset, disque) ; puis enregistrement ZIP64 de fin, localisateur, et fin de répertoire classique.
// Écart assumé : les données deflate (zlib contre java.util.zip.Deflater) peuvent différer ; contenu décompressé identique.
// Seule la méthode DEFLATED est gérée en flux (c'est celle de Komga). Les écritures sont asynchrones (contre-pression).
import { once } from 'node:events'
import type { Writable } from 'node:stream'
import { type DeflateRaw, crc32, createDeflateRaw } from 'node:zlib'
import { Deflater } from './zip-output.js'
import type { ZipArchiveEntry } from './zip.js'

export { Deflater, zipArchiveEntry } from './zip-output.js'

/** `org.apache.commons.compress.archivers.zip.Zip64Mode` */
export class Zip64Mode {
  static readonly Always = 'Always'
  static readonly AlwaysWithCompatibility = 'AlwaysWithCompatibility'
  static readonly Never = 'Never'
  static readonly AsNeeded = 'AsNeeded'
}

type Written = { name: Uint8Array; crc: number; csize: number; size: number; offset: number; dosTime: number }

function dosTime(d: Date): number {
  const year = d.getFullYear()
  if (year < 1980) return (1 << 21) | (1 << 16)
  return (
    (((year - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) >>> 0
  )
}

const FLAG = (1 << 3) | (1 << 11)
const ZIP64_VERSION = 45
const u32max = (n: number): number => (n >= 0xffffffff ? 0xffffffff : n)

export class ZipArchiveOutputStream {
  static readonly DEFLATED = 8
  static readonly STORED = 0

  private offset = 0
  private method = ZipArchiveOutputStream.DEFLATED
  private level = Deflater.DEFAULT_COMPRESSION
  private current: { written: Written; deflater: DeflateRaw; pump: Promise<void> } | null = null
  private readonly entries: Written[] = []
  private closed = false

  constructor(private readonly outStream: Writable) {}

  setMethod(method: number): void {
    this.method = method
  }

  setLevel(level: number): void {
    this.level = level
  }

  // PORT: seul Zip64Mode.Always est géré (utilisé par Komga)
  setUseZip64(mode: string): void {
    if (mode !== Zip64Mode.Always) throw new Error(`Zip64Mode ${mode} not supported`)
  }

  private async out(b: Uint8Array): Promise<void> {
    this.offset += b.length
    if (!this.outStream.write(b)) {
      if (this.outStream.destroyed) throw new Error('Stream closed')
      await Promise.race([once(this.outStream, 'drain'), once(this.outStream, 'close')])
      if (this.outStream.destroyed) throw new Error('Stream closed')
    }
  }

  async putArchiveEntry(entry: ZipArchiveEntry): Promise<void> {
    if (this.current !== null) await this.closeArchiveEntry()
    if (this.method !== ZipArchiveOutputStream.DEFLATED) throw new Error('Only DEFLATED is supported on a stream')
    const name = Buffer.from(entry.getName(), 'utf8')
    const written: Written = { name, crc: 0, csize: 0, size: 0, offset: this.offset, dosTime: dosTime(new Date()) }
    const lfh = Buffer.alloc(30 + 20)
    lfh.writeUInt32LE(0x04034b50, 0)
    lfh.writeUInt16LE(ZIP64_VERSION, 4)
    lfh.writeUInt16LE(FLAG, 6)
    lfh.writeUInt16LE(ZipArchiveOutputStream.DEFLATED, 8)
    lfh.writeUInt32LE(written.dosTime, 10)
    lfh.writeUInt32LE(0, 14)
    lfh.writeUInt32LE(0xffffffff, 18)
    lfh.writeUInt32LE(0xffffffff, 22)
    lfh.writeUInt16LE(name.length, 26)
    lfh.writeUInt16LE(20, 28)
    await this.out(lfh.subarray(0, 30))
    await this.out(name)
    // extra ZIP64 : tailles inconnues (0)
    const extra = lfh.subarray(30)
    extra.writeUInt16LE(0x0001, 0)
    extra.writeUInt16LE(16, 2)
    await this.out(extra)

    const deflater = createDeflateRaw({ level: this.level })
    const pump = (async () => {
      for await (const chunk of deflater) {
        written.csize += (chunk as Buffer).length
        await this.out(chunk as Buffer)
      }
    })()
    // évite une rejection non gérée avant l'attente dans closeArchiveEntry
    pump.catch(() => {})
    this.current = { written, deflater, pump }
  }

  async write(b: Uint8Array): Promise<void> {
    const cur = this.current
    if (cur === null) throw new Error('No current entry')
    cur.written.crc = crc32(b, cur.written.crc)
    cur.written.size += b.length
    if (!cur.deflater.write(b)) await once(cur.deflater, 'drain')
  }

  async closeArchiveEntry(): Promise<void> {
    const cur = this.current
    if (cur === null) return
    this.current = null
    cur.deflater.end()
    await cur.pump
    const w = cur.written
    const dd = Buffer.alloc(24)
    dd.writeUInt32LE(0x08074b50, 0)
    dd.writeUInt32LE(w.crc >>> 0, 4)
    dd.writeBigUInt64LE(BigInt(w.csize), 8)
    dd.writeBigUInt64LE(BigInt(w.size), 16)
    await this.out(dd)
    this.entries.push(w)
  }

  private async finish(): Promise<void> {
    if (this.current !== null) await this.closeArchiveEntry()
    const cdStart = this.offset
    for (const w of this.entries) {
      const cfh = Buffer.alloc(46)
      cfh.writeUInt32LE(0x02014b50, 0)
      cfh.writeUInt16LE(ZIP64_VERSION, 4)
      cfh.writeUInt16LE(ZIP64_VERSION, 6)
      cfh.writeUInt16LE(FLAG, 8)
      cfh.writeUInt16LE(ZipArchiveOutputStream.DEFLATED, 10)
      cfh.writeUInt32LE(w.dosTime, 12)
      cfh.writeUInt32LE(w.crc >>> 0, 16)
      cfh.writeUInt32LE(0xffffffff, 20)
      cfh.writeUInt32LE(0xffffffff, 24)
      cfh.writeUInt16LE(w.name.length, 28)
      cfh.writeUInt16LE(32, 30)
      cfh.writeUInt32LE(0xffffffff, 42)
      await this.out(cfh)
      await this.out(w.name)
      const extra = Buffer.alloc(32)
      extra.writeUInt16LE(0x0001, 0)
      extra.writeUInt16LE(28, 2)
      extra.writeBigUInt64LE(BigInt(w.size), 4)
      extra.writeBigUInt64LE(BigInt(w.csize), 12)
      extra.writeBigUInt64LE(BigInt(w.offset), 20)
      await this.out(extra)
    }
    const cdSize = this.offset - cdStart
    // commons-compress (writeZip64CentralDirectory) : sans entrée, aucune entrée n'a utilisé Zip64 et les tailles
    // tiennent sur 32 bits, les enregistrements Zip64 de fin ne sont pas écrits (relevé : zip vide de 22 octets)
    if (this.entries.length > 0) await this.writeZip64Eocd(cdStart, cdSize)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    const count = this.entries.length >= 0xffff ? 0xffff : this.entries.length
    eocd.writeUInt16LE(count, 8)
    eocd.writeUInt16LE(count, 10)
    eocd.writeUInt32LE(u32max(cdSize), 12)
    eocd.writeUInt32LE(u32max(cdStart), 16)
    await this.out(eocd)
  }

  private async writeZip64Eocd(cdStart: number, cdSize: number): Promise<void> {
    const zip64EocdOffset = this.offset
    const z = Buffer.alloc(56)
    z.writeUInt32LE(0x06064b50, 0)
    z.writeBigUInt64LE(44n, 4)
    z.writeUInt16LE(ZIP64_VERSION, 12)
    z.writeUInt16LE(ZIP64_VERSION, 14)
    z.writeBigUInt64LE(BigInt(this.entries.length), 24)
    z.writeBigUInt64LE(BigInt(this.entries.length), 32)
    z.writeBigUInt64LE(BigInt(cdSize), 40)
    z.writeBigUInt64LE(BigInt(cdStart), 48)
    await this.out(z)
    const loc = Buffer.alloc(20)
    loc.writeUInt32LE(0x07064b50, 0)
    loc.writeBigUInt64LE(BigInt(zip64EocdOffset), 8)
    loc.writeUInt32LE(1, 16)
    await this.out(loc)
  }

  /** `close()` : écrit le répertoire central et ferme le flux de sortie */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.finish()
    } finally {
      this.outStream.end()
    }
  }
}
