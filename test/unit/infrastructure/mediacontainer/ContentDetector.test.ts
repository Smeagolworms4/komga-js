// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/ContentDetectorOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { BufferedInputStream, ByteArrayInputStream, FileInputStream, use } from '../../../../src/port/java-io.js'
import { TikaConfig } from '../../../../src/port/tika.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'
import { contents, komgaRes, names } from './samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/ContentDetector')

const detector = new ContentDetector(new TikaConfig())

const resources = [
  'archives/zip.zip', 'archives/zip-copy.zip', 'archives/zip-bzip2.zip', 'archives/zip-deflate64.zip', 'archives/zip-lzma.zip',
  'archives/zip-ppmd.zip', 'archives/zip-encrypted.zip', 'archives/epub3.epub', 'archives/zip-as-epub.epub', 'archives/rar4.rar',
  'archives/rar4-solid.rar', 'archives/rar4-encrypted.rar', 'archives/rar5.rar', 'archives/rar5-solid.rar', 'archives/rar5-encrypted.rar',
  'archives/7zip.7z', 'archives/7zip-encrypted.7z', 'pdf/komga.pdf', 'barcode/komga.png', 'barcode/page_384.jpg',
  'epub/The Incomplete Theft - Ralph Burke.epub', 'epub/toc.ncx', 'epub/nav.xhtml', 'epub/1979.opf',
  'hashpage/e-drq.webp/1.webp', 'hashpage/tr.gif/1.gif', 'hashpage/m-d.jpeg/1.jpg', 'hashpage/dd.png/1.png',
]

func('detectMediaType@15', () => {
  for (const r of resources) kase(`resource ${r}`, () => detector.detectMediaType(komgaRes(r)))
  for (const [sample, bytes] of contents(oracleBytes)) {
    for (const name of names) {
      kase(`${sample} as ${name}`, () => {
        const dir = join(tempDir(), `detect-${sample}`)
        mkdirSync(dir, { recursive: true })
        const f = join(dir, name)
        writeFileSync(f, bytes)
        return detector.detectMediaType(f)
      })
    }
  }
  kase('missing file', () => exceptionType(() => detector.detectMediaType(join(tempDir(), 'missing.cbz'))))
  kase('directory', () =>
    exceptionType(() => {
      mkdirSync(join(tempDir(), 'dir'), { recursive: true })
      return detector.detectMediaType(join(tempDir(), 'dir'))
    }),
  )
})

func('detectMediaType@31', () => {
  for (const r of resources) kase(`resource ${r}`, () => use(new BufferedInputStream(new FileInputStream(komgaRes(r))), (it) => detector.detectMediaType(it)))
  for (const [sample, bytes] of contents(oracleBytes)) {
    kase(sample, () => detector.detectMediaType(new ByteArrayInputStream(bytes)))
    kase(`${sample}: stream position after detection`, () => {
      const s = new ByteArrayInputStream(bytes)
      detector.detectMediaType(s)
      return s.readBytes().length
    })
  }
})

func('isImage', () => {
  for (const m of ['image/png', 'image/', 'image', 'IMAGE/PNG', 'application/zip', '', ' image/png', 'image/webp', 'video/mp4', 'text/image/png']) {
    kase(`'${m}'`, () => detector.isImage(m))
  }
})

func('mediaTypeToExtension', () => {
  for (const m of [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/jxl', 'image/avif', 'image/heif', 'image/heic',
    'application/zip', 'application/x-rar-compressed', 'application/x-rar-compressed; version=4', 'application/x-rar-compressed; version=5',
    'application/vnd.rar', 'application/x-7z-compressed', 'application/epub+zip', 'application/pdf', 'application/vnd.comicbook+zip',
    'application/vnd.comicbook-rar', 'text/plain', 'text/html', 'application/xhtml+xml', 'application/xml', 'text/css', 'application/octet-stream',
    'application/x-dtbncx+xml', 'application/oebps-package+xml', 'IMAGE/PNG', 'Image/Jpeg', 'image/png; charset=utf-8', 'image/svg+xml',
    'font/ttf', 'application/javascript', 'unknown/type', 'image/x-unknown', '', 'foo', '/', 'image/', ' image/png',
  ]) {
    kase(`'${m}'`, () => detector.mediaTypeToExtension(m))
  }
})
