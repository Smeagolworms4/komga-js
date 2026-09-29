// ZipFile de commons-compress 1.28.0 : résultats relevés sur la vraie bibliothèque (jshell, tools/jshell-komga.sh)
// sur fixtures/zip (archives fabriquées par 7z, Info-ZIP, Python et à la main : méthodes Store/Deflate/Deflate64/
// BZip2/LZMA/PPMd/XZ/ZSTD/inconnue, chiffrement, noms UTF-8/CP437/invalides, champ Unicode Path, FAT et '\',
// ZIP64, descripteurs de données, préfixe SFX, commentaire, doublons, archives tronquées/corrompues/multi-disques),
// en mode normal (mode 0) et en mode `setIgnoreLocalFileHeader(true)` (mode 1, chemin rapide de getZipEntryBytes).
// Écart connu : IMPLODING (6) et UNSHRINKING (1) non portés (PKZIP 1.x).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ZipFile } from '../../src/port/zip.js'

const dir = fileURLToPath(new URL('./fixtures/zip', import.meta.url))
const NOT_PORTED = new Set(['implode-method.zip'])

function err(e: unknown): string {
  const x = e as Error
  return `${x.constructor.name}: ${x.message === '' ? 'null' : x.message}`
}

// mode synchrone (get, getInputStream) ou asynchrone (getAsync avec lectures anticipées, readEntryBytesAsync)
async function check(async: boolean): Promise<void> {
  const lines = readFileSync(`${dir}.java.jsonl`, 'utf8').trim().split('\n')
  const mismatches: string[] = []
  for (const line of lines) {
    const exp = JSON.parse(line.replaceAll('@DIR@', dir)) as { file: string; mode: number }
    if (NOT_PORTED.has(exp.file)) continue
    const res: Record<string, unknown> = { file: exp.file, mode: exp.mode }
    try {
      const b = ZipFile.builder().setPath(`${dir}/${exp.file}`)
      if (exp.mode === 1) b.setUseUnicodeExtraFields(true).setIgnoreLocalFileHeader(true)
      const z = async ? await b.getAsync({ entryBytes: 16 * 1024 }) : b.get()
      try {
        const entries: unknown[] = []
        for (const e of z.getEntries()) {
          const m: Record<string, unknown> = { name: e.getName(), dir: e.isDirectory(), size: e.getSize(), csize: e.getCompressedSize() }
          try {
            const bytes = async ? await z.readEntryBytesAsync(e) : z.getInputStream(e).readAllBytes()
            m.len = bytes.length
            m.crc = crc32(bytes)
          } catch (t) {
            m.err = err(t)
          }
          m.first = z.getEntry(e.getName()) === e
          entries.push(m)
        }
        res.entries = entries
      } finally {
        z.close()
      }
    } catch (t) {
      res.openErr = err(t)
      if ((t as Error).cause) res.cause = err((t as Error).cause)
    }
    if (JSON.stringify(res) !== JSON.stringify(exp)) mismatches.push(`java=${JSON.stringify(exp)}\nts  =${JSON.stringify(res)}`)
  }
  expect(mismatches).toEqual([])
  expect(lines.length).toBe(84)
}

describe('zip', () => {
  it('reads the same entries, names, sizes, contents and errors as commons-compress', () => check(false))

  it('asynchronous reads (prefetched regions, inflate on the libuv pool) give the same results', () => check(true))
})

describe('zip streams', () => {
  it('reads a deflated entry lazily: prefix, mark/reset through BufferedInputStream, then the rest', async () => {
    const { BufferedInputStream } = await import('../../src/port/java-io.js')
    const z = ZipFile.builder().setPath(`${dir}/m-Deflate.zip`).get()
    try {
      const entry = z.getEntry('big.png')!
      const full = z.getInputStream(entry).readAllBytes()
      expect(full.length).toBe(100000)
      const s = new BufferedInputStream(z.getInputStream(entry))
      s.mark(65536)
      const head = new Uint8Array(65536)
      let n = 0
      while (n < head.length) {
        const r = s.read(head, n, head.length - n)
        if (r < 0) break
        n += r
      }
      expect(n).toBe(65536)
      s.reset()
      const all = s.readAllBytes()
      expect(Buffer.from(all).equals(Buffer.from(full))).toBe(true)
      expect(Buffer.from(head).equals(Buffer.from(full.subarray(0, 65536)))).toBe(true)
    } finally {
      z.close()
    }
  })
})
