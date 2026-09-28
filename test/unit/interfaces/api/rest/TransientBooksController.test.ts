// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/TransientBooksControllerOracleTest.kt
import type { IncomingMessage } from 'node:http'
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../../src/domain/model/Book.js'
import { BookPage } from '../../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { MediaNotReadyException, PathContainedInPath } from '../../../../../src/domain/model/Exceptions.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MediaFile } from '../../../../../src/domain/model/MediaFile.js'
import { TransientBook } from '../../../../../src/domain/model/TransientBook.js'
import { TypedBytes } from '../../../../../src/domain/model/TypedBytes.js'
import type { BookAnalyzer } from '../../../../../src/domain/service/BookAnalyzer.js'
import type { TransientBookLifecycle } from '../../../../../src/domain/service/TransientBookLifecycle.js'
import { TransientBookCache } from '../../../../../src/infrastructure/cache/TransientBookCache.js'
import { ScanRequestDto, TransientBooksController } from '../../../../../src/interfaces/api/rest/TransientBooksController.js'
import { URL } from '../../../../../src/port/java-net.js'
import { NoSuchFileException } from '../../../../../src/port/java-nio-file.js'
import { IllegalStateException, IndexOutOfBoundsException, kFloat } from '../../../../../src/port/kotlin.js'
import { HttpServletRequest } from '../../../../../src/port/servlet.js'
import { ServletWebRequest } from '../../../../../src/port/spring-web-filter.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { Calls, FIXED, entity } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/TransientBooksController')

const calls = new Calls()
const repository = new TransientBookCache()

const tb = (id: string, path: string, mediaType: string | null = null, status: Media.Status = Media.Status.UNKNOWN) => {
  const ready = status === Media.Status.READY
  return new TransientBook({
    book: new Book({ name: id, url: new URL(`file:${path}`), fileLastModified: FIXED, fileSize: 2048, id, createdDate: FIXED }),
    media: new Media({
      status,
      mediaType,
      pages: ready
        ? [
            new BookPage({ fileName: '1.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 10, height: 20 }), fileSize: 5 }),
            new BookPage({ fileName: '2.png', mediaType: 'image/png' }),
          ]
        : [],
      files: ready ? [new MediaFile({ fileName: 'ComicInfo.xml' })] : [],
      comment: status === Media.Status.ERROR ? 'ERR_1001' : null,
      bookId: id,
      createdDate: FIXED,
      lastModifiedDate: LocalDateTime.of(2021, 5, 6, 7, 8, 9),
    }),
  })
}

/** Enregistre les appels (même faux côté Kotlin) */
const lifecycle = {
  scanAndPersist: (path: string) => {
    calls.add('scanAndPersist', path)
    if (path === '/bad') throw new PathContainedInPath('contained', 'ERR_1017')
    if (path === '/boom') throw new IllegalStateException('boom')
    const list = [tb('T2', '/t/b.cbz'), tb('T1', '/t/A.cbz'), tb('T3', '/t/a/z.pdf'), tb('T4', '/t/a b.cbz')]
    for (const it of list) repository.save(it)
    return list
  },
  analyzeAndPersist: async (t: TransientBook) => {
    calls.add('analyzeAndPersist', t.book.id)
    const status = t.book.id === 'T4' ? Media.Status.ERROR : Media.Status.READY
    const mediaType = t.book.id === 'T3' ? 'application/pdf' : 'application/zip'
    const it = tb(t.book.id, t.book.path, mediaType, status).copy({
      metadata: new TransientBook.Metadata({ number: t.book.id === 'T1' ? kFloat(1.5) : null, seriesId: t.book.id === 'T1' ? 'S1' : null }),
    })
    repository.save(it)
    return it
  },
  getBookPage: (t: TransientBook, n: number) => {
    calls.add('getBookPage', t.book.id, n)
    if (n === 99) throw new IndexOutOfBoundsException('99')
    if (n === 98) throw new MediaNotReadyException()
    if (n === 97) throw new NoSuchFileException('/t/b.cbz')
    if (n === 96) throw new IllegalStateException('other')
    if (n === 2) return new TypedBytes({ bytes: new Uint8Array([2]), mediaType: 'bad type' })
    return new TypedBytes({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' })
  },
} as unknown as TransientBookLifecycle
const analyzer = {
  getPdfPagesDynamic: (media: Media) => {
    calls.add('getPdfPagesDynamic', media.bookId)
    return [new BookPage({ fileName: '0', mediaType: 'image/jpeg', dimension: new Dimension({ width: 1, height: 2 }) })]
  },
} as unknown as BookAnalyzer
const c = new TransientBooksController(lifecycle, repository, analyzer)

const request = (ifModifiedSince: string | null = null) =>
  new ServletWebRequest(
    new HttpServletRequest(
      { method: 'GET', url: '/x', headers: ifModifiedSince === null ? {} : { 'if-modified-since': ifModifiedSince }, socket: {} } as unknown as IncomingMessage,
      Buffer.alloc(0),
    ),
  )
const scan = (path: string) => new ScanRequestDto({ path })
const take = <T>(v: T) => {
  calls.take()
  return v
}

func('scanTransientBooks', () => {
  kase('sorted by path', () => [c.scanTransientBooks(scan('/t')), calls.take()])
  kase('coded exception', () => [c.scanTransientBooks(scan('/bad')), calls.take()])
  kase('other exception', async () => [await exceptionType(() => c.scanTransientBooks(scan('/boom'))), calls.take()])
})
func('analyzeTransientBook', () => {
  kase('cbz', async () => [await c.analyzeTransientBook('T1'), calls.take()])
  kase('pdf uses dynamic pages', async () => [await c.analyzeTransientBook('T3'), calls.take()])
  kase('error', async () => take(await c.analyzeTransientBook('T4')))
  kase('not found', async () => [await exceptionType(() => c.analyzeTransientBook('NOPE')), calls.take()])
})
func('getPageByTransientBookId', () => {
  kase('page', async () => [await entity(c.getPageByTransientBookId('T1', 1, request())), calls.take()])
  kase('invalid media type', async () => take(await entity(c.getPageByTransientBookId('T1', 2, request()))))
  kase('not modified', async () => [await entity(c.getPageByTransientBookId('T1', 1, request('Thu, 06 May 2021 07:08:09 GMT'))), calls.take()])
  kase('modified since earlier', async () => take(await entity(c.getPageByTransientBookId('T1', 1, request('Wed, 05 May 2021 07:08:09 GMT')))))
  kase('page does not exist', () => c.getPageByTransientBookId('T1', 99, request()))
  kase('media not ready', () => c.getPageByTransientBookId('T1', 98, request()))
  kase('file not found', () => c.getPageByTransientBookId('T1', 97, request()))
  kase('other', async () => [await exceptionType(() => c.getPageByTransientBookId('T1', 96, request())), calls.take()])
  kase('unknown book', () => c.getPageByTransientBookId('NOPE', 1, request()))
})
func('toDto', () => {
  kase('via scan: unanalyzed', () => take(c.scanTransientBooks(scan('/t')).map((it) => it.pages.length)))
})
