#!/usr/bin/env node
// Génère une bibliothèque de gros CBZ (pages JPEG stockées sans compression, ~150 Mo par livre) à partir des pages
// de build/bench-library, pour mesurer la réactivité du serveur pendant un scan (tools/scan-latency-bench.mjs).
// Usage : node tools/gen-big-library.mjs [dossier=build/bench-big] [séries=4] [livres=5] [pages=190]
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const [out = join(ROOT, 'build/bench-big'), seriesCount = '4', booksCount = '5', pagesCount = '190'] = process.argv.slice(2)
const src = join(ROOT, 'build/bench-library')
const pagesDir = join(ROOT, 'build/tmp/bench-pages')

// pages sources : toutes les images des livres de build/bench-library
rmSync(pagesDir, { recursive: true, force: true })
mkdirSync(pagesDir, { recursive: true })
let n = 0
for (const s of readdirSync(src).sort())
  for (const b of readdirSync(join(src, s)).sort()) {
    const d = join(pagesDir, String(++n))
    mkdirSync(d)
    spawnSync('unzip', ['-q', '-o', join(src, s, b), '-d', d], { stdio: 'inherit' })
  }
const pages = []
for (const d of readdirSync(pagesDir)) for (const f of readdirSync(join(pagesDir, d))) pages.push(join(pagesDir, d, f))
console.log(`${pages.length} pages sources`)

const outDir = resolve(out)
mkdirSync(outDir, { recursive: true })
let offset = 0
for (let s = 1; s <= Number(seriesCount); s++) {
  const sd = join(outDir, `Big ${s}`)
  mkdirSync(sd, { recursive: true })
  for (let b = 1; b <= Number(booksCount); b++) {
    const file = join(sd, `Big ${s} - Tome ${String(b).padStart(2, '0')}.cbz`)
    rmSync(file, { force: true })
    const bookDir = join(ROOT, 'build/tmp/bench-book')
    rmSync(bookDir, { recursive: true, force: true })
    mkdirSync(bookDir)
    for (let p = 1; p <= Number(pagesCount); p++) {
      const from = pages[(offset + p) % pages.length]
      spawnSync('ln', ['-s', from, join(bookDir, `${String(p).padStart(3, '0')}.jpg`)])
    }
    offset += 37
    // -0 : pages stockées (comme la plupart des CBZ réels), -j : sans chemins
    spawnSync('zip', ['-q', '-0', '-j', file, ...readdirSync(bookDir).sort().map((f) => join(bookDir, f))], { stdio: 'inherit' })
    console.log(`${file} ${Math.round(statSync(file).size / 1e6)} Mo`)
  }
}
rmSync(join(ROOT, 'build/tmp/bench-book'), { recursive: true, force: true })
rmSync(pagesDir, { recursive: true, force: true })
