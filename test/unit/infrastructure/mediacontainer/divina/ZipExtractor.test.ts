// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/divina/ZipExtractorOracleTest.kt
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { ZipExtractor } from '../../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../../oracle.js'
import { type ZipEntrySpec, t, writeZip } from '../oracleZip.js'
import { digest, komgaRes, pathless, portZip } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/divina/ZipExtractor')

const extractor = new ZipExtractor(new ContentDetector(new TikaConfig()), new ImageAnalyzer())

const komgaArchives = ['zip.zip', 'zip-copy.zip', 'zip-bzip2.zip', 'zip-deflate64.zip', 'zip-lzma.zip', 'zip-ppmd.zip', 'zip-encrypted.zip', 'epub3.epub', 'zip-as-epub.epub']

// implode-method.zip : écart connu (IMPLODING non porté), absent de l'oracle
const portZips = [
  'badutf8.zip', 'comment.zip', 'cp437.zip', 'datadesc.zip', 'deflate-corrupt.zip', 'deflate-truncated.zip', 'dupnames.zip', 'empty-file.zip',
  'empty.zip', 'enc-aes.zip', 'encflag-stored.zip', 'enc-zipcrypto.zip', 'fat-backslash.zip', 'infozip.zip', 'lzma-method.zip',
  'multidisk.zip', 'notzip.zip', 'overlap.zip', 'prefix-rel.zip', 'prefix.zip', 'size-mismatch.zip', 'truncated-end.zip', 'truncated-mid.zip',
  'unix-backslash.zip', 'unknown-method.zip', 'upath-badcrc.zip', 'upath-badver-local.zip', 'upath-badver.zip', 'upath-central.zip',
  'upath-local.zip', 'upath-utf8flag.zip', 'utf8names.zip', 'xz-method.zip', 'zip64-forced.zip', 'zstd-method.zip',
]

function synthetic(): [string, ZipEntrySpec[]][] {
  const png = readFileSync(komgaRes('barcode/komga.png'))
  const gif = readFileSync(komgaRes('hashpage/tr.gif/1.gif'))
  return [
    ['no entry', []],
    ['natural sort', ['10.png', '2.png', '1.png', 'a10.png', 'a2.png', 'A1.png', 'b.png', 'B.png', '_1.png', '01.png'].map((it): ZipEntrySpec => [it, png])],
    ['directories', [['dir/', null], ['dir/sub/', null], ['dir/sub/p 10.png', png], ['dir/sub/p 2.png', png], ['root.gif', gif]]],
    ['only directories', [['a/', null], ['b/', null]]],
    ['mixed content', [t('notes.txt', 'hello'), ['empty.dat', new Uint8Array(0)], t('ComicInfo.xml', '<ComicInfo/>'), ['img.jpg', png], ['x.bin', oracleBytes(100)]]],
    ['unicode names', [['été/01.png', png], ['日本語.png', png], ['😀.gif', gif], ['Ä.png', png], ['ä.png', png]]],
    ['duplicate names', [['a.png', png], t('a.png', 'text')]],
    ['backslash names', [['dir\\a.png', png], ['dir\\b.png', png]]],
    ['corrupted image', [['bad.png', png.subarray(0, 40)], ['trunc.gif', gif.subarray(0, 10)]]],
  ]
}

const getEntries = (path: string, analyze: boolean) => pathless(path, () => extractor.getEntries(path, analyze))

const getEntryStreams = (path: string) =>
  pathless(path, async () => {
    const names = [...(await extractor.getEntries(path, false)).map((it) => it.name), 'missing.png', '']
    const out: unknown[] = []
    for (const name of names) out.push([name, await pathless(path, async () => digest(await extractor.getEntryStream(path, name)))])
    return out
  })

func('mediaTypes', () => {
  kase('zip', () => extractor.mediaTypes())
})

func('getEntries', () => {
  for (const a of komgaArchives) {
    kase(`${a} with dimensions`, () => getEntries(komgaRes(`archives/${a}`), true))
    kase(`${a} without dimensions`, () => getEntries(komgaRes(`archives/${a}`), false))
  }
  for (const z of portZips) kase(`fixture ${z}`, () => getEntries(portZip(z), false))
  for (const [name, entries] of synthetic()) {
    for (const analyze of [true, false]) {
      kase(`synthetic ${name} (analyze ${analyze})`, () => getEntries(writeZip(join(tempDir(), `s-${name}-${analyze}.cbz`), entries), analyze))
    }
  }
  kase('not a zip', () => {
    const p = join(tempDir(), 'text.cbz')
    writeFileSync(p, 'hello')
    return getEntries(p, false)
  })
  kase('empty file', () => {
    const p = join(tempDir(), 'empty.cbz')
    writeFileSync(p, new Uint8Array(0))
    return getEntries(p, false)
  })
  kase('missing file', () => exceptionType(() => extractor.getEntries(join(tempDir(), 'missing.cbz'), false)))
})

func('getEntryStream', () => {
  for (const a of komgaArchives) kase(a, () => getEntryStreams(komgaRes(`archives/${a}`)))
  for (const z of portZips) kase(`fixture ${z}`, () => getEntryStreams(portZip(z)))
  for (const [name, entries] of synthetic()) {
    kase(`synthetic ${name}`, () => getEntryStreams(writeZip(join(tempDir(), `e-${name}.cbz`), entries)))
  }
  kase('directory entry', async () => {
    const p = writeZip(join(tempDir(), 'dir-entry.cbz'), [['dir/', null], t('dir/a.txt', 'a')])
    const out: unknown[] = []
    for (const it of ['dir/', 'dir', 'dir/a.txt', 'DIR/A.TXT', '/dir/a.txt']) out.push([it, await pathless(p, async () => digest(await extractor.getEntryStream(p, it)))])
    return out
  })
  kase('missing file', () => exceptionType(() => extractor.getEntryStream(join(tempDir(), 'missing.cbz'), 'a')))
})
