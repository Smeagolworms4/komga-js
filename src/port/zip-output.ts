// Support de portage : org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream (commons-compress 1.28.0)
// sur un OutputStream non positionnable (`path.outputStream()`), et `java.util.zip.Deflater` (niveaux).
// Ce fichier n'a pas de jumeau Kotlin.
// Comme commons-compress sur un flux : en-tête local avec drapeau « data descriptor » (bit 3) et noms UTF-8 (bit 11),
// CRC et tailles écrits dans le data descriptor puis dans le répertoire central ; ZIP64 non géré (archives < 4 Go).
// Écart assumé : le découpage des blocs deflate de zlib (Node) peut différer de celui de java.util.zip.Deflater ;
// le contenu décompressé est identique.
import { closeSync, openSync, writeSync } from 'node:fs'
import { crc32, deflateRawSync } from 'node:zlib'
import { ZipArchiveEntry } from './zip.js'

/** `java.util.zip.Deflater` (constantes de niveau) */
export const Deflater = {
  NO_COMPRESSION: 0,
  BEST_SPEED: 1,
  BEST_COMPRESSION: 9,
  DEFAULT_COMPRESSION: -1,
}

/** `new ZipArchiveEntry(name)` : le port de lecture (zip.ts) n'a pas de constructeur par nom */
export function zipArchiveEntry(name: string): ZipArchiveEntry {
  const e = new ZipArchiveEntry()
  e.setName(name)
  e.method = -1 // méthode non définie : celle du flux
  return e
}

type Written = { name: Uint8Array; crc: number; csize: number; size: number; offset: number; dosTime: number; method: number; flag: number }

function dosTime(d: Date): number {
  const year = d.getFullYear()
  if (year < 1980) return (1 << 21) | (1 << 16)
  return (
    (((year - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) >>> 0
  )
}

export class ZipArchiveOutputStream {
  static readonly DEFLATED = 8
  static readonly STORED = 0

  private readonly fd: number
  private offset = 0
  private method = ZipArchiveOutputStream.DEFLATED
  private level = Deflater.DEFAULT_COMPRESSION
  private current: { entry: ZipArchiveEntry; chunks: Uint8Array[] } | null = null
  private readonly entries: Written[] = []
  private closed = false

  /** `ZipArchiveOutputStream(path.outputStream())` : le fichier est créé ou tronqué */
  constructor(path: string) {
    this.fd = openSync(path, 'w')
  }

  setMethod(method: number): void {
    this.method = method
  }

  setLevel(level: number): void {
    this.level = level
  }

  putArchiveEntry(entry: ZipArchiveEntry): void {
    if (this.current !== null) this.closeArchiveEntry()
    this.current = { entry, chunks: [] }
  }

  write(b: Uint8Array): void {
    if (this.current === null) throw new Error('No current entry')
    this.current.chunks.push(b)
  }

  private out(b: Uint8Array): void {
    writeSync(this.fd, b)
    this.offset += b.length
  }

  closeArchiveEntry(): void {
    const cur = this.current
    if (cur === null) return
    this.current = null
    const data = Buffer.concat(cur.chunks)
    const method = cur.entry.method >= 0 ? cur.entry.method : this.method
    const compressed = method === ZipArchiveOutputStream.DEFLATED ? deflateRawSync(data, { level: this.level }) : data
    const name = Buffer.from(cur.entry.getName(), 'utf8')
    const dataDescriptor = method === ZipArchiveOutputStream.DEFLATED
    const flag = (1 << 11) | (dataDescriptor ? 1 << 3 : 0)
    const w: Written = {
      name,
      crc: crc32(data) >>> 0,
      csize: compressed.length,
      size: data.length,
      offset: this.offset,
      dosTime: dosTime(new Date()),
      method,
      flag,
    }
    const lfh = Buffer.alloc(30)
    lfh.writeUInt32LE(0x04034b50, 0)
    lfh.writeUInt16LE(dataDescriptor ? 20 : 10, 4)
    lfh.writeUInt16LE(flag, 6)
    lfh.writeUInt16LE(method, 8)
    lfh.writeUInt32LE(w.dosTime, 10)
    lfh.writeUInt32LE(dataDescriptor ? 0 : w.crc, 14)
    lfh.writeUInt32LE(dataDescriptor ? 0 : w.csize, 18)
    lfh.writeUInt32LE(dataDescriptor ? 0 : w.size, 22)
    lfh.writeUInt16LE(name.length, 26)
    lfh.writeUInt16LE(0, 28)
    this.out(lfh)
    this.out(name)
    this.out(compressed)
    if (dataDescriptor) {
      const dd = Buffer.alloc(16)
      dd.writeUInt32LE(0x08074b50, 0)
      dd.writeUInt32LE(w.crc, 4)
      dd.writeUInt32LE(w.csize, 8)
      dd.writeUInt32LE(w.size, 12)
      this.out(dd)
    }
    this.entries.push(w)
  }

  private finish(): void {
    if (this.current !== null) this.closeArchiveEntry()
    const cdStart = this.offset
    for (const w of this.entries) {
      const dataDescriptor = (w.flag & (1 << 3)) !== 0
      const cfh = Buffer.alloc(46)
      cfh.writeUInt32LE(0x02014b50, 0)
      cfh.writeUInt16LE(dataDescriptor ? 20 : 10, 4)
      cfh.writeUInt16LE(dataDescriptor ? 20 : 10, 6)
      cfh.writeUInt16LE(w.flag, 8)
      cfh.writeUInt16LE(w.method, 10)
      cfh.writeUInt32LE(w.dosTime, 12)
      cfh.writeUInt32LE(w.crc, 16)
      cfh.writeUInt32LE(w.csize, 20)
      cfh.writeUInt32LE(w.size, 24)
      cfh.writeUInt16LE(w.name.length, 28)
      cfh.writeUInt32LE(w.offset, 42)
      this.out(cfh)
      this.out(w.name)
    }
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(this.entries.length, 8)
    eocd.writeUInt16LE(this.entries.length, 10)
    eocd.writeUInt32LE(this.offset - cdStart, 12)
    eocd.writeUInt32LE(cdStart, 16)
    this.out(eocd)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.finish()
    } finally {
      closeSync(this.fd)
    }
  }
}
