// Écriture ZIP minimale et déterministe des tests à oracle : mêmes octets que `OracleZip` côté Kotlin
// (komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/OracleZip.kt, branche unit-oracles) :
// entrées STORED, date DOS fixe (1980-01-01 00:00), pas de champ extra, drapeau UTF-8 sur chaque entrée.
// Une entrée de contenu null est un répertoire (nom terminé par '/').
import { writeFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'

export type ZipEntrySpec = [string, Uint8Array | null]

export function zipBytes(entries: ZipEntrySpec[]): Uint8Array {
  const out: number[] = []
  const central: number[] = []
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const [name, content] of entries) {
    const data = content ?? new Uint8Array(0)
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const offset = out.length
    u32(out, 0x04034b50)
    u16(out, 10)
    u16(out, 0x0800)
    u16(out, 0)
    u16(out, 0)
    u16(out, 0x21)
    u32(out, crc)
    u32(out, data.length)
    u32(out, data.length)
    u16(out, nameBytes.length)
    u16(out, 0)
    out.push(...nameBytes, ...data)

    u32(central, 0x02014b50)
    u16(central, 0x031e)
    u16(central, 10)
    u16(central, 0x0800)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0x21)
    u32(central, crc)
    u32(central, data.length)
    u32(central, data.length)
    u16(central, nameBytes.length)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0)
    u32(central, content === null ? 0x41ed0010 : 0x81a40000)
    u32(central, offset)
    central.push(...nameBytes)
  }
  const cdOffset = out.length
  out.push(...central)
  u32(out, 0x06054b50)
  u16(out, 0)
  u16(out, 0)
  u16(out, entries.length)
  u16(out, entries.length)
  u32(out, central.length)
  u32(out, cdOffset)
  u16(out, 0)
  return Uint8Array.from(out)
}

export function writeZip(path: string, entries: ZipEntrySpec[]): string {
  writeFileSync(path, zipBytes(entries))
  return path
}

/** entrée texte */
export function t(name: string, content: string): ZipEntrySpec {
  return [name, Buffer.from(content, 'utf8')]
}
