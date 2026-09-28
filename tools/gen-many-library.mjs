#!/usr/bin/env node
// Génère une bibliothèque de nombreux petits CBZ (pour mesurer la RAM d'une grosse bibliothèque : index de recherche,
// caches SQLite, tas V8). Usage : node tools/gen-many-library.mjs [dossier=build/bench-many] [séries=130] [livres=50]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = new URL('..', import.meta.url).pathname
const [out = join(ROOT, 'build/bench-many'), seriesCount = '130', booksCount = '50'] = process.argv.slice(2)

// CRC-32 (zip)
const table = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b) => {
  let c = 0xffffffff
  for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
// zip sans compression
const zip = (entries) => {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, data] of entries) {
    const n = Buffer.from(name)
    const crc = crc32(data)
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt32LE(crc, 14)
    h.writeUInt32LE(data.length, 18)
    h.writeUInt32LE(data.length, 22)
    h.writeUInt16LE(n.length, 26)
    parts.push(h, n, data)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(data.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, n)
    offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(central)
  const e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0)
  e.writeUInt16LE(entries.length, 8)
  e.writeUInt16LE(entries.length, 10)
  e.writeUInt32LE(cd.length, 12)
  e.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, e])
}

const pages = []
for (let i = 0; i < 16; i++)
  pages.push(
    await sharp({ create: { width: 200, height: 300, channels: 3, background: { r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 53) % 256 } } })
      .jpeg({ quality: 80 })
      .toBuffer(),
  )
const dir = resolve(out)
for (let s = 1; s <= Number(seriesCount); s++) {
  const sd = join(dir, `Many ${String(s).padStart(3, '0')}`)
  mkdirSync(sd, { recursive: true })
  for (let b = 1; b <= Number(booksCount); b++) {
    const entries = [0, 1, 2].map((p) => [`${String(p + 1).padStart(3, '0')}.jpg`, pages[(s + b + p) % pages.length]])
    writeFileSync(join(sd, `Many ${s} - Tome ${String(b).padStart(3, '0')}.cbz`), zip(entries))
  }
}
console.log(`${seriesCount} séries x ${booksCount} livres dans ${dir}`)
