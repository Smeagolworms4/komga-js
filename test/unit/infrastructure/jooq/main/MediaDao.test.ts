// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/MediaDaoOracleTest.kt
import { BookPage } from '../../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../../src/domain/model/Dimension.js'
import { EpubTocEntry } from '../../../../../src/domain/model/EpubTocEntry.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../../src/domain/model/MediaExtension.js'
import { MediaFile } from '../../../../../src/domain/model/MediaFile.js'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { book, library, series, sql } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/MediaDao')

const db = new OracleDb()
const dao = db.mediaDao

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const mid = (it: number) => `M${String(it).padStart(4, '0')}`
const sorted = (l: string[]) => [...l].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

const page = (n: number, hash = '') =>
  new BookPage({ fileName: `p${n}.jpg`, mediaType: 'image/jpeg', dimension: new Dimension({ width: 100 + n, height: 200 + n }), fileHash: hash, fileSize: 1000 + n })

const epub = new MediaExtensionEpub({
  toc: [new EpubTocEntry({ title: 'Chapitre 1 — ünï', href: 'ch1.xhtml', children: [new EpubTocEntry({ title: '1.1', href: null })] })],
  landmarks: [new EpubTocEntry({ title: 'Cover', href: 'cover.xhtml' })],
  isFixedLayout: true,
  positions: [
    new R2Locator({
      href: 'ch1.xhtml',
      type: 'application/xhtml+xml',
      title: 'Chap',
      locations: new R2Locator.Location({ fragments: ['f1', 'f2'], progression: 0.5, position: 1, totalProgression: 0.25 }),
      text: new R2Locator.Text({ highlight: 'hi' }),
      koboSpan: 'kobo.1.1',
    }),
  ],
})

const full = new Media({
  status: Media.Status.READY,
  mediaType: 'application/epub+zip',
  pages: [
    new BookPage({ fileName: 'cover.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 600, height: 800 }), fileHash: 'hash0', fileSize: 12345 }),
    new BookPage({ fileName: 'Ünïcode 漫画.png', mediaType: 'image/png', dimension: null, fileHash: '', fileSize: null }),
    new BookPage({ fileName: 'p2.webp', mediaType: 'image/webp', dimension: new Dimension({ width: 0, height: 0 }), fileHash: '', fileSize: 0 }),
  ],
  pageCount: 7,
  files: [
    new MediaFile({ fileName: 'OEBPS/ch1.xhtml', mediaType: 'application/xhtml+xml', subType: MediaFile.SubType.EPUB_PAGE, fileSize: 2048 }),
    new MediaFile({ fileName: 'OEBPS/style.css', mediaType: null, subType: null, fileSize: null }),
    new MediaFile({ fileName: 'OEBPS/font.otf', mediaType: 'font/otf', subType: MediaFile.SubType.EPUB_ASSET, fileSize: 0 }),
  ],
  comment: 'Commentaire ünïcode',
  extension: epub,
  bookId: 'B2',
  epubDivinaCompatible: true,
  epubIsKepub: true,
})

const counts = () => db.rawQuery('select (select count(*) from MEDIA), (select count(*) from MEDIA_PAGE), (select count(*) from MEDIA_FILE)')

func('count', () => {
  kase('empty', () => dao.count())
})

func('insert@131', () => {
  kase('minimal', () => {
    db.libraryDao.insert(library('L1'))
    db.libraryDao.insert(library('L2'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesDao.insert(series('S2', 'L2'))
    db.bookDao.insert([...range(1, 9).map((it) => book(`B${it}`, 'S1', 'L1')), book('C1', 'S2', 'L2')])
    db.bookDao.insert(range(1, 2200).map((it) => book(mid(it), 'S1', 'L1')))
    dao.insert(new Media({ bookId: 'B1' }))
    return stable(dao.findById('B1'))
  })
  kase('all fields', () => {
    dao.insert(full)
    return stable(dao.findById('B2'))
  })
  kase('stored values', () =>
    db.rawQuery(
      'select BOOK_ID, MEDIA_TYPE, STATUS, COMMENT, PAGE_COUNT, EXTENSION_CLASS, EXTENSION_VALUE_BLOB is not null, EPUB_DIVINA_COMPATIBLE, EPUB_IS_KEPUB from MEDIA order by BOOK_ID',
    ),
  )
  kase('proxy extension is not stored', () => {
    const proxy = dao.findById('B2').extension
    dao.insert(new Media({ bookId: 'B3', extension: proxy, status: Media.Status.ERROR, comment: 'ERR_1234' }))
    return db.rawQuery("select STATUS, COMMENT, EXTENSION_CLASS, EXTENSION_VALUE_BLOB from MEDIA where BOOK_ID = 'B3'")
  })
  kase('duplicate book', () => exceptionType(() => dao.insert(new Media({ bookId: 'B1' }))))
  kase('unknown book', () => exceptionType(() => dao.insert(new Media({ bookId: 'NOPE' }))))
})

func('insert@136', () => {
  kase('empty', () => {
    dao.insert([])
    return counts()
  })
  kase('several', () => {
    dao.insert([
      new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: [page(1, 'h1'), page(2), page(3, 'h3')], bookId: 'B4' }),
      new Media({ status: Media.Status.OUTDATED, mediaType: 'application/pdf', pages: [page(1)], files: [new MediaFile({ fileName: 'x' })], bookId: 'B5' }),
      new Media({ status: Media.Status.UNSUPPORTED, mediaType: 'application/x-rar-compressed; version=5', bookId: 'B6' }),
      new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: range(1, 6).map((it) => page(it, it <= 2 ? `h${it}` : '')), bookId: 'C1' }),
    ])
    return stable([dao.findById('B4'), dao.findById('B5'), dao.findById('B6')])
  })
  kase('more than batch size with pages in every chunk', () => {
    dao.insert(
      range(1, 1100).map(
        (it) =>
          new Media({
            status: Media.Status.READY,
            mediaType: 'application/zip',
            pages: it % 1000 === 1 ? [page(it)] : [],
            files: [new MediaFile({ fileName: `f${it}` })],
            bookId: mid(it),
          }),
      ),
    )
    return counts()
  })
  kase('more than batch size with pages only in the first chunk', async () => [
    await exceptionType(() =>
      dao.insert(range(1101, 2200).map((it) => new Media({ status: Media.Status.READY, mediaType: 'application/zip', pages: it === 1101 ? [page(it)] : [], bookId: mid(it) }))),
    ),
    counts(),
  ])
})

func('insertPages', () => {
  kase('rows', () =>
    db.rawQuery("select BOOK_ID, FILE_NAME, MEDIA_TYPE, NUMBER, WIDTH, HEIGHT, FILE_HASH, FILE_SIZE from MEDIA_PAGE where BOOK_ID not like 'M%' order by BOOK_ID, NUMBER"),
  )
})

func('insertFiles', () => {
  kase('rows', () => db.rawQuery("select BOOK_ID, FILE_NAME, MEDIA_TYPE, SUB_TYPE, FILE_SIZE from MEDIA_FILE where BOOK_ID not like 'M%' order by BOOK_ID, rowid"))
})

func('findById', () => {
  kase('existing', () => stable(dao.findById('B4')))
  kase('missing', () => dao.findById('NOPE'))
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('B5')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('book without media', () => dao.findByIdOrNull('B7'))
})

func('find', () => {
  kase('pages ordered by number', () => {
    sql(db, "update MEDIA_PAGE set NUMBER = 10 - NUMBER where BOOK_ID = 'B4'")
    return dao.findById('B4').pages.map((it) => it.fileName)
  })
  kase('identical pages are merged', () => {
    sql(db, "insert into MEDIA_PAGE (BOOK_ID, FILE_NAME, MEDIA_TYPE, NUMBER, FILE_HASH) values ('B6', 'same.jpg', 'image/jpeg', 1, ''), ('B6', 'same.jpg', 'image/jpeg', 2, '')")
    return dao.findById('B6').pages.map((it) => it.fileName)
  })
  kase('orphan pages and files are ignored', () => {
    sql(db, "insert into MEDIA_PAGE (BOOK_ID, FILE_NAME, MEDIA_TYPE, NUMBER, FILE_HASH) values ('B7', 'orphan.jpg', 'image/jpeg', 0, '')")
    sql(db, "insert into MEDIA_FILE (BOOK_ID, FILE_NAME) values ('B7', 'orphan.xml')")
    return dao.findByIdOrNull('B7')
  })
  kase('files of the media', () => dao.findById('B2').files)
})

func('findExtensionByIdOrNull', () => {
  kase('epub extension', () => dao.findExtensionByIdOrNull('B2'))
  kase('no extension', () => dao.findExtensionByIdOrNull('B1'))
  kase('missing book', () => dao.findExtensionByIdOrNull('NOPE'))
  kase('book without media', () => dao.findExtensionByIdOrNull('B7'))
  kase('proxy extension in toDomain', () => dao.findById('B2').extension)
  kase('invalid blob', () => {
    sql(db, "update MEDIA set EXTENSION_CLASS = 'org.gotson.komga.domain.model.MediaExtensionEpub', EXTENSION_VALUE_BLOB = X'00010203' where BOOK_ID = 'B5'")
    return [dao.findExtensionByIdOrNull('B5'), dao.findById('B5').extension]
  })
  kase('unknown class', async () => {
    sql(db, "update MEDIA set EXTENSION_CLASS = 'org.gotson.komga.domain.model.Nope' where BOOK_ID = 'B5'")
    return [dao.findExtensionByIdOrNull('B5'), await exceptionType(() => dao.findById('B5'))]
  })
  kase('class that is not an extension', () => {
    sql(db, "update MEDIA set EXTENSION_CLASS = 'org.gotson.komga.domain.model.MediaExtension' where BOOK_ID = 'B5'")
    return [dao.findExtensionByIdOrNull('B5'), dao.findById('B5').extension]
  })
})

func('getPagesSizes', () => {
  kase('empty', () => dao.getPagesSizes([]))
  kase('some', () => dao.getPagesSizes(['B4', 'B1', 'NOPE', 'B2', 'B7']))
  kase('duplicates', () => dao.getPagesSizes(['B2', 'B2']))
  kase('more than batch size', () => {
    const it = [...dao.getPagesSizes(range(1, 2200).map(mid))]
    return [it.length, it.slice(0, 2)]
  })
})

func('findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash', () => {
  const f = (libraryId: string, mediaTypes: string[], pageHashing: number) => dao.findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(libraryId, mediaTypes, pageHashing)
  kase('no hashing required', () => f('L1', ['application/zip'], 0))
  kase('one page each side', () => sorted([...f('L1', ['application/zip', 'application/epub+zip'], 1)]).slice(0, 5))
  kase('two pages each side', () => f('L2', ['application/zip'], 2))
  kase('one page each side in other library', () => f('L2', ['application/zip'], 1))
  kase('more pages than the book has', () => f('L2', ['application/zip'], 10))
  kase('epub', () => f('L1', ['application/epub+zip'], 5))
  kase('no media type', () => f('L1', [], 5))
  kase('not ready', () => f('L1', ['application/pdf'], 5))
  kase('unknown library', () => f('NOPE', ['application/zip'], 5))
  kase('negative page hashing', () => f('L2', ['application/zip'], -1))
})

func('toDomain@318', () => {
  kase('dates', () => {
    sql(db, "update MEDIA set CREATED_DATE = '2020-03-29 00:59:59', LAST_MODIFIED_DATE = '2020-03-29 01:00:00' where BOOK_ID = 'B1'")
    const it = dao.findById('B1')
    return [it.createdDate, it.lastModifiedDate]
  })
  kase('unknown status', () => {
    sql(db, "update MEDIA set STATUS = 'BOGUS' where BOOK_ID = 'B1'")
    return exceptionType(() => dao.findById('B1'))
  })
  kase('lowercase status', () => {
    sql(db, "update MEDIA set STATUS = 'ready' where BOOK_ID = 'B1'")
    return exceptionType(() => dao.findById('B1'))
  })
})

func('toDomain@336', () => {
  kase('page with only a width', () => {
    sql(db, "update MEDIA set STATUS = 'READY' where BOOK_ID = 'B1'")
    sql(db, "insert into MEDIA_PAGE (BOOK_ID, FILE_NAME, MEDIA_TYPE, NUMBER, WIDTH, FILE_HASH) values ('B1', 'w.jpg', 'image/jpeg', 0, 50, '')")
    return dao.findById('B1').pages
  })
})

func('toDomain@345', () => {
  kase('file sub types', () => dao.findById('B2').files.map((it) => it.subType))
  kase('unknown sub type', () => {
    sql(db, "insert into MEDIA_FILE (BOOK_ID, FILE_NAME, SUB_TYPE) values ('B1', 'bad', 'EPUB_BOGUS')")
    return exceptionType(() => dao.findById('B1'))
  })
})

func('update', () => {
  kase('all fields', () => {
    sql(db, "delete from MEDIA_FILE where BOOK_ID = 'B1'")
    dao.update(
      new Media({
        status: Media.Status.READY,
        mediaType: 'application/zip',
        pages: [page(7, 'h7')],
        files: [new MediaFile({ fileName: 'ComicInfo.xml', mediaType: 'application/xml' })],
        comment: null,
        extension: new MediaExtensionEpub({ isFixedLayout: false }),
        bookId: 'B1',
        epubDivinaCompatible: true,
      }),
    )
    return [stable(dao.findById('B1')), dao.findExtensionByIdOrNull('B1')]
  })
  kase('null extension keeps the stored one', () => {
    dao.update(dao.findById('B1').copy({ extension: null, comment: 'kept' }))
    return [dao.findExtensionByIdOrNull('B1'), dao.findById('B1').comment]
  })
  kase('proxy extension keeps the stored one', () => {
    dao.update(dao.findById('B2').copy({ bookId: 'B1', pages: [], files: [] }))
    return [dao.findExtensionByIdOrNull('B1'), stable(dao.findById('B1'))]
  })
  kase('missing media', () => {
    dao.update(new Media({ bookId: 'B8', status: Media.Status.READY }))
    return [dao.findByIdOrNull('B8'), counts()]
  })
  kase('missing media with pages', () => {
    dao.update(new Media({ bookId: 'B8', pages: [page(1)] }))
    return [dao.findByIdOrNull('B8'), db.rawQuery("select count(*) from MEDIA_PAGE where BOOK_ID = 'B8'")]
  })
  kase('missing book with pages', () => exceptionType(() => dao.update(new Media({ bookId: 'NOPE', pages: [page(1)] }))))
})

func('copy', () => {
  kase('to a book with media', () => {
    dao.insert(new Media({ bookId: 'B9', comment: 'to be replaced' }))
    dao.copy('B2', 'B9')
    return [stable(dao.findById('B9')), dao.findExtensionByIdOrNull('B9')]
  })
  kase('to a book without media', () => {
    dao.copy('B2', 'B7')
    return [dao.findByIdOrNull('B7'), db.rawQuery("select count(*) from MEDIA_PAGE where BOOK_ID = 'B7'")]
  })
  kase('from a missing media', () => exceptionType(() => dao.copy('NOPE', 'B9')))
  kase('to itself', () => {
    dao.copy('B2', 'B2')
    return stable(dao.findById('B2'))
  })
})

func('delete@301', () => {
  kase('existing', () => {
    dao.delete('B2')
    return [dao.findByIdOrNull('B2'), counts()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return counts()
  })
})

func('delete@308', () => {
  kase('empty', () => {
    dao.delete([])
    return counts()
  })
  kase('several', () => {
    dao.delete(['B4', 'NOPE', 'B4', 'B7', 'B8'])
    return counts()
  })
  kase('more than batch size', () => {
    dao.delete(range(1, 2200).map(mid))
    return [counts(), db.rawQuery('select BOOK_ID from MEDIA order by BOOK_ID')]
  })
})

func('count', () => {
  kase('after deletions', () => dao.count())
})
