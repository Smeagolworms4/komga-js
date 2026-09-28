// Ressources des tests à oracle de mediacontainer, miroir de `Samples` côté Kotlin
// (komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/Samples.kt, branche unit-oracles).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { join } from 'node:path'
import { type ZipEntrySpec, t, writeZip, zipBytes } from './oracleZip.js'

/** Ressources de test de Komga (src/test/resources côté Kotlin) */
export function komgaRes(p: string): string {
  return fileURLToPath(new URL(`../../../resources/${p}`, import.meta.url))
}

/** Fixtures de mediacontainer (src/test/resources/oracle/mediacontainer côté Kotlin) */
export function fixture(p: string): string {
  return fileURLToPath(new URL(`../../../infrastructure/mediacontainer/fixtures/${p}`, import.meta.url))
}

/** Zips de test/port/fixtures/zip (src/test/resources/oracle/mediacontainer/zip côté Kotlin) */
export function portZip(p: string): string {
  return fileURLToPath(new URL(`../../../port/fixtures/zip/${p}`, import.meta.url))
}

/** Taille et CRC-32 des octets extraits (`digest` côté Kotlin) */
export function digest(b: Uint8Array): number[] {
  return [b.length, crc32(b)]
}

/** Résultat de `block`, ou son exception sans `path` dans le message (`pathless` côté Kotlin) */
export async function pathless(path: string, block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    const err = e as Error
    const message = err.message === undefined || err.message === '' ? null : err.message
    return ['throws', err.name, message?.replaceAll(path, '<path>') ?? null]
  }
}

type EntryValue = string | null | { resource: string } | { base64: string }

/** EPUB synthétiques (synthetic-epubs.json, même fichier côté Kotlin) : nom et entrées ZIP */
export const syntheticEpubs: [string, ZipEntrySpec[]][] = (
  JSON.parse(readFileSync(new URL('./synthetic-epubs.json', import.meta.url), 'utf8')) as [string, [string, EntryValue][]][]
).map(([name, entries]) => [
  name,
  entries.map(([entry, v]): ZipEntrySpec => {
    if (v === null) return [entry, null]
    if (typeof v === 'string') return [entry, Buffer.from(v, 'utf8')]
    if ('resource' in v) return [entry, readFileSync(komgaRes(v.resource))]
    return [entry, Buffer.from(v.base64, 'base64')]
  }),
])

/** Écrit l'EPUB synthétique `name` dans `dir` */
export function writeEpub(dir: string, name: string): string {
  return writeZip(join(dir, `${name}.epub`), syntheticEpubs.find((it) => it[0] === name)![1])
}

export const fixtureEpubs = [
  'bad-mimetype.epub', 'divina.epub', 'divina-short.epub', 'divina-text.epub', 'epub3.epub', 'kepub.epub', 'mimetype-ws.epub', 'missing-opf.epub',
  'no-rootfile.epub', 'prefixed.epub', 'reflow.epub', 'spine-images.epub', 'The Incomplete Theft - Ralph Burke.epub', 'zip-as-epub.epub',
]

/** Tous les EPUB des tests à oracle (fixtures, puis EPUB synthétiques écrits dans `dir`), avec un libellé */
export function epubFiles(dir: string): [string, string][] {
  return [
    ...fixtureEpubs.map((it): [string, string] => [`fixture ${it}`, fixture(`epub/${it}`)]),
    ['komga zip.zip', komgaRes('archives/zip.zip')],
    ...syntheticEpubs.map((it): [string, string] => [`synthetic ${it[0]}`, writeEpub(dir, it[0])]),
  ]
}

const ascii = (s: string) => Buffer.from(s, 'latin1')
const cat = (...a: Uint8Array[]) => Uint8Array.from(Buffer.concat(a))

export function contents(oracleBytes: (n: number) => Uint8Array): [string, Uint8Array][] {
  return [
    ['empty', new Uint8Array(0)],
    ['text', Buffer.from('hello world\n')],
    ['xml', Buffer.from('<?xml version="1.0"?><root/>')],
    ['html', Buffer.from('<html><body>hi</body></html>')],
    ['xhtml', Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body/></html>')],
    ['pdf', ascii('%PDF-1.4\n%âãÏÓ\n')],
    ['zip', zipBytes([t('a.txt', 'a')])],
    ['zip-empty', zipBytes([])],
    ['epub', zipBytes([t('mimetype', 'application/epub+zip'), t('META-INF/container.xml', '<container/>')])],
    ['rar4', cat(ascii('Rar!\u001a\u0007\u0000'), oracleBytes(20))],
    ['rar5', cat(ascii('Rar!\u001a\u0007\u0001\u0000'), oracleBytes(20))],
    ['7z', cat(Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]), new Uint8Array(24))],
    ['png', readFileSync(komgaRes('barcode/komga.png'))],
    ['jpeg', readFileSync(komgaRes('hashpage/e-sou.jpeg/1.jpg'))],
    ['gif', readFileSync(komgaRes('hashpage/tr.gif/1.gif'))],
    ['webp', readFileSync(komgaRes('hashpage/e-sou.webp/1.webp'))],
    ['bmp', cat(ascii('BM'), new Uint8Array(50))],
    ['tiff', cat(ascii('II*\u0000'), new Uint8Array(20))],
    ['jxl', cat(Uint8Array.from([0xff, 0x0a]), new Uint8Array(20))],
    ['avif', cat(Uint8Array.from([0, 0, 0, 0x1c]), ascii('ftypavif\u0000\u0000\u0000\u0000avifmif1miaf'))],
    ['heic', cat(Uint8Array.from([0, 0, 0, 0x18]), ascii('ftypheic\u0000\u0000\u0000\u0000mif1heic'))],
    ['random', oracleBytes(512)],
  ]
}

export const names = ['noext', 'file.cbz', 'file.zip', 'file.cbr', 'file.rar', 'file.epub', 'file.kepub.epub', 'file.pdf', 'file.jpg', 'file.png', 'file.txt', 'file.CBZ', 'file.cb7', 'file.xml']
