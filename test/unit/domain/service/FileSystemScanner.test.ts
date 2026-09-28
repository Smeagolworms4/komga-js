// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/FileSystemScannerOracleTest.kt
import { Instant } from '@js-joda/core'
import { chmodSync, lstatSync, mkdirSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Book } from '../../../../src/domain/model/Book.js'
import type { ScanResult } from '../../../../src/domain/model/ScanResult.js'
import { getUpdatedTime, toLocalDateTime } from '../../../../src/domain/service/FileSystemScanner.js'
import { FileTime, readAttributes } from '../../../../src/port/java-nio-file.js'
import { OracleDb } from '../../db.js'
import { oracle, oracleBytes, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/FileSystemScanner')

const graph = new ServiceGraph(new OracleDb())
const scanner = graph.fileSystemScanner

let rootPath: string | null = null
const root = () => {
  if (rootPath === null) {
    rootPath = join(tempDir(), 'root')
    mkdirSync(rootPath, { recursive: true })
  }
  return rootPath
}
const r = (rel: string) => join(root(), rel)

/** Date de modification fixe dans le futur (la date de création ne peut pas être fixée, getUpdatedTime prend le max) */
const t1 = new Date('2030-01-02T03:04:05Z')
const t2 = new Date('2031-06-07T08:09:10Z')

function file(rel: string, size = 10, time = t1) {
  const p = r(rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, oracleBytes(size))
  utimesSync(p, time, time)
}

function touchDirs() {
  const dirs: string[] = []
  const walk = (d: string) => {
    dirs.push(d)
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      const st = lstatSync(p)
      if (st.isDirectory()) walk(p)
    }
  }
  walk(root())
  for (const d of dirs.sort().reverse()) utimesSync(d, t1, t1)
}

const bookOf = (b: Book) => [b.name, b.url, b.fileLastModified, b.fileSize, b.oneshot]
const byFirstStr = (a: unknown[], b: unknown[]) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)

function describe(res: ScanResult) {
  return [
    [...res.series.entries()]
      .map(([s, books]) => [s.name, s.url, s.fileLastModified, s.oneshot, books.map(bookOf).sort((a, b) => (String(a[1]) < String(b[1]) ? -1 : String(a[1]) > String(b[1]) ? 1 : 0))])
      .sort((a, b) => {
        const ka = String(a[1]) + String(a[0])
        const kb = String(b[1]) + String(b[0])
        return ka < kb ? -1 : ka > kb ? 1 : 0
      }),
    res.sidecars
      .map((it) => [it.url, it.parentUrl, it.lastModifiedTime, it.type, it.source])
      .sort((a, b) => {
        const ka = String(a[0]) + String(a[1])
        const kb = String(b[0]) + String(b[1])
        return ka < kb ? -1 : ka > kb ? 1 : 0
      }),
  ]
}

const scan = (block: () => unknown) => attempt(root(), block)
const fileTime = (s: string) => {
  const i = Instant.parse(s)
  return FileTime.fromNanos(BigInt(i.epochSecond()) * 1000000000n + BigInt(i.nano()))
}

func('scanRootFolder', () => {
  kase('setup', () => {
    file('a/one.cbz')
    file('a/two.CBR', 20)
    file('a/three.pdf', 30, t2)
    file('a/four.epub')
    file('a/five.zip')
    file('a/six.rar')
    file('a/notes.txt')
    file('a/.hidden.cbz')
    file('a/cover.jpg')
    file('a/one.png')
    file('a/one-2.jpg')
    file('a/two-1.webp')
    file('a/series.json')
    file('a/folder.PNG')
    file('b/sub/deep.cbz')
    file('b/series.json')
    file('b/poster.jpg')
    file('.hiddendir/x.cbz')
    file('@eaDir/y.cbz')
    file('Recycle/z.cbz')
    file('_oneshots/os1.cbz')
    file('_oneshots/os1.jpg')
    file('_oneshots/sub/os2.cbz')
    file('empty/readme.txt')
    file('ünï cödé/漫画 1.cbz')
    mkdirSync(r('links'), { recursive: true })
    symlinkSync(r('a/one.cbz'), r('links/linked.cbz'))
    symlinkSync(r('nope.cbz'), r('links/broken.cbz'))
    symlinkSync(r('b/sub'), r('linkdir'))
    file('root.cbz')
    touchDirs()
    return true
  })
  kase('defaults', () => scan(() => describe(scanner.scanRootFolder(root()))))
  kase('force directory modified time', () => scan(() => describe(scanner.scanRootFolder(root(), { forceDirectoryModifiedTime: true }))))
  kase('oneshots directory', () => scan(() => describe(scanner.scanRootFolder(root(), { oneshotsDir: '_ONESHOTS' }))))
  kase('blank oneshots directory', () => scan(() => describe(scanner.scanRootFolder(root(), { oneshotsDir: ' ' }))))
  kase('cbx only', () => scan(() => describe(scanner.scanRootFolder(root(), { scanPdf: false, scanEpub: false }))))
  kase('nothing scanned', () => scan(() => describe(scanner.scanRootFolder(root(), { scanCbx: false, scanPdf: false, scanEpub: false }))))
  kase('directory exclusions', () => scan(() => describe(scanner.scanRootFolder(root(), { directoryExclusions: new Set(['@eaDir', 'recycle', 'SUB']) }))))
  kase('exclusion matching root', () => scan(() => describe(scanner.scanRootFolder(root(), { directoryExclusions: new Set(['root']) }))))
  kase('subfolder', () => scan(() => describe(scanner.scanRootFolder(r('b')))))
  kase('missing folder', () => scan(() => scanner.scanRootFolder(r('nope'))))
  kase('file as root', () => scan(() => scanner.scanRootFolder(r('root.cbz'))))
  kase('series name of root', () => scan(() => describe(scanner.scanRootFolder(r('a')))))
})
func('preVisitDirectory', () => {
  kase('hidden and excluded directories skipped', () => scan(() => describe(scanner.scanRootFolder(root(), { directoryExclusions: new Set(['ünï']) }))[0]))
})
func('visitFile', () => {
  kase('extensions, hidden files and sidecars', () => scan(() => describe(scanner.scanRootFolder(r('a')))))
  kase('symbolic links', () => scan(() => describe(scanner.scanRootFolder(r('links')))))
})
func('postVisitDirectory', () => {
  kase('series with books only', () => scan(() => describe(scanner.scanRootFolder(r('empty')))))
  kase('oneshots sidecars', () => scan(() => describe(scanner.scanRootFolder(r('_oneshots'), { oneshotsDir: 'oneshots' }))))
})
func('visitFileFailed', () => {
  kase('unreadable directory', async () => {
    const locked = r('locked')
    mkdirSync(locked, { recursive: true })
    writeFileSync(join(locked, 'l.cbz'), oracleBytes(1))
    chmodSync(locked, 0o000)
    try {
      return await scan(() =>
        describe(scanner.scanRootFolder(root(), { directoryExclusions: new Set(['a', 'b', '_', 'ü', 'links', 'empty', 'Recycle', '@']) })),
      )
    } finally {
      chmodSync(locked, 0o755)
    }
  })
})
func('scanFile', () => {
  kase('book', () => scan(() => {
    const b = scanner.scanFile(r('a/three.pdf'))
    return b !== null ? bookOf(b) : null
  }))
  kase('any extension', () => scan(() => {
    const b = scanner.scanFile(r('a/notes.txt'))
    return b !== null ? bookOf(b) : null
  }))
  kase('missing', () => scanner.scanFile(r('nope.cbz')))
  kase('directory', () => scan(() => {
    const b = scanner.scanFile(r('a'))
    return b !== null ? bookOf(b) : null
  }))
})
func('scanBookSidecars', () => {
  kase('book with sidecars', () =>
    scan(() => scanner.scanBookSidecars(r('a/one.cbz')).map((it) => [it.url, it.parentUrl, it.lastModifiedTime, it.type, it.source]).sort(byFirstStr)),
  )
  kase('book without sidecar', () => scan(() => scanner.scanBookSidecars(r('a/three.pdf'))))
  kase('missing book in existing folder', () => scan(() => scanner.scanBookSidecars(r('a/two.cbz')).map((it) => it.url)))
  kase('missing folder', () => scan(() => scanner.scanBookSidecars(r('nope/x.cbz'))))
})
func('pathToBook', () => {
  kase('unicode name', () => scan(() => {
    const b = scanner.scanFile(r('ünï cödé/漫画 1.cbz'))
    return b !== null ? bookOf(b) : null
  }))
})
func('getUpdatedTime', () => {
  kase('modified time in the future', () => getUpdatedTime(readAttributes(r('a/three.pdf'))))
})
func('toLocalDateTime', () => {
  for (const s of ['2030-01-02T03:04:05Z', '1970-01-01T00:00:00Z', '2021-03-28T01:30:00Z', '2021-10-31T01:30:00.123456789Z']) {
    kase(s, () => toLocalDateTime(fileTime(s)))
  }
  kase('epoch millis', () => toLocalDateTime(FileTime.fromMillis(1234567890123)))
})
